package execution

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	ExecutorNameCodexCLI      = "codex_cli"
	ExecutorNameClaudeCodeCLI = "claude_code_cli"
	ExecutorNameKimiCLI       = "kimi_cli"
)

type CodeExecutor interface {
	Name() string
	Prepare(ctx context.Context, execContext ExecutionContext) error
	Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error)
	Cancel(ctx context.Context, runID string) error
	GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error)
}

type ProgressReportingExecutor interface {
	CodeExecutor
	SetProgressReporter(reporter ProgressReporter)
}

type ProgressReporter interface {
	OnEvent(ctx context.Context, event ExecutionProgressEvent) error
}

type ExecutionProgressEvent struct {
	Type    string
	Content string
	Output  string
	Tool    string
}

type ExecutionContext struct {
	RunID      string
	TaskID     uint
	Workdir    string
	BranchName string
	Env        map[string]string
}

type CompiledExecutionPrompt struct {
	ID         uint
	PRNodeID   uint
	Type       string
	Version    string
	PromptText string
}

type ExecutionResult struct {
	Status     string
	Output     string
	Error      string
	ExitCode   int
	DurationMs int64
	ProcessRef string
}

type ExecutorLogs struct {
	Stdout string
	Stderr string
}

type ExecutorFactoryConfig struct {
	CodexPath      string
	ClaudePath     string
	KimiPath       string
	SandboxMode    string
	ApprovalPolicy string
	Timeout        time.Duration
	ExtraArgs      []string
	GitAuthorName  string
	GitAuthorEmail string
}

type CommandSpec struct {
	Executable string
	Args       []string
	Dir        string
	Env        map[string]string
	Stdin      string
}

type CommandResult struct {
	Stdout   string
	Stderr   string
	ExitCode int
	PID      int
}

type CommandRunner interface {
	Run(ctx context.Context, spec CommandSpec) (CommandResult, error)
	Stream(
		ctx context.Context,
		spec CommandSpec,
		onStdout func(string),
		onStderr func(string),
	) (CommandResult, error)
}

type OSCommandRunner struct{}

func NewCodexCLIExecutor(cfg CodexCLIExecutorConfig, runner CommandRunner) CodeExecutor {
	return newExecutorAdapter(newCodexCLIExecutor(cfg, runner))
}

func NewClaudeCodeExecutor(cfg ClaudeCodeExecutorConfig, runner CommandRunner) CodeExecutor {
	return newExecutorAdapter(newClaudeCodeExecutor(cfg, runner))
}

func NewDefaultCodeExecutor() CodeExecutor {
	return NewExecutorFactory(ExecutorFactoryConfig{}, nil).MustCreate(ExecutorNameCodexCLI)
}

type ExecutorFactory struct {
	cfg    ExecutorFactoryConfig
	runner CommandRunner
}

func NewExecutorFactory(cfg ExecutorFactoryConfig, runner CommandRunner) *ExecutorFactory {
	if strings.TrimSpace(cfg.CodexPath) == "" {
		cfg.CodexPath = "codex"
	}
	if strings.TrimSpace(cfg.ClaudePath) == "" {
		cfg.ClaudePath = "claude"
	}
	if strings.TrimSpace(cfg.KimiPath) == "" {
		cfg.KimiPath = "kimi"
	}
	if strings.TrimSpace(cfg.SandboxMode) == "" {
		cfg.SandboxMode = "workspace-write"
	}
	if strings.TrimSpace(cfg.ApprovalPolicy) == "" {
		cfg.ApprovalPolicy = "never"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Minute
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &ExecutorFactory{cfg: cfg, runner: runner}
}

func (f *ExecutorFactory) MustCreate(name string) CodeExecutor {
	executor, err := f.Create(name)
	if err != nil {
		return newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
			ExecutablePath: f.cfg.CodexPath,
			SandboxMode:    f.cfg.SandboxMode,
			ApprovalPolicy: f.cfg.ApprovalPolicy,
			Timeout:        f.cfg.Timeout,
			ExtraArgs:      append([]string(nil), f.cfg.ExtraArgs...),
			GitAuthorName:  f.cfg.GitAuthorName,
			GitAuthorEmail: f.cfg.GitAuthorEmail,
		}, f.runner))
	}
	return executor
}

