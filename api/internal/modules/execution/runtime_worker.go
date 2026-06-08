package execution

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type RuntimeWorkerConfig struct {
	RuntimeID       string
	Executor        string
	Hostname        string
	Version         string
	RepositoryID    string
	RepoDir         string
	SessionID       string
	PollInterval    time.Duration
	Env             map[string]string
	AvailableCLIs   []domain.SpecForgeRuntimeCLI
	Sandbox         *domain.SpecForgeRuntimeSandbox
	SkillRoots      []domain.SpecForgeRuntimeSkillRoot
	LocalSkillCount int
	MaxConcurrency  int
}

type RuntimeWorker struct {
	cfg       RuntimeWorkerConfig
	client    RuntimeAPIClient
	connector CodingAgentConnector
}

type runtimeProgressReporter struct {
	client              RuntimeAPIClient
	taskID              uint
	runtimeID           string
	tool                string
	mu                  sync.Mutex
	suppressedLogCounts map[string]int
}

type directRuntimeProgressReporter struct {
	client              RuntimeAPIClient
	taskID              uint
	runtimeID           string
	tool                string
	mu                  sync.Mutex
	suppressedLogCounts map[string]int
}

type flushableRuntimeProgressReporter interface {
	ProgressReporter
	Flush(ctx context.Context) error
}

type RuntimeWorkerResult struct {
	Claimed         bool
	TaskID          uint
	ExecutionResult *ExecutionResult
}

type RuntimeGitSummary struct {
	Workdir       string   `json:"workdir"`
	Branch        string   `json:"branch,omitempty"`
	Head          string   `json:"head,omitempty"`
	ChangedFiles  []string `json:"changed_files,omitempty"`
	StagedFiles   []string `json:"staged_files,omitempty"`
	Untracked     []string `json:"untracked,omitempty"`
	Dirty         bool     `json:"dirty"`
	SummaryStatus string   `json:"summary_status"`
	Error         string   `json:"error,omitempty"`
}

func NewRuntimeWorker(cfg RuntimeWorkerConfig, client RuntimeAPIClient, executor CodeExecutor) *RuntimeWorker {
	return NewRuntimeWorkerWithConnector(cfg, client, NewCLIConnector(executor))
}

func NewRuntimeWorkerWithConnector(cfg RuntimeWorkerConfig, client RuntimeAPIClient, connector CodingAgentConnector) *RuntimeWorker {
	if strings.TrimSpace(cfg.Executor) == "" {
		cfg.Executor = ExecutorNameCodexCLI
	}
	if strings.TrimSpace(cfg.Hostname) == "" {
		if hostname, err := os.Hostname(); err == nil {
			cfg.Hostname = hostname
		}
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 10 * time.Second
	}
	return &RuntimeWorker{cfg: cfg, client: client, connector: connector}
}

func (w *RuntimeWorker) RunOnce(ctx context.Context) (*RuntimeWorkerResult, error) {
	if w.client == nil || w.connector == nil || strings.TrimSpace(w.cfg.RuntimeID) == "" {
		return nil, domain.ErrInvalidInput
	}
	heartbeat, err := w.client.Heartbeat(ctx, &RuntimeHeartbeatRequest{
		RuntimeID:       w.cfg.RuntimeID,
		Executor:        w.cfg.Executor,
		RepositoryID:    w.cfg.RepositoryID,
		Hostname:        w.cfg.Hostname,
		Version:         w.cfg.Version,
		AvailableCLIs:   w.cfg.AvailableCLIs,
		Sandbox:         w.cfg.Sandbox,
		SkillRoots:      w.cfg.SkillRoots,
		LocalSkillCount: w.cfg.LocalSkillCount,
		MaxConcurrency:  normalizeRuntimeMaxConcurrency(w.cfg.MaxConcurrency),
	})
	if err != nil {
		return nil, err
	}
	if heartbeat == nil || !heartbeat.ClaimPending {
		return &RuntimeWorkerResult{}, nil
	}

	claim, err := w.client.ClaimTask(ctx, w.cfg.RuntimeID, &ClaimAgentTaskRequest{
		Executor:     w.cfg.Executor,
		RepositoryID: w.cfg.RepositoryID,
		SessionID:    w.cfg.SessionID,
		Workdir:      w.cfg.RepoDir,
	})
	if err != nil {
		return nil, err
	}
	if claim == nil || (claim.Task == nil && claim.DirectTask == nil) {
		return &RuntimeWorkerResult{}, nil
	}
	if claim.DirectTask != nil {
		result, err := w.executeDirectClaim(ctx, claim)
		return &RuntimeWorkerResult{Claimed: true, TaskID: claim.DirectTask.ID, ExecutionResult: result}, err
	}

	result, err := w.executeClaim(ctx, claim)
	return &RuntimeWorkerResult{Claimed: true, TaskID: claim.Task.ID, ExecutionResult: result}, err
}

