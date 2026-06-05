package execution

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPRNodeTaskEnvelopeBuildsStableProtocolPayload(t *testing.T) {
	claim := &ClaimAgentTaskResponse{
		Task: &ClaimedAgentTask{
			ID:        11,
			RunID:     7,
			PRNodeID:  42,
			Executor:  ExecutorNameCodexCLI,
			SessionID: "task-session",
			Workdir:   "/tmp/from-task",
		},
		PRNode: &ClaimedTaskPRNode{ID: 42, NodeKey: "PR-001"},
		Prompt: &ClaimedTaskPrompt{
			ID:         9,
			Type:       "implementation",
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
		ExecutionContext: &ClaimedTaskExecutionContext{
			RepositoryID: "github_owner__repo",
			BranchName:   "codingcto/pr-001",
		},
	}

	envelope, err := PRNodeTaskEnvelope("runtime-1", "", "", "", claim)

	require.NoError(t, err)
	require.Equal(t, CodingAgentConnectorProtocolVersion, envelope.ProtocolVersion)
	require.Equal(t, CodingAgentTaskKindPRNode, envelope.Kind)
	require.Equal(t, "runtime-1", envelope.RuntimeID)
	require.Equal(t, ExecutorNameCodexCLI, envelope.Executor)
	require.Equal(t, "task-session", envelope.SessionID)
	require.Equal(t, uint(11), envelope.TaskID)
	require.Equal(t, "7", envelope.RunID)
	require.Equal(t, "github_owner__repo", envelope.RepositoryID)
	require.Equal(t, "codingcto/pr-001", envelope.BranchName)
	require.Equal(t, "/tmp/from-task", envelope.Workdir)
	require.Equal(t, uint(42), envelope.Prompt.PRNodeID)
	require.Equal(t, "Implement PR-001", envelope.Prompt.PromptText)
	require.Equal(t, "PR-001", envelope.PRNode.NodeKey)

	protocolEnvelope := envelope.ToProtocol()
	require.Equal(t, envelope.ProtocolVersion, protocolEnvelope.ProtocolVersion)
	require.Equal(t, envelope.Kind, protocolEnvelope.Kind)
	require.Equal(t, uint(42), protocolEnvelope.Prompt.PRNodeID)
	require.Equal(t, "Implement PR-001", protocolEnvelope.Prompt.Text)
	require.Equal(t, "PR-001", protocolEnvelope.PRNode.NodeKey)
}

func TestDirectTaskEnvelopeUsesDirectRunIDAndRuntimeOverrides(t *testing.T) {
	claim := &ClaimAgentTaskResponse{
		DirectTask: &ClaimedDirectAgentTask{
			ID:        21,
			Executor:  ExecutorNameClaudeCodeCLI,
			SessionID: "task-session",
			Workdir:   "/tmp/from-task",
		},
		Prompt: &ClaimedTaskPrompt{
			ID:         12,
			Type:       "direct",
			Version:    "prompt_v2",
			PromptText: "Inspect repository",
		},
		ExecutionContext: &ClaimedTaskExecutionContext{
			RepositoryID: "github_owner__repo",
		},
	}

	envelope, err := DirectTaskEnvelope("runtime-1", ExecutorNameCodexCLI, "runtime-session", "/tmp/runtime-repo", claim)

	require.NoError(t, err)
	require.Equal(t, CodingAgentTaskKindDirect, envelope.Kind)
	require.Equal(t, ExecutorNameCodexCLI, envelope.Executor)
	require.Equal(t, "runtime-session", envelope.SessionID)
	require.Equal(t, "direct-21", envelope.RunID)
	require.Equal(t, "/tmp/runtime-repo", envelope.Workdir)
	require.Equal(t, uint(0), envelope.Prompt.PRNodeID)
}

func TestCLIConnectorRunsExecutorThroughStableEnvelope(t *testing.T) {
	executor := &recordingCodeExecutor{
		name:   ExecutorNameCodexCLI,
		result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0},
	}
	connector := NewCLIConnector(executor)
	reporter := &recordingProgressReporter{}

	result, err := connector.Run(context.Background(), CodingAgentTaskEnvelope{
		RunID:      "7",
		TaskID:     11,
		Workdir:    "/tmp/repo",
		BranchName: "codingcto/pr-001",
		Env:        map[string]string{"CODEX_HOME": "/tmp/codex-home"},
		Prompt: CompiledExecutionPrompt{
			ID:         9,
			PRNodeID:   42,
			Type:       "implementation",
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}, reporter)

	require.NoError(t, err)
	require.Equal(t, "completed", result.Status)
	require.Equal(t, ExecutorNameCodexCLI, connector.Name())
	require.Equal(t, CodingAgentConnectorProtocolVersion, connector.ProtocolVersion())
	require.True(t, connector.Capabilities().SupportsPRDAG)
	require.True(t, connector.Capabilities().SupportsDirect)
	require.Same(t, reporter, executor.reporter)
	require.Equal(t, ExecutionContext{
		RunID:      "7",
		TaskID:     11,
		Workdir:    "/tmp/repo",
		BranchName: "codingcto/pr-001",
		Env:        map[string]string{"CODEX_HOME": "/tmp/codex-home"},
	}, executor.execContext)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
}

func TestCLIConnectorRejectsIncompleteEnvelope(t *testing.T) {
	connector := NewCLIConnector(&recordingCodeExecutor{name: ExecutorNameCodexCLI})

	_, err := connector.Run(context.Background(), CodingAgentTaskEnvelope{}, nil)

	require.Error(t, err)
}

type recordingCodeExecutor struct {
	name        string
	execContext ExecutionContext
	prompt      CompiledExecutionPrompt
	reporter    ProgressReporter
	result      *ExecutionResult
	err         error
}

func (e *recordingCodeExecutor) Name() string {
	return e.name
}

func (e *recordingCodeExecutor) Prepare(context.Context, ExecutionContext) error {
	return nil
}

func (e *recordingCodeExecutor) Run(_ context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	e.execContext = execContext
	e.prompt = prompt
	return e.result, e.err
}

func (e *recordingCodeExecutor) Cancel(context.Context, string) error {
	return nil
}

func (e *recordingCodeExecutor) GetLogs(context.Context, string) (*ExecutorLogs, error) {
	return nil, nil
}

func (e *recordingCodeExecutor) SetProgressReporter(reporter ProgressReporter) {
	e.reporter = reporter
}

type recordingProgressReporter struct{}

func (r *recordingProgressReporter) OnEvent(context.Context, ExecutionProgressEvent) error {
	return nil
}
