package execution

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	ExecutorNameCodexCLI = "codex_cli"
)

type CodeExecutor interface {
	Name() string
	Prepare(ctx context.Context, execContext ExecutionContext) error
	Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error)
	Cancel(ctx context.Context, runID string) error
	GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error)
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
	Version    string
	PromptText string
}

type ExecutionResult struct {
	Status     string
	Output     string
	Error      string
	ExitCode   int
	DurationMs int64
}

type ExecutorLogs struct {
	Stdout string
	Stderr string
}

type CodexCLIExecutorConfig struct {
	ExecutablePath string
	SandboxMode    string
	ApprovalPolicy string
	Timeout        time.Duration
	ExtraArgs      []string
}

type CodexCLIExecutor struct {
	cfg    CodexCLIExecutorConfig
	runner CommandRunner
}

func NewCodexCLIExecutor(cfg CodexCLIExecutorConfig, runner CommandRunner) *CodexCLIExecutor {
	if strings.TrimSpace(cfg.ExecutablePath) == "" {
		cfg.ExecutablePath = "codex"
	}
	if strings.TrimSpace(cfg.SandboxMode) == "" {
		cfg.SandboxMode = "workspace-write"
	}
	if strings.TrimSpace(cfg.ApprovalPolicy) == "" {
		cfg.ApprovalPolicy = "never"
	}
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Minute
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &CodexCLIExecutor{cfg: cfg, runner: runner}
}

func NewDefaultCodeExecutor() CodeExecutor {
	return NewCodexCLIExecutor(CodexCLIExecutorConfig{}, nil)
}

func (e *CodexCLIExecutor) Name() string {
	return ExecutorNameCodexCLI
}

func (e *CodexCLIExecutor) Prepare(ctx context.Context, execContext ExecutionContext) error {
	if strings.TrimSpace(execContext.Workdir) == "" {
		return fmt.Errorf("codex executor: workdir is required")
	}
	branch := strings.TrimSpace(execContext.BranchName)
	if branch == "" {
		return nil
	}
	if strings.HasPrefix(branch, "-") {
		return fmt.Errorf("codex executor: branch name is invalid")
	}
	if result, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"fetch", "origin", branch},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	}); err != nil || result.ExitCode != 0 {
		return commandFailure("fetch branch", result, err)
	}
	if result, err := e.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"checkout", "-B", branch, "origin/" + branch},
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
	}); err != nil || result.ExitCode != 0 {
		return commandFailure("checkout branch", result, err)
	}
	return nil
}

func (e *CodexCLIExecutor) Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	if err := e.Prepare(ctx, execContext); err != nil {
		return nil, err
	}
	if strings.TrimSpace(prompt.PromptText) == "" {
		return nil, fmt.Errorf("codex executor: prompt text is required")
	}
	runCtx, cancel := context.WithTimeout(ctx, e.cfg.Timeout)
	defer cancel()

	args := []string{
		"exec",
		"--json",
		"--cd", execContext.Workdir,
		"--ask-for-approval", e.cfg.ApprovalPolicy,
		"--sandbox", e.cfg.SandboxMode,
		"--skip-git-repo-check",
	}
	args = append(args, e.cfg.ExtraArgs...)
	args = append(args, "-")

	start := time.Now()
	result, err := e.runner.Run(runCtx, CommandSpec{
		Executable: e.cfg.ExecutablePath,
		Args:       args,
		Dir:        execContext.Workdir,
		Env:        execContext.Env,
		Stdin:      prompt.PromptText,
	})
	durationMs := time.Since(start).Milliseconds()
	status := "completed"
	if err != nil || result.ExitCode != 0 {
		status = "failed"
	}
	if runCtx.Err() == context.DeadlineExceeded {
		status = "timeout"
	}

	output := strings.TrimSpace(result.Stdout)
	errorOutput := strings.TrimSpace(result.Stderr)
	if err != nil && errorOutput == "" {
		errorOutput = err.Error()
	}
	return &ExecutionResult{
		Status:     status,
		Output:     output,
		Error:      errorOutput,
		ExitCode:   result.ExitCode,
		DurationMs: durationMs,
	}, err
}

func (e *CodexCLIExecutor) Cancel(ctx context.Context, runID string) error {
	if strings.TrimSpace(runID) == "" {
		return fmt.Errorf("codex executor: run id is required")
	}
	return nil
}

func (e *CodexCLIExecutor) GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error) {
	if strings.TrimSpace(runID) == "" {
		return nil, fmt.Errorf("codex executor: run id is required")
	}
	return &ExecutorLogs{}, nil
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
	return fmt.Errorf("codex executor: %s failed: %s", action, detail)
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
}

type CommandRunner interface {
	Run(ctx context.Context, spec CommandSpec) (CommandResult, error)
}

type OSCommandRunner struct{}

func (OSCommandRunner) Run(ctx context.Context, spec CommandSpec) (CommandResult, error) {
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
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		exitCode = -1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
	}
	return CommandResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
	}, err
}