func (w *RuntimeWorker) Run(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			_, _ = w.client.Deregister(context.Background(), &RuntimeDeregisterRequest{RuntimeIDs: []string{w.cfg.RuntimeID}})
			return ctx.Err()
		default:
		}
		if _, err := w.RunOnce(ctx); err != nil {
			return err
		}
		timer := time.NewTimer(w.cfg.PollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			_, _ = w.client.Deregister(context.Background(), &RuntimeDeregisterRequest{RuntimeIDs: []string{w.cfg.RuntimeID}})
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (w *RuntimeWorker) executeClaim(ctx context.Context, claim *ClaimAgentTaskResponse) (*ExecutionResult, error) {
	if claim == nil || claim.Task == nil || claim.Prompt == nil || claim.ExecutionContext == nil {
		return nil, domain.ErrInvalidInput
	}
	taskID := claim.Task.ID
	workdir := strings.TrimSpace(w.cfg.RepoDir)
	if workdir == "" {
		workdir = strings.TrimSpace(claim.Task.Workdir)
	}
	if workdir == "" {
		return w.submitRejectedClaim(ctx, claim, "runtime_workdir_missing", "runtime repo directory is required")
	}
	targetRepositoryID := strings.TrimSpace(claim.ExecutionContext.RepositoryID)
	if configuredRepositoryID := strings.TrimSpace(w.cfg.RepositoryID); configuredRepositoryID != "" && targetRepositoryID != "" && configuredRepositoryID != targetRepositoryID {
		return w.submitRejectedClaim(ctx, claim, "runtime_repository_mismatch", fmt.Sprintf("runtime repository %s cannot execute task for %s", configuredRepositoryID, targetRepositoryID))
	}

	_, _ = w.client.CreateTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		RuntimeID: w.cfg.RuntimeID,
		Type:      "runtime_claimed",
		Tool:      w.connector.Name(),
		Content:   "Runtime claimed task and is starting executor.",
	})
	envelope, err := PRNodeTaskEnvelope(w.cfg.RuntimeID, w.cfg.Executor, w.cfg.SessionID, workdir, claim)
	if err != nil {
		return nil, err
	}
	envelope.Env = w.cfg.Env
	reporter := &runtimeProgressReporter{
		client:    w.client,
		taskID:    taskID,
		runtimeID: w.cfg.RuntimeID,
		tool:      w.connector.Name(),
	}
	result, runErr := w.connector.Run(ctx, envelope, reporter)
	if result == nil {
		errorLine := "executor returned no result"
		if runErr != nil && strings.TrimSpace(runErr.Error()) != "" {
			errorLine = runErr.Error()
		}
		result = &ExecutionResult{Status: "failed", Error: errorLine, ExitCode: -1}
	}
	if reporter != nil {
		_ = reporter.Flush(ctx)
	}
	gitSummary := collectRuntimeGitSummary(ctx, workdir)
	appendGitSummaryToResult(result, gitSummary)
	gitSummaryOutput := marshalRuntimeGitSummary(gitSummary)
	_, _ = w.client.CreateTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		RuntimeID: w.cfg.RuntimeID,
		Type:      "executor_result",
		Tool:      w.connector.Name(),
		Output:    result.Output,
	})
	_, _ = w.client.CreateTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		RuntimeID: w.cfg.RuntimeID,
		Type:      "executor_git_summary",
		Tool:      "git",
		Output:    gitSummaryOutput,
	})
	submitErr := w.submitResult(ctx, claim, workdir, result, runErr)
	if submitErr != nil {
		return result, submitErr
	}
	return result, nil
}

