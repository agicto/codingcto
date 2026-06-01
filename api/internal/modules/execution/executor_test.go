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
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
		ExecutablePath: "codex-test",
		SandboxMode:    "read-only",
		ApprovalPolicy: "never",
		Timeout:        time.Minute,
		ExtraArgs:      []string{"--ephemeral"},
	}, runner))

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
		"--ask-for-approval", "never",
		"exec",
		"--json",
		"--cd", "/tmp/repo",
		"--sandbox", "read-only",
		"--skip-git-repo-check",
		"--ephemeral",
		"-",
	}, runner.spec.Args)
}

func TestCodexCLIExecutorBypassesApprovalsForDangerFullAccess(t *testing.T) {
	runner := &captureRunner{result: CommandResult{Stdout: `{"type":"message"}`, ExitCode: 0}}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
		ExecutablePath: "codex-test",
		SandboxMode:    "danger-full-access",
		ApprovalPolicy: "never",
		Timeout:        time.Minute,
	}, runner))

	result, err := executor.Run(context.Background(), ExecutionContext{
		Workdir: "/tmp/repo",
	}, CompiledExecutionPrompt{
		PromptText: "Implement PR-001",
	})

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Equal(t, []string{
		"exec",
		"--json",
		"--cd", "/tmp/repo",
		"--dangerously-bypass-approvals-and-sandbox",
		"--skip-git-repo-check",
		"-",
	}, runner.spec.Args)
}

func TestCodexCLIExecutorChecksOutBranchBeforeRunningPrompt(t *testing.T) {
	runner := &captureRunner{results: []CommandResult{
		{ExitCode: 0},
		{ExitCode: 0},
		{Stdout: `{"type":"message"}`, ExitCode: 0},
		{ExitCode: 0},
		{Stdout: "1\n", ExitCode: 0},
		{ExitCode: 0},
	}}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
		ExecutablePath: "codex-test",
		Timeout:        time.Minute,
	}, runner))

	result, err := executor.Run(context.Background(), ExecutionContext{
		Workdir:    "/tmp/repo",
		BranchName: "specforge/pr-001",
	}, CompiledExecutionPrompt{PromptText: "Implement PR-001"})

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Len(t, runner.specs, 6)
	require.Equal(t, "git", runner.specs[0].Executable)
	require.Equal(t, []string{"fetch", "origin", "specforge/pr-001"}, runner.specs[0].Args)
	require.Equal(t, "git", runner.specs[1].Executable)
	require.Equal(t, []string{"checkout", "-B", "specforge/pr-001", "origin/specforge/pr-001"}, runner.specs[1].Args)
	require.Equal(t, "codex-test", runner.specs[2].Executable)
	require.Equal(t, []string{"status", "--porcelain"}, runner.specs[3].Args)
	require.Equal(t, []string{"rev-list", "--count", "origin/specforge/pr-001..HEAD"}, runner.specs[4].Args)
	require.Equal(t, []string{"push", "origin", "HEAD:specforge/pr-001"}, runner.specs[5].Args)
}

func TestCodexCLIExecutorFallsBackToLocalBranchWhenRemoteBranchMissing(t *testing.T) {
	runner := &captureRunner{results: []CommandResult{
		{Stderr: "fatal: couldn't find remote ref specforge/pr-001", ExitCode: 128},
		{ExitCode: 0},
		{Stdout: `{"type":"message"}`, ExitCode: 0},
		{ExitCode: 0},
		{Stdout: "1\n", ExitCode: 0},
		{ExitCode: 0},
	}, errs: []error{
		errors.New("exit status 128"),
		nil,
		nil,
		nil,
		nil,
		nil,
	}}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{
		ExecutablePath: "codex-test",
		Timeout:        time.Minute,
	}, runner))

	result, err := executor.Run(context.Background(), ExecutionContext{
		Workdir:    "/tmp/repo",
		BranchName: "specforge/pr-001",
	}, CompiledExecutionPrompt{PromptText: "Implement PR-001"})

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Len(t, runner.specs, 6)
	require.Equal(t, []string{"fetch", "origin", "specforge/pr-001"}, runner.specs[0].Args)
	require.Equal(t, []string{"checkout", "-B", "specforge/pr-001"}, runner.specs[1].Args)
}

