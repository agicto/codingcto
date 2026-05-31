package execution

import (
	"context"
	"fmt"
	"os"
	"strings"
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
}

type RuntimeWorker struct {
	cfg      RuntimeWorkerConfig
	client   RuntimeAPIClient
	executor CodeExecutor
}

type RuntimeWorkerResult struct {
	Claimed         bool
	TaskID          uint
	ExecutionResult *ExecutionResult
}

func NewRuntimeWorker(cfg RuntimeWorkerConfig, client RuntimeAPIClient, executor CodeExecutor) *RuntimeWorker {
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
	return &RuntimeWorker{cfg: cfg, client: client, executor: executor}
}

func (w *RuntimeWorker) RunOnce(ctx context.Context) (*RuntimeWorkerResult, error) {
	if w.client == nil || w.executor == nil || strings.TrimSpace(w.cfg.RuntimeID) == "" {
		return nil, domain.ErrInvalidInput
	}
	heartbeat, err := w.client.Heartbeat(ctx, &RuntimeHeartbeatRequest{
		RuntimeID:       w.cfg.RuntimeID,
		Executor:        w.cfg.Executor,
		Hostname:        w.cfg.Hostname,
		Version:         w.cfg.Version,
		AvailableCLIs:   w.cfg.AvailableCLIs,
		Sandbox:         w.cfg.Sandbox,
		SkillRoots:      w.cfg.SkillRoots,
		LocalSkillCount: w.cfg.LocalSkillCount,
	})
	if err != nil {
		return nil, err
	}
	if heartbeat == nil || !heartbeat.ClaimPending {
		return &RuntimeWorkerResult{}, nil
	}

	claim, err := w.client.ClaimTask(ctx, w.cfg.RuntimeID, &ClaimAgentTaskRequest{
		Executor:  w.cfg.Executor,
		SessionID: w.cfg.SessionID,
		Workdir:   w.cfg.RepoDir,
	})
	if err != nil {
		return nil, err
	}
	if claim == nil || claim.Task == nil {
		return &RuntimeWorkerResult{}, nil
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
		Type:    "runtime_claimed",
		Tool:    w.executor.Name(),
		Content: "Runtime claimed task and is starting executor.",
	})
	result, runErr := w.executor.Run(ctx, ExecutionContext{
		RunID:      fmt.Sprintf("%d", claim.Task.RunID),
		TaskID:     taskID,
		Workdir:    workdir,
		BranchName: claim.ExecutionContext.BranchName,
		Env:        w.cfg.Env,
	}, CompiledExecutionPrompt{
		ID:         claim.Prompt.ID,
		PRNodeID:   claim.Task.PRNodeID,
		Type:       claim.Prompt.Type,
		Version:    claim.Prompt.Version,
		PromptText: claim.Prompt.PromptText,
	})
	if result == nil {
		errorLine := "executor returned no result"
		if runErr != nil && strings.TrimSpace(runErr.Error()) != "" {
			errorLine = runErr.Error()
		}
		result = &ExecutionResult{Status: "failed", Error: errorLine, ExitCode: -1}
	}
	_, _ = w.client.CreateTaskEvent(ctx, taskID, &CreateTaskEventRequest{
		Type:   "executor_result",
		Tool:   w.executor.Name(),
		Output: result.Output,
	})
	submitErr := w.submitResult(ctx, claim, workdir, result, runErr)
	if submitErr != nil {
		return result, submitErr
	}
	return result, nil
}

func (w *RuntimeWorker) submitRejectedClaim(ctx context.Context, claim *ClaimAgentTaskResponse, reason, detail string) (*ExecutionResult, error) {
	result := &ExecutionResult{Status: "failed", Error: detail, ExitCode: -1}
	return result, w.submitResult(ctx, claim, strings.TrimSpace(w.cfg.RepoDir), result, fmt.Errorf("%s", detail), reason)
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
		Status:        normalizeRuntimeResultStatus(result.Status, result.ExitCode),
		Output:        result.Output,
		Error:         result.Error,
		ExitCode:      result.ExitCode,
		FailureReason: failureReason,
	})
	return err
}

func runtimeFailureReason(result *ExecutionResult, runErr error) string {
	if result == nil {
		return "executor_failed"
	}
	if runErr == nil && result.Status == "completed" && result.ExitCode == 0 {
		return ""
	}
	if result.Status == "timeout" {
		return "executor_timeout"
	}
	return "executor_failed"
}

func normalizeRuntimeResultStatus(status string, exitCode int) string {
	status = strings.TrimSpace(status)
	switch status {
	case "completed", "failed", "timeout":
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