func (w *RuntimeWorker) executeDirectClaim(ctx context.Context, claim *ClaimAgentTaskResponse) (*ExecutionResult, error) {
	if claim == nil || claim.DirectTask == nil || claim.Prompt == nil || claim.ExecutionContext == nil {
		return nil, domain.ErrInvalidInput
	}
	taskID := claim.DirectTask.ID
	workdir := strings.TrimSpace(w.cfg.RepoDir)
	if workdir == "" {
		workdir = strings.TrimSpace(claim.DirectTask.Workdir)
	}
	if workdir == "" {
		return w.submitRejectedDirectClaim(ctx, claim, "runtime_workdir_missing", "runtime repo directory is required")
	}
	targetRepositoryID := strings.TrimSpace(claim.ExecutionContext.RepositoryID)
	if configuredRepositoryID := strings.TrimSpace(w.cfg.RepositoryID); configuredRepositoryID != "" && targetRepositoryID != "" && configuredRepositoryID != targetRepositoryID {
		return w.submitRejectedDirectClaim(ctx, claim, "runtime_repository_mismatch", fmt.Sprintf("runtime repository %s cannot execute direct task for %s", configuredRepositoryID, targetRepositoryID))
	}

	_, _ = w.client.CreateDirectTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		RuntimeID: w.cfg.RuntimeID,
		Type:      "runtime_claimed",
		Tool:      w.connector.Name(),
		Content:   "Runtime claimed direct task and is starting executor.",
	})
	runCtx, cancelRun := context.WithCancel(ctx)
	defer cancelRun()
	cancelWatcherDone := w.watchDirectTaskCancellation(runCtx, cancelRun, taskID)
	envelope, err := DirectTaskEnvelope(w.cfg.RuntimeID, w.cfg.Executor, w.cfg.SessionID, workdir, claim)
	if err != nil {
		return nil, err
	}
	envelope.Env = w.cfg.Env
	reporter := &directRuntimeProgressReporter{
		client:    w.client,
		taskID:    taskID,
		runtimeID: w.cfg.RuntimeID,
		tool:      w.connector.Name(),
	}
	result, runErr := w.connector.Run(runCtx, envelope, reporter)
	cancelRun()
	cancelledByWatcher := false
	if cancelWatcherDone != nil {
		cancelledByWatcher = <-cancelWatcherDone
	}
	if result == nil {
		errorLine := "executor returned no result"
		if runErr != nil && strings.TrimSpace(runErr.Error()) != "" {
			errorLine = runErr.Error()
		}
		result = &ExecutionResult{Status: "failed", Error: errorLine, ExitCode: -1}
	}
	if cancelledByWatcher {
		result.Status = "cancelled"
		if result.Error == "" {
			result.Error = "direct task cancelled"
		}
	}
	if reporter != nil {
		_ = reporter.Flush(ctx)
	}
	gitSummary := collectRuntimeGitSummary(ctx, workdir)
	appendGitSummaryToResult(result, gitSummary)
	_, _ = w.client.CreateDirectTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		RuntimeID: w.cfg.RuntimeID,
		Type:      "executor_git_summary",
		Tool:      "git",
		Output:    marshalRuntimeGitSummary(gitSummary),
	})
	submitErr := w.submitDirectResult(ctx, claim, workdir, result, runErr)
	if submitErr != nil {
		return result, submitErr
	}
	return result, nil
}

func (w *RuntimeWorker) submitRejectedClaim(ctx context.Context, claim *ClaimAgentTaskResponse, reason, detail string) (*ExecutionResult, error) {
	result := &ExecutionResult{Status: "failed", Error: detail, ExitCode: -1}
	return result, w.submitResult(ctx, claim, strings.TrimSpace(w.cfg.RepoDir), result, fmt.Errorf("%s", detail), reason)
}

func (w *RuntimeWorker) submitRejectedDirectClaim(ctx context.Context, claim *ClaimAgentTaskResponse, reason, detail string) (*ExecutionResult, error) {
	result := &ExecutionResult{Status: "failed", Error: detail, ExitCode: -1}
	return result, w.submitDirectResult(ctx, claim, strings.TrimSpace(w.cfg.RepoDir), result, fmt.Errorf("%s", detail), reason)
}