func (f *ExecutorFactory) Create(name string) (CodeExecutor, error) {
	switch strings.TrimSpace(name) {
	case "", ExecutorNameCodexCLI:
		return newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
			ExecutablePath: f.cfg.CodexPath,
			SandboxMode:    f.cfg.SandboxMode,
			ApprovalPolicy: f.cfg.ApprovalPolicy,
			Timeout:        f.cfg.Timeout,
			ExtraArgs:      append([]string(nil), f.cfg.ExtraArgs...),
			GitAuthorName:  f.cfg.GitAuthorName,
			GitAuthorEmail: f.cfg.GitAuthorEmail,
		}, f.runner)), nil
	case ExecutorNameClaudeCodeCLI:
		return newExecutorAdapter(newClaudeCodeExecutor(ClaudeCodeExecutorConfig{
			ExecutablePath: f.cfg.ClaudePath,
			Timeout:        f.cfg.Timeout,
			ExtraArgs:      append([]string(nil), f.cfg.ExtraArgs...),
			GitAuthorName:  f.cfg.GitAuthorName,
			GitAuthorEmail: f.cfg.GitAuthorEmail,
		}, f.runner)), nil
	case ExecutorNameKimiCLI:
		return newExecutorAdapter(newKimiCLIExecutor(KimiCLIExecutorConfig{
			ExecutablePath: f.cfg.KimiPath,
			Timeout:        f.cfg.Timeout,
			ExtraArgs:      append([]string(nil), f.cfg.ExtraArgs...),
			GitAuthorName:  f.cfg.GitAuthorName,
			GitAuthorEmail: f.cfg.GitAuthorEmail,
		}, f.runner)), nil
	default:
		return nil, fmt.Errorf("unknown executor %q", name)
	}
}

type executorAdapter struct {
	base     *cliExecutor
	reporter ProgressReporter
}

func newExecutorAdapter(base *cliExecutor) *executorAdapter {
	return &executorAdapter{base: base}
}

func (e *executorAdapter) Name() string {
	return e.base.name
}

func (e *executorAdapter) SetProgressReporter(reporter ProgressReporter) {
	e.reporter = reporter
}

func (e *executorAdapter) Prepare(ctx context.Context, execContext ExecutionContext) error {
	return e.base.Prepare(ctx, execContext)
}

func (e *executorAdapter) Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	return e.base.Run(ctx, execContext, prompt, e.reporter)
}

func (e *executorAdapter) Cancel(ctx context.Context, runID string) error {
	return e.base.Cancel(ctx, runID)
}

func (e *executorAdapter) GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error) {
	return e.base.GetLogs(ctx, runID)
}

type cliExecutor struct {
	name   string
	cfg    executorRunConfig
	runner CommandRunner
}

func (e *cliExecutor) Name() string {
	return e.name
}

type executorRunConfig struct {
	executablePath string
	timeout        time.Duration
	extraArgs      []string
	gitAuthorName  string
	gitAuthorEmail string
	buildArgs      func(execContext ExecutionContext, prompt CompiledExecutionPrompt) []string
	stdinPayload   func(prompt CompiledExecutionPrompt) string
}

type CodexCLIExecutorConfig struct {
	ExecutablePath string
	SandboxMode    string
	ApprovalPolicy string
	Timeout        time.Duration
	ExtraArgs      []string
	GitAuthorName  string
	GitAuthorEmail string
}

type ClaudeCodeExecutorConfig struct {
	ExecutablePath string
	Timeout        time.Duration
	ExtraArgs      []string
	GitAuthorName  string
	GitAuthorEmail string
}

type KimiCLIExecutorConfig struct {
	ExecutablePath string
	Timeout        time.Duration
	ExtraArgs      []string
	GitAuthorName  string
	GitAuthorEmail string
}