func TestCodexCLIExecutorCommitsDirtyWorktreeBeforePush(t *testing.T) {
	runner := &captureRunner{results: []CommandResult{
		{ExitCode: 0},
		{ExitCode: 0},
		{Stdout: `{"type":"message"}`, ExitCode: 0},
		{Stdout: " M api/file.go\n", ExitCode: 0},
		{ExitCode: 0},
		{ExitCode: 1},
		{ExitCode: 0},
		{Stdout: "1\n", ExitCode: 0},
		{ExitCode: 0},
	}, errs: []error{
		nil,
		nil,
		nil,
		nil,
		nil,
		errors.New("exit status 1"),
		nil,
		nil,
		nil,
	}}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{ExecutablePath: "codex-test"}, runner))

	result, err := executor.Run(context.Background(), ExecutionContext{
		Workdir:    "/tmp/repo",
		BranchName: "specforge/pr-001",
	}, CompiledExecutionPrompt{
		PRNodeID:   42,
		Type:       "implementation",
		PromptText: "Implement PR-001",
	})

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Len(t, runner.specs, 9)
	require.Equal(t, []string{"add", "-A"}, runner.specs[4].Args)
	require.Equal(t, []string{"diff", "--cached", "--quiet"}, runner.specs[5].Args)
	require.Equal(t, []string{
		"-c", "user.name=CodingCTO",
		"-c", "user.email=codingcto@users.noreply.github.com",
		"commit", "-m", "Implement implementation task for PR node 42",
	}, runner.specs[6].Args)
	require.Equal(t, []string{"push", "origin", "HEAD:specforge/pr-001"}, runner.specs[8].Args)
}

func TestCodexCLIExecutorFailsWhenExecutorProducesNoCommits(t *testing.T) {
	runner := &captureRunner{results: []CommandResult{
		{ExitCode: 0},
		{ExitCode: 0},
		{Stdout: `{"type":"message"}`, ExitCode: 0},
		{ExitCode: 0},
		{Stdout: "0\n", ExitCode: 0},
	}}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{ExecutablePath: "codex-test"}, runner))

	result, err := executor.Run(context.Background(), ExecutionContext{
		Workdir:    "/tmp/repo",
		BranchName: "specforge/pr-001",
	}, CompiledExecutionPrompt{PromptText: "Implement PR-001"})

	require.ErrorContains(t, err, "executor produced no commits")
	require.Equal(t, "failed", result.Status)
	require.Equal(t, -1, result.ExitCode)
	require.Len(t, runner.specs, 5)
}

func TestCodexCLIExecutorFailsWhenBranchCheckoutFails(t *testing.T) {
	runner := &captureRunner{
		results: []CommandResult{{Stderr: "missing ref", ExitCode: 128}},
		errs:    []error{errors.New("exit status 128")},
	}
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{}, runner))

	_, err := executor.Run(context.Background(), ExecutionContext{
		Workdir:    "/tmp/repo",
		BranchName: "specforge/missing",
	}, CompiledExecutionPrompt{PromptText: "Implement PR-001"})

	require.ErrorContains(t, err, "fetch branch failed: missing ref")
	require.Len(t, runner.specs, 1)
}

func TestCodexCLIExecutorFailsWithoutWorkdirOrPrompt(t *testing.T) {
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{}, &captureRunner{}))

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
	executor := newExecutorAdapter(newCodexCLIExecutor(CodexCLIExecutorConfig{}, runner))

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
	spec    CommandSpec
	specs   []CommandSpec
	result  CommandResult
	results []CommandResult
	err     error
	errs    []error
}

func (r *captureRunner) Run(ctx context.Context, spec CommandSpec) (CommandResult, error) {
	r.spec = spec
	r.specs = append(r.specs, spec)
	index := len(r.specs) - 1
	result := r.result
	if index < len(r.results) {
		result = r.results[index]
	}
	err := r.err
	if index < len(r.errs) {
		err = r.errs[index]
	}
	return result, err
}

func (r *captureRunner) Stream(
	ctx context.Context,
	spec CommandSpec,
	onStdout func(string),
	onStderr func(string),
) (CommandResult, error) {
	result, err := r.Run(ctx, spec)
	if onStdout != nil && strings.TrimSpace(result.Stdout) != "" {
		onStdout(result.Stdout)
	}
	if onStderr != nil && strings.TrimSpace(result.Stderr) != "" {
		onStderr(result.Stderr)
	}
	return result, err
}