func (w *RuntimeWorker) watchDirectTaskCancellation(ctx context.Context, cancel context.CancelFunc, taskID uint) <-chan bool {
	done := make(chan bool, 1)
	if w == nil || w.client == nil || taskID == 0 || strings.TrimSpace(w.cfg.RuntimeID) == "" {
		done <- false
		close(done)
		return done
	}
	go func() {
		defer close(done)
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				done <- false
				return
			case <-ticker.C:
				task, err := w.client.GetDirectTask(ctx, taskID, w.cfg.RuntimeID)
				if err != nil || task == nil {
					continue
				}
				if task.Status != domain.AgentTaskStatusCancelled {
					continue
				}
				_, _ = w.client.CreateDirectTaskEvent(context.Background(), taskID, &CreateTaskEventRequest{
					RuntimeID: w.cfg.RuntimeID,
					Type:      "executor_cancel_requested",
					Tool:      w.connector.Name(),
					Content:   "Runtime received cancellation and is stopping the executor.",
				})
				cancel()
				done <- true
				return
			}
		}
	}()
	return done
}

func (w *RuntimeWorker) submitResult(ctx context.Context, claim *ClaimAgentTaskResponse, workdir string, result *ExecutionResult, runErr error, reasons ...string) error {
	if claim == nil || claim.Task == nil || result == nil {
		return domain.ErrInvalidInput
	}
	failureReason := runtimeFailureReason(result, runErr)
	if len(reasons) > 0 && strings.TrimSpace(reasons[0]) != "" {
		failureReason = strings.TrimSpace(reasons[0])
	}
	_, err := w.client.SubmitTaskResult(ctx, claim.Task.ID, &SubmitTaskResultRequest{
		RuntimeID:     w.cfg.RuntimeID,
		SessionID:     firstNonEmpty(w.cfg.SessionID, claim.Task.SessionID),
		Workdir:       workdir,
		ProcessRef:    result.ProcessRef,
		Status:        normalizeRuntimeResultStatus(result.Status, result.ExitCode),
		Output:        trimRuntimeResultField(result.Output),
		Error:         trimRuntimeResultField(result.Error),
		ExitCode:      result.ExitCode,
		FailureReason: failureReason,
	})
	return err
}

func (w *RuntimeWorker) submitDirectResult(ctx context.Context, claim *ClaimAgentTaskResponse, workdir string, result *ExecutionResult, runErr error, reasons ...string) error {
	if claim == nil || claim.DirectTask == nil || result == nil {
		return domain.ErrInvalidInput
	}
	failureReason := runtimeFailureReason(result, runErr)
	if len(reasons) > 0 && strings.TrimSpace(reasons[0]) != "" {
		failureReason = strings.TrimSpace(reasons[0])
	}
	_, err := w.client.SubmitDirectTaskResult(ctx, claim.DirectTask.ID, &SubmitTaskResultRequest{
		RuntimeID:     w.cfg.RuntimeID,
		SessionID:     firstNonEmpty(w.cfg.SessionID, claim.DirectTask.SessionID),
		Workdir:       workdir,
		ProcessRef:    result.ProcessRef,
		Status:        normalizeRuntimeResultStatus(result.Status, result.ExitCode),
		Output:        trimRuntimeResultField(result.Output),
		Error:         trimRuntimeResultField(result.Error),
		ExitCode:      result.ExitCode,
		FailureReason: failureReason,
	})
	return err
}

