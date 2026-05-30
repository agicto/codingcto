package execution

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestRuntimeWorkerClaimsExecutesAndSubmitsTask(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat: &RuntimeHeartbeatResponse{ClaimPending: true},
		claim: &ClaimAgentTaskResponse{
			Task: &ClaimedAgentTask{
				ID:        7,
				RunID:     9,
				PRNodeID:  42,
				RuntimeID: "runtime_123",
			},
			Prompt: &ClaimedTaskPrompt{
				ID:         3,
				Type:       domain.PromptTypeImplementation,
				Version:    "prompt_v1",
				PromptText: "Implement PR-001",
				PromptHash: "hash",
			},
			ExecutionContext: &ClaimedTaskExecutionContext{
				RepositoryID: "repo_123",
				BranchName:   "specforge/pr-001",
			},
		},
	}
	executor := &fakeRuntimeExecutor{result: &ExecutionResult{Status: "completed", Output: "ok", ExitCode: 0}}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{
		RuntimeID:    "runtime_123",
		RepositoryID: "repo_123",
		RepoDir:      "/workspace/repo",
		SessionID:    "session_123",
		Env:          map[string]string{"CODEX_HOME": "/tmp/codex"},
	}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.Equal(t, uint(7), result.TaskID)
	require.Equal(t, "runtime_123", client.heartbeatReq.RuntimeID)
	require.Equal(t, "runtime_123", client.claimRuntimeID)
	require.Equal(t, "session_123", client.claimReq.SessionID)
	require.Equal(t, "/workspace/repo", client.claimReq.Workdir)
	require.Equal(t, "/workspace/repo", executor.context.Workdir)
	require.Equal(t, "specforge/pr-001", executor.context.BranchName)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
	require.Len(t, client.events, 2)
	require.Equal(t, "runtime_claimed", client.events[0].Type)
	require.NotNil(t, client.submitReq)
	require.Equal(t, "completed", client.submitReq.Status)
	require.Equal(t, "ok", client.submitReq.Output)
	require.Equal(t, 0, client.submitReq.ExitCode)
	require.Empty(t, client.submitReq.FailureReason)
}

func TestRuntimeWorkerReturnsIdleWhenNoClaimIsPending(t *testing.T) {
	client := &fakeRuntimeClient{heartbeat: &RuntimeHeartbeatResponse{ClaimPending: false}}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{RuntimeID: "runtime_123", RepoDir: "/workspace/repo"}, client, &fakeRuntimeExecutor{})

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.False(t, result.Claimed)
	require.Nil(t, client.submitReq)
}

func TestRuntimeWorkerRejectsMismatchedRepositoryBeforeCodex(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat: &RuntimeHeartbeatResponse{ClaimPending: true},
		claim: &ClaimAgentTaskResponse{
			Task: &ClaimedAgentTask{ID: 7, RunID: 9, PRNodeID: 42},
			Prompt: &ClaimedTaskPrompt{
				PromptText: "Implement PR-001",
			},
			ExecutionContext: &ClaimedTaskExecutionContext{
				RepositoryID: "repo_other",
				BranchName:   "specforge/pr-001",
			},
		},
	}
	executor := &fakeRuntimeExecutor{}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{RuntimeID: "runtime_123", RepositoryID: "repo_123", RepoDir: "/workspace/repo"}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.False(t, executor.ran)
	require.Equal(t, "failed", client.submitReq.Status)
	require.Equal(t, "runtime_repository_mismatch", client.submitReq.FailureReason)
	require.Contains(t, client.submitReq.Error, "repo_other")
}

func TestRuntimeWorkerSubmitsFailedExecutorResult(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat: &RuntimeHeartbeatResponse{ClaimPending: true},
		claim: &ClaimAgentTaskResponse{
			Task: &ClaimedAgentTask{ID: 7, RunID: 9, PRNodeID: 42},
			Prompt: &ClaimedTaskPrompt{
				PromptText: "Implement PR-001",
			},
			ExecutionContext: &ClaimedTaskExecutionContext{RepositoryID: "repo_123"},
		},
	}
	executor := &fakeRuntimeExecutor{
		result: &ExecutionResult{Status: "failed", Error: "boom", ExitCode: 2},
		err:    errors.New("exit status 2"),
	}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{RuntimeID: "runtime_123", RepositoryID: "repo_123", RepoDir: "/workspace/repo"}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.Equal(t, "failed", result.ExecutionResult.Status)
	require.Equal(t, "failed", client.submitReq.Status)
	require.Equal(t, "executor_failed", client.submitReq.FailureReason)
	require.Equal(t, "boom", client.submitReq.Error)
	require.Equal(t, 2, client.submitReq.ExitCode)
}

type fakeRuntimeClient struct {
	heartbeat      *RuntimeHeartbeatResponse
	heartbeatReq   *RuntimeHeartbeatRequest
	claim          *ClaimAgentTaskResponse
	claimRuntimeID string
	claimReq       *ClaimAgentTaskRequest
	events         []*CreateTaskEventRequest
	submitReq      *SubmitTaskResultRequest
}

func (c *fakeRuntimeClient) Heartbeat(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error) {
	c.heartbeatReq = req
	if c.heartbeat == nil {
		return &RuntimeHeartbeatResponse{}, nil
	}
	return c.heartbeat, nil
}

func (c *fakeRuntimeClient) ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error) {
	c.claimRuntimeID = runtimeID
	c.claimReq = req
	return c.claim, nil
}

func (c *fakeRuntimeClient) CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error) {
	c.events = append(c.events, req)
	return &domain.SpecForgeTaskEvent{TaskID: taskID, Type: req.Type}, nil
}

func (c *fakeRuntimeClient) SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error) {
	c.submitReq = req
	return &domain.SpecForgeExecutionBundle{}, nil
}

func (c *fakeRuntimeClient) Deregister(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	return &domain.SpecForgeRuntimeSweepResult{}, nil
}

type fakeRuntimeExecutor struct {
	ran     bool
	context ExecutionContext
	prompt  CompiledExecutionPrompt
	result  *ExecutionResult
	err     error
}

func (e *fakeRuntimeExecutor) Name() string {
	return ExecutorNameCodexCLI
}

func (e *fakeRuntimeExecutor) Prepare(ctx context.Context, execContext ExecutionContext) error {
	return nil
}

func (e *fakeRuntimeExecutor) Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	e.ran = true
	e.context = execContext
	e.prompt = prompt
	if e.result == nil {
		return &ExecutionResult{Status: "completed", ExitCode: 0}, e.err
	}
	return e.result, e.err
}

func (e *fakeRuntimeExecutor) Cancel(ctx context.Context, runID string) error {
	return nil
}

func (e *fakeRuntimeExecutor) GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error) {
	return &ExecutorLogs{}, nil
}