func newCodexCLIExecutor(cfg CodexCLIExecutorConfig, runner CommandRunner) *cliExecutor {
	if strings.TrimSpace(cfg.ExecutablePath) == "" {
		cfg.ExecutablePath = "codex"
	}
	if strings.TrimSpace(cfg.SandboxMode) == "" {
		cfg.SandboxMode = "workspace-write"
	}
	if strings.TrimSpace(cfg.ApprovalPolicy) == "" {
		cfg.ApprovalPolicy = "never"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Minute
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &cliExecutor{
		name: ExecutorNameCodexCLI,
		cfg: executorRunConfig{
			executablePath: cfg.ExecutablePath,
			timeout:        cfg.Timeout,
			extraArgs:      append([]string(nil), cfg.ExtraArgs...),
			gitAuthorName:  cfg.GitAuthorName,
			gitAuthorEmail: cfg.GitAuthorEmail,
			buildArgs: func(execContext ExecutionContext, prompt CompiledExecutionPrompt) []string {
				args := []string{}
				if strings.EqualFold(strings.TrimSpace(cfg.SandboxMode), "danger-full-access") &&
					strings.EqualFold(strings.TrimSpace(cfg.ApprovalPolicy), "never") {
					args = append(args, "exec", "--json", "--cd", execContext.Workdir)
					args = append(args, "--dangerously-bypass-approvals-and-sandbox")
				} else {
					args = append(args, "--ask-for-approval", cfg.ApprovalPolicy)
					args = append(args, "exec", "--json", "--cd", execContext.Workdir)
					args = append(args, "--sandbox", cfg.SandboxMode)
				}
				args = append(args, "--skip-git-repo-check")
				args = append(args, cfg.ExtraArgs...)
				args = append(args, "-")
				return args
			},
			stdinPayload: func(prompt CompiledExecutionPrompt) string {
				return prompt.PromptText
			},
		},
		runner: runner,
	}
}

func newClaudeCodeExecutor(cfg ClaudeCodeExecutorConfig, runner CommandRunner) *cliExecutor {
	if strings.TrimSpace(cfg.ExecutablePath) == "" {
		cfg.ExecutablePath = "claude"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Minute
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &cliExecutor{
		name: ExecutorNameClaudeCodeCLI,
		cfg: executorRunConfig{
			executablePath: cfg.ExecutablePath,
			timeout:        cfg.Timeout,
			extraArgs:      append([]string(nil), cfg.ExtraArgs...),
			gitAuthorName:  cfg.GitAuthorName,
			gitAuthorEmail: cfg.GitAuthorEmail,
			buildArgs: func(execContext ExecutionContext, prompt CompiledExecutionPrompt) []string {
				args := []string{
					"--print",
					"--output-format", "stream-json",
					"--verbose",
				}
				args = append(args, cfg.ExtraArgs...)
				return args
			},
			stdinPayload: func(prompt CompiledExecutionPrompt) string {
				return prompt.PromptText
			},
		},
		runner: runner,
	}
}

func newKimiCLIExecutor(cfg KimiCLIExecutorConfig, runner CommandRunner) *cliExecutor {
	if strings.TrimSpace(cfg.ExecutablePath) == "" {
		cfg.ExecutablePath = "kimi"
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 30 * time.Minute
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &cliExecutor{
		name: ExecutorNameKimiCLI,
		cfg: executorRunConfig{
			executablePath: cfg.ExecutablePath,
			timeout:        cfg.Timeout,
			extraArgs:      append([]string(nil), cfg.ExtraArgs...),
			gitAuthorName:  cfg.GitAuthorName,
			gitAuthorEmail: cfg.GitAuthorEmail,
			buildArgs: func(execContext ExecutionContext, prompt CompiledExecutionPrompt) []string {
				args := []string{
					"-p", prompt.PromptText,
					"--output-format", "stream-json",
				}
				args = append(args, cfg.ExtraArgs...)
				return args
			},
			stdinPayload: func(prompt CompiledExecutionPrompt) string {
				return ""
			},
		},
		runner: runner,
	}
}

func (e *cliExecutor) Prepare(ctx context.Context, execContext ExecutionContext) error {
	if strings.TrimSpace(execContext.Workdir) == "" {
		return fmt.Errorf("%s executor: workdir is required", e.prefix())
	}
	branch := strings.TrimSpace(execContext.BranchName)
	if branch == "" {
		return nil
	}
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("%s executor: branch name is invalid", e.prefix())
	}
	if result, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"fetch", "origin", branch},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	}); err != nil || result.ExitCode != 0 {
		if isMissingRemoteBranchFailure(result, err) {
			if fallback, fallbackErr := e.runner.Run(ctx, CommandSpec{
				Executable: "git",
				Args:       []string{"checkout", "-B", branch},
				Dir:        execContext.Workdir,
				Env:        execContext.Env,
			}); fallbackErr != nil || fallback.ExitCode != 0 {
				return e.commandFailure("checkout local branch fallback", fallback, fallbackErr)
			}
			return nil
		}
		return e.commandFailure("fetch branch", result, err)
	}
	if result, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"checkout", "-B", branch, "origin/" + branch},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	}); err != nil || result.ExitCode != 0 {
		return e.commandFailure("checkout branch", result, err)
	}
	return nil
}