func collectRuntimeGitSummary(ctx context.Context, workdir string) RuntimeGitSummary {
	summary := RuntimeGitSummary{
		Workdir:       strings.TrimSpace(workdir),
		SummaryStatus: "unavailable",
	}
	if summary.Workdir == "" {
		summary.Error = "workdir is empty"
		return summary
	}
	runner := OSCommandRunner{}
	inside, err := runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"rev-parse", "--is-inside-work-tree"},
		Dir:        summary.Workdir,
	})
	if err != nil || inside.ExitCode != 0 || strings.TrimSpace(inside.Stdout) != "true" {
		summary.Error = commandResultError("inspect git worktree", inside, err)
		return summary
	}
	if branch, err := runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"branch", "--show-current"},
		Dir:        summary.Workdir,
	}); err == nil && branch.ExitCode == 0 {
		summary.Branch = strings.TrimSpace(branch.Stdout)
	}
	if head, err := runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"rev-parse", "--short", "HEAD"},
		Dir:        summary.Workdir,
	}); err == nil && head.ExitCode == 0 {
		summary.Head = strings.TrimSpace(head.Stdout)
	}
	status, err := runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"status", "--porcelain"},
		Dir:        summary.Workdir,
	})
	if err != nil || status.ExitCode != 0 {
		summary.Error = commandResultError("inspect git status", status, err)
		return summary
	}
	for _, line := range strings.Split(strings.TrimRight(status.Stdout, "\n"), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if len(line) < 4 {
			summary.ChangedFiles = append(summary.ChangedFiles, strings.TrimSpace(line))
			continue
		}
		code := line[:2]
		path := strings.TrimSpace(line[3:])
		if path == "" {
			continue
		}
		summary.ChangedFiles = append(summary.ChangedFiles, path)
		if code == "??" {
			summary.Untracked = append(summary.Untracked, path)
			continue
		}
		if code[0] != ' ' {
			summary.StagedFiles = append(summary.StagedFiles, path)
		}
	}
	summary.Dirty = len(summary.ChangedFiles) > 0
	summary.SummaryStatus = "ok"
	return summary
}

func appendGitSummaryToResult(result *ExecutionResult, summary RuntimeGitSummary) {
	if result == nil {
		return
	}
	payload := marshalRuntimeGitSummary(summary)
	if strings.TrimSpace(payload) == "" {
		return
	}
	if strings.TrimSpace(result.Output) == "" {
		result.Output = payload
		return
	}
	result.Output = strings.TrimSpace(result.Output) + "\n\n[executor_git_summary]\n" + payload
}

func marshalRuntimeGitSummary(summary RuntimeGitSummary) string {
	data, err := json.Marshal(summary)
	if err != nil {
		return ""
	}
	return string(data)
}

func commandResultError(action string, result CommandResult, err error) string {
	parts := []string{action}
	if err != nil {
		parts = append(parts, err.Error())
	}
	if strings.TrimSpace(result.Stderr) != "" {
		parts = append(parts, strings.TrimSpace(result.Stderr))
	}
	if result.ExitCode != 0 {
		parts = append(parts, fmt.Sprintf("exit_code=%d", result.ExitCode))
	}
	return strings.Join(parts, ": ")
}

func trimRuntimeResultField(value string) string {
	const maxResultFieldBytes = 200000
	if len(value) <= maxResultFieldBytes {
		return value
	}
	const marker = "\n\n[... output truncated by CodingCTO runtime ...]\n\n"
	keep := maxResultFieldBytes - len(marker)
	if keep <= 0 {
		return value[:maxResultFieldBytes]
	}
	head := keep / 2
	tail := keep - head
	return value[:head] + marker + value[len(value)-tail:]
}

func (r *runtimeProgressReporter) OnEvent(ctx context.Context, event ExecutionProgressEvent) error {
	if r == nil || r.client == nil || r.taskID == 0 || strings.TrimSpace(event.Type) == "" {
		return nil
	}
	if r.recordSuppressedNoise(event) {
		return nil
	}
	_, err := r.client.CreateTaskEvent(ctx, r.taskID, &CreateTaskEventRequest{
		RuntimeID: r.runtimeID,
		Type:      strings.TrimSpace(event.Type),
		Tool:      firstNonEmpty(strings.TrimSpace(event.Tool), r.tool),
		Content:   strings.TrimSpace(event.Content),
		Output:    strings.TrimSpace(event.Output),
	})
	return err
}

func (r *runtimeProgressReporter) Flush(ctx context.Context) error {
	if r == nil || r.client == nil || r.taskID == 0 {
		return nil
	}
	output, count := r.suppressedNoiseSummary()
	if count == 0 {
		return nil
	}
	_, err := r.client.CreateTaskEvent(ctx, r.taskID, &CreateTaskEventRequest{
		RuntimeID: r.runtimeID,
		Type:      "executor_log_suppressed",
		Tool:      firstNonEmpty(r.tool, "runtime"),
		Content:   fmt.Sprintf("Suppressed %d noisy CLI warning lines.", count),
		Output:    output,
	})
	return err
}

