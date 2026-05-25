package execution

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestCodexCLIExecutorBuildsNonInteractiveCommand(t *testing.T) {
	runner := &captureRunner{result: CommandResult{Stdout: `{"type":"message"}`, ExitCode: 0}}
	executor := NewCodexCLIExecutor(CodexCLIExecutorConfig{
		ExecutablePath: "codex-test",
		SandboxMode:    "read-only",
		ApprovalPolicy: "never",
		Timeout:        time.Minute,
		ExtraArgs:      []string{"--ephemeral"},
	}, runner)

	result, err := executor.Run(context.Background(), ExecutionContext{
		RunID:   "run_123",
		TaskID:  9,
		Workdir: "/tmp/repo",
		Env:     map[string]string{"CODEX_HOME": "/tmp/codex-home"},
	}, CompiledExecutionPrompt{
		ID:         7,
		PRNodeID:   42,
		Version:    "prompt_v1",
		PromptText: "Implement PR-001",
	})

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Equal(t, 0, result.ExitCode)
	require.Equal(t, "codex-test", runner.spec.Executable)
	require.Equal(t, "/tmp/repo", runner.spec.Dir)
	require.Equal(t, "Implement PR-001", runner.spec.Stdin)
	require.Equal(t, map[string]string{"CODEX_HOME": "/tmp/codex-home"}, runner.spec.Env)
	require.Equal(t, []string{
		"exec",
		"--json",
		"--cd", "/tmp/repo",
		"--ask-for-approval", "never",
		"--sandbox", "read-only",
		"--skip-git-repo-check",
		"--ephemeral",
		"-",
	}, runner.spec.Args)
}

func TestCodexCLIExecutorFailsWithoutWorkdirOrPrompt(t *testing.T) {
	executor := NewCodexCLIExecutor(CodexCLIExecutorConfig{}, &captureRunner{})

	_, err := executor.Run(context.Background(), ExecutionContext{}, CompiledExecutionPrompt{PromptText: "hello"})
	require.ErrorContains(t, err, "workdir is required")

	_, err = executor.Run(context.Background(), ExecutionContext{Workdir: "/tmp/repo"}, CompiledExecutionPrompt{})
	require.ErrorContains(t, err, "prompt text is required")
}

func TestCodexCLIExecutorReturnsFailureResult(t *testing.T) {
	runner := &captureRunner{
		result: CommandResult{Stderr: "boom", ExitCode: 2},
		err:    errors.New("exit status 2"),
	}
	executor := NewCodexCLIExecutor(CodexCLIExecutorConfig{}, runner)

	result, err := executor.Run(context.Background(), ExecutionContext{Workdir: "/tmp/repo"}, CompiledExecutionPrompt{PromptText: "hello"})

	require.Error(t, err)
	require.Equal(t, "failed", result.Status)
	require.Equal(t, 2, result.ExitCode)
	require.Equal(t, "boom", result.Error)
}

func TestOSCommandRunnerPassesStdinAndEnv(t *testing.T) {
	result, err := OSCommandRunner{}.Run(context.Background(), CommandSpec{
		Executable: "sh",
		Args:       []string{"-c", "read value && printf '%s:%s' \"$SPECFORGE_TEST\" \"$value\""},
		Env:        map[string]string{"SPECFORGE_TEST": "ok"},
		Stdin:      "prompt\n",
	})

	require.NoError(t, err)
	require.Equal(t, 0, result.ExitCode)
	require.Equal(t, "ok:prompt", strings.TrimSpace(result.Stdout))
}

type captureRunner struct {
	spec   CommandSpec
	result CommandResult
	err    error
}

func (r *captureRunner) Run(ctx context.Context, spec CommandSpec) (CommandResult, error) {
	r.spec = spec
	return r.result, r.err
}