func (e *cliExecutor) Run(
	ctx context.Context,
	execContext ExecutionContext,
	prompt CompiledExecutionPrompt,
	reporter ProgressReporter,
) (*ExecutionResult, error) {
	if err := e.Prepare(ctx, execContext); err != nil {
		return nil, err
	}
	if strings.TrimSpace(prompt.PromptText) == "" {
		return nil, fmt.Errorf("%s executor: prompt text is required", e.prefix())
	}
	runCtx, cancel := context.WithTimeout(ctx, e.cfg.timeout)
	defer cancel()

	e.emit(runCtx, reporter, ExecutionProgressEvent{
		Type:    "executor_preparing_repo",
		Content: "preparing_repo",
		Tool:    e.name,
	})

	args := e.cfg.buildArgs(execContext, prompt)
	start := time.Now()
	stdoutLines := []string{}
	stderrLines := []string{}
	var stdoutMu sync.Mutex
	var stderrMu sync.Mutex
	processRef := ""
	result, err := e.runner.Stream(
		runCtx,
		CommandSpec{
			Executable: e.cfg.executablePath,
			Args:       args,
			Dir:        execContext.Workdir,
			Env:        execContext.Env,
			Stdin:      e.cfg.stdinPayload(prompt),
		},
		func(line string) {
			line = strings.TrimRight(line, "\r\n")
			if strings.TrimSpace(line) == "" {
				return
			}
			stdoutMu.Lock()
			stdoutLines = append(stdoutLines, line)
			stdoutMu.Unlock()
			e.emit(runCtx, reporter, ExecutionProgressEvent{
				Type:   "executor_stdout",
				Output: line,
				Tool:   e.name,
			})
		},
		func(line string) {
			line = strings.TrimRight(line, "\r\n")
			if strings.TrimSpace(line) == "" {
				return
			}
			stderrMu.Lock()
			stderrLines = append(stderrLines, line)
			stderrMu.Unlock()
			e.emit(runCtx, reporter, ExecutionProgressEvent{
				Type:   "executor_stderr",
				Output: line,
				Tool:   e.name,
			})
		},
	)
	durationMs := time.Since(start).Milliseconds()
	if result.PID > 0 {
		processRef = fmt.Sprintf("pid:%d", result.PID)
		e.emit(runCtx, reporter, ExecutionProgressEvent{
			Type:    "executor_started",
			Content: processRef,
			Tool:    e.name,
		})
	}

	stdout := strings.TrimSpace(strings.Join(stdoutLines, "\n"))
	stderr := strings.TrimSpace(strings.Join(stderrLines, "\n"))
	status := "completed"
	if err != nil || result.ExitCode != 0 {
		status = "failed"
	}
	if runCtx.Err() == context.DeadlineExceeded {
		status = "timeout"
	} else if runCtx.Err() == context.Canceled {
		status = "cancelled"
	}

	if err == nil && result.ExitCode == 0 && strings.TrimSpace(execContext.BranchName) != "" {
		e.emit(runCtx, reporter, ExecutionProgressEvent{
			Type:    "executor_phase_changed",
			Content: "committing_changes",
			Tool:    e.name,
		})
		if deliveryErr := e.commitAndPush(ctx, execContext, prompt); deliveryErr != nil {
			status = "failed"
			if stderr == "" {
				stderr = deliveryErr.Error()
			} else {
				stderr += "\n" + deliveryErr.Error()
			}
			err = deliveryErr
			result.ExitCode = -1
		}
	}

	e.emit(runCtx, reporter, ExecutionProgressEvent{
		Type:    "executor_result",
		Content: status,
		Output:  stdout,
		Tool:    e.name,
	})

	return &ExecutionResult{
		Status:     status,
		Output:     stdout,
		Error:      stderrOrErr(stderr, err),
		ExitCode:   result.ExitCode,
		DurationMs: durationMs,
		ProcessRef: processRef,
	}, err
}