func (r *directRuntimeProgressReporter) OnEvent(ctx context.Context, event ExecutionProgressEvent) error {
	if r == nil || r.client == nil || r.taskID == 0 {
		return nil
	}
	if r.recordSuppressedNoise(event) {
		return nil
	}
	_, err := r.client.CreateDirectTaskEvent(ctx, r.taskID, &CreateTaskEventRequest{
		RuntimeID: r.runtimeID,
		Type:      firstNonEmpty(event.Type, "executor_progress"),
		Tool:      firstNonEmpty(event.Tool, r.tool),
		Content:   event.Content,
		Output:    event.Output,
	})
	return err
}

func (r *directRuntimeProgressReporter) Flush(ctx context.Context) error {
	if r == nil || r.client == nil || r.taskID == 0 {
		return nil
	}
	output, count := r.suppressedNoiseSummary()
	if count == 0 {
		return nil
	}
	_, err := r.client.CreateDirectTaskEvent(ctx, r.taskID, &CreateTaskEventRequest{
		RuntimeID: r.runtimeID,
		Type:      "executor_log_suppressed",
		Tool:      firstNonEmpty(r.tool, "runtime"),
		Content:   fmt.Sprintf("Suppressed %d noisy CLI warning lines.", count),
		Output:    output,
	})
	return err
}

func (r *runtimeProgressReporter) recordSuppressedNoise(event ExecutionProgressEvent) bool {
	key := noisyRuntimeProgressKey(event)
	if key == "" {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.suppressedLogCounts == nil {
		r.suppressedLogCounts = map[string]int{}
	}
	r.suppressedLogCounts[key]++
	return true
}

func (r *runtimeProgressReporter) suppressedNoiseSummary() (string, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return formatSuppressedRuntimeLogs(r.suppressedLogCounts)
}

func (r *directRuntimeProgressReporter) recordSuppressedNoise(event ExecutionProgressEvent) bool {
	key := noisyRuntimeProgressKey(event)
	if key == "" {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.suppressedLogCounts == nil {
		r.suppressedLogCounts = map[string]int{}
	}
	r.suppressedLogCounts[key]++
	return true
}

func (r *directRuntimeProgressReporter) suppressedNoiseSummary() (string, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return formatSuppressedRuntimeLogs(r.suppressedLogCounts)
}

func noisyRuntimeProgressKey(event ExecutionProgressEvent) string {
	if strings.TrimSpace(event.Type) != "executor_stderr" {
		return ""
	}
	output := strings.TrimSpace(event.Output)
	switch {
	case strings.Contains(output, "codex_core_plugins::manifest: ignoring interface.defaultPrompt"):
		return "codex plugin manifest defaultPrompt warning"
	case strings.Contains(output, "codex_core_skills::loader: ignoring interface.icon_small"):
		return "codex skill icon_small warning"
	case strings.Contains(output, "codex_core_skills::loader: ignoring interface.icon_large"):
		return "codex skill icon_large warning"
	default:
		return ""
	}
}

func formatSuppressedRuntimeLogs(counts map[string]int) (string, int) {
	if len(counts) == 0 {
		return "", 0
	}
	keys := make([]string, 0, len(counts))
	total := 0
	for key, count := range counts {
		if count <= 0 {
			continue
		}
		keys = append(keys, key)
		total += count
	}
	if total == 0 {
		return "", 0
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		lines = append(lines, fmt.Sprintf("%s: %d", key, counts[key]))
	}
	return strings.Join(lines, "\n"), total
}

func runtimeFailureReason(result *ExecutionResult, runErr error) string {
	if result == nil {
		return "executor_failed"
	}
	if runErr == nil && result.Status == "completed" && result.ExitCode == 0 {
		return ""
	}
	if result.Status == "cancelled" {
		return "user_cancelled"
	}
	if result.Status == "timeout" {
		return "executor_timeout"
	}
	return "executor_failed"
}

func normalizeRuntimeResultStatus(status string, exitCode int) string {
	status = strings.TrimSpace(status)
	switch status {
	case "completed", "failed", "timeout", "cancelled":
		return status
	}
	if exitCode == 0 {
		return "completed"
	}
	return "failed"
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