func (e *cliExecutor) commitAndPush(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) error {
	branch := strings.TrimSpace(execContext.BranchName)
	if branch == "" || strings.HasPrefix(branch, "-") {
		return fmt.Errorf("%s executor: branch name is invalid", e.prefix())
	}
	status, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"status", "--porcelain"},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	})
	if err != nil || status.ExitCode != 0 {
		return e.commandFailure("inspect worktree changes", status, err)
	}
	if strings.TrimSpace(status.Stdout) != "" {
		if result, runErr := e.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"add", "-A"},
			Dir:        execContext.Workdir,
			Env:        execContext.Env,
		}); runErr != nil || result.ExitCode != 0 {
			return e.commandFailure("stage executor changes", result, runErr)
		}
		diff, runErr := e.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"diff", "--cached", "--quiet"},
			Dir:        execContext.Workdir,
			Env:        execContext.Env,
		})
		if runErr == nil && diff.ExitCode == 0 {
			return fmt.Errorf("%s executor: executor changed no tracked content", e.prefix())
		}
		if diff.ExitCode != 1 && runErr != nil {
			return e.commandFailure("inspect staged executor changes", diff, runErr)
		}
		if diff.ExitCode != 1 && runErr == nil {
			return e.commandFailure("inspect staged executor changes", diff, nil)
		}
		if result, runErr := e.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       e.gitCommitArgs(prompt),
			Dir:        execContext.Workdir,
			Env:        execContext.Env,
		}); runErr != nil || result.ExitCode != 0 {
			return e.commandFailure("commit executor changes", result, runErr)
		}
	}
	ahead, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"rev-list", "--count", "origin/" + branch + "..HEAD"},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	})
	if err != nil || ahead.ExitCode != 0 {
		return e.commandFailure("inspect branch commits", ahead, err)
	}
	commitCount, parseErr := strconv.Atoi(strings.TrimSpace(ahead.Stdout))
	if parseErr != nil {
		return fmt.Errorf("%s executor: parse branch commit count: %w", e.prefix(), parseErr)
	}
	if commitCount == 0 {
		return fmt.Errorf("%s executor: executor produced no commits for %s", e.prefix(), branch)
	}
	if result, runErr := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"push", "origin", "HEAD:" + branch},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	}); runErr != nil || result.ExitCode != 0 {
		return e.commandFailure("push executor branch", result, runErr)
	}
	return nil
}

func (e *cliExecutor) gitCommitArgs(prompt CompiledExecutionPrompt) []string {
	authorName := strings.TrimSpace(e.cfg.gitAuthorName)
	if authorName == "" {
		authorName = "CodingCTO"
	}
	authorEmail := strings.TrimSpace(e.cfg.gitAuthorEmail)
	if authorEmail == "" {
		authorEmail = "codingcto@users.noreply.github.com"
	}
	message := fmt.Sprintf("Implement %s task", strings.TrimSpace(prompt.Type))
	if strings.TrimSpace(prompt.Type) == "" {
		message = "Implement executor task"
	}
	if prompt.PRNodeID != 0 {
		message = fmt.Sprintf("%s for PR node %d", message, prompt.PRNodeID)
	}
	return []string{
		"-c", "user.name=" + authorName,
		"-c", "user.email=" + authorEmail,
		"commit", "-m", message,
	}
}

func (e *cliExecutor) Cancel(ctx context.Context, runID string) error {
	if strings.TrimSpace(runID) == "" {
		return fmt.Errorf("%s executor: run id is required", e.prefix())
	}
	return nil
}

func (e *cliExecutor) GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error) {
	if strings.TrimSpace(runID) == "" {
		return nil, fmt.Errorf("%s executor: run id is required", e.prefix())
	}
	return &ExecutorLogs{}, nil
}

func (e *cliExecutor) emit(ctx context.Context, reporter ProgressReporter, event ExecutionProgressEvent) {
	if reporter == nil {
		return
	}
	_ = reporter.OnEvent(ctx, event)
}

func (e *cliExecutor) prefix() string {
	switch e.name {
	case ExecutorNameClaudeCodeCLI:
		return "claude executor"
	case ExecutorNameKimiCLI:
		return "kimi executor"
	default:
		return "codex executor"
	}
}

func (e *cliExecutor) commandFailure(action string, result CommandResult, err error) error {
	detail := strings.TrimSpace(result.Stderr)
	if detail == "" {
		detail = strings.TrimSpace(result.Stdout)
	}
	if err != nil && detail == "" {
		detail = err.Error()
	}
	if detail == "" {
		detail = fmt.Sprintf("exit code %d", result.ExitCode)
	}
	return fmt.Errorf("%s executor: %s failed: %s", strings.TrimSuffix(e.prefix(), " executor"), action, detail)
}

func stderrOrErr(stderr string, err error) string {
	stderr = strings.TrimSpace(stderr)
	if stderr != "" {
		return stderr
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func isMissingRemoteBranchFailure(result CommandResult, err error) bool {
	detail := strings.ToLower(strings.TrimSpace(result.Stderr))
	if detail == "" {
		detail = strings.ToLower(strings.TrimSpace(result.Stdout))
	}
	if detail == "" && err != nil {
		detail = strings.ToLower(strings.TrimSpace(err.Error()))
	}
	if detail == "" {
		return false
	}
	for _, marker := range []string{
		"couldn't find remote ref",
		"could not find remote ref",
		"not our ref",
		"invalid reference",
		"not a commit",
		"unknown revision",
	} {
		if strings.Contains(detail, marker) {
			return true
		}
	}
	return false
}

func commandFailure(action string, result CommandResult, err error) error {
	detail := strings.TrimSpace(result.Stderr)
	if detail == "" {
		detail = strings.TrimSpace(result.Stdout)
	}
	if err != nil && detail == "" {
		detail = err.Error()
	}
	if detail == "" {
		detail = fmt.Sprintf("exit code %d", result.ExitCode)
	}
	return fmt.Errorf("%s failed: %s", action, detail)
}

func (OSCommandRunner) Run(ctx context.Context, spec CommandSpec) (CommandResult, error) {
	return OSCommandRunner{}.Stream(ctx, spec, nil, nil)
}

func (OSCommandRunner) Stream(
	ctx context.Context,
	spec CommandSpec,
	onStdout func(string),
	onStderr func(string),
) (CommandResult, error) {
	if strings.TrimSpace(spec.Executable) == "" {
		return CommandResult{ExitCode: -1}, fmt.Errorf("command runner: executable is required")
	}
	cmd := exec.CommandContext(ctx, spec.Executable, spec.Args...)
	cmd.Dir = spec.Dir
	cmd.Env = os.Environ()
	for key, value := range spec.Env {
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		cmd.Env = append(cmd.Env, key+"="+value)
	}
	if spec.Stdin != "" {
		cmd.Stdin = strings.NewReader(spec.Stdin)
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return CommandResult{ExitCode: -1}, err
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return CommandResult{ExitCode: -1}, err
	}
	if err := cmd.Start(); err != nil {
		return CommandResult{ExitCode: -1}, err
	}

	var stdoutBuf bytes.Buffer
	var stderrBuf bytes.Buffer
	var wg sync.WaitGroup
	copyPipe := func(reader io.Reader, buf *bytes.Buffer, handler func(string)) {
		defer wg.Done()
		streamAndBuffer(reader, buf, handler)
	}
	wg.Add(2)
	go copyPipe(stdoutPipe, &stdoutBuf, onStdout)
	go copyPipe(stderrPipe, &stderrBuf, onStderr)
	waitErr := cmd.Wait()
	wg.Wait()

	exitCode := 0
	if waitErr != nil {
		exitCode = -1
		if exitErr, ok := waitErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}
	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}
	return CommandResult{
		Stdout:   stdoutBuf.String(),
		Stderr:   stderrBuf.String(),
		ExitCode: exitCode,
		PID:      pid,
	}, waitErr
}

func streamAndBuffer(reader io.Reader, buf *bytes.Buffer, handler func(string)) {
	data, _ := io.ReadAll(reader)
	if len(data) == 0 {
		return
	}
	_, _ = buf.Write(data)
	if handler == nil {
		return
	}
	text := string(data)
	lines := strings.SplitAfter(text, "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		handler(line)
	}
}
