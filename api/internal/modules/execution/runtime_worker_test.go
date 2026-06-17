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
		AvailableCLIs: []domain.SpecForgeRuntimeCLI{
			{Name: "Codex CLI", Command: "codex", Version: "codex 1.0.0", Available: true},
		},
		Sandbox:         &domain.SpecForgeRuntimeSandbox{Provider: "codex_cli", Mode: "workspace-write", NetworkAccess: true, Writable: true},
		SkillRoots:      []domain.SpecForgeRuntimeSkillRoot{{Provider: "codex", Path: "/tmp/codex/skills", Writable: true}},
		LocalSkillCount: 1,
	}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.Equal(t, uint(7), result.TaskID)
	require.Equal(t, "runtime_123", client.heartbeatReq.RuntimeID)
	require.Len(t, client.heartbeatReq.AvailableCLIs, 1)
	require.Equal(t, "workspace-write", client.heartbeatReq.Sandbox.Mode)
	require.Equal(t, 1, client.heartbeatReq.LocalSkillCount)
	require.Equal(t, "runtime_123", client.claimRuntimeID)
	require.Equal(t, "repo_123", client.claimReq.RepositoryID)
	require.Equal(t, "session_123", client.claimReq.SessionID)
	require.Equal(t, "/workspace/repo", client.claimReq.Workdir)
	require.Equal(t, "/workspace/repo", executor.context.Workdir)
	require.Equal(t, "specforge/pr-001", executor.context.BranchName)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
	require.Len(t, client.events, 3)
	require.Equal(t, "runtime_claimed", client.events[0].Type)
	require.Equal(t, "executor_git_summary", client.events[2].Type)
	require.NotNil(t, client.submitReq)
	require.Equal(t, "completed", client.submitReq.Status)
	require.Contains(t, client.submitReq.Output, "ok")
	require.Contains(t, client.submitReq.Output, "executor_git_summary")
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

func TestRuntimeWorkerClaimsExecutesAndSubmitsDirectTask(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat: &RuntimeHeartbeatResponse{ClaimPending: true},
		claim: &ClaimAgentTaskResponse{
			DirectTask:       &ClaimedDirectAgentTask{ID: 99, RepositoryID: "repo_123", Executor: ExecutorNameCodexCLI, RuntimeID: "runtime_123"},
			Prompt:           &ClaimedTaskPrompt{ID: 99, Type: "implementation", Version: "direct-v1", PromptText: "Update README"},
			ExecutionContext: &ClaimedTaskExecutionContext{RepositoryID: "repo_123"},
		},
	}
	executor := &fakeRuntimeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{RuntimeID: "runtime_123", RepositoryID: "repo_123", RepoDir: "/workspace/repo"}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.Equal(t, uint(99), result.TaskID)
	require.True(t, executor.ran)
	require.Equal(t, "direct-99", executor.context.RunID)
	require.Equal(t, "Update README", executor.prompt.PromptText)
	require.Equal(t, "completed", client.directSubmitReq.Status)
	require.Contains(t, client.directSubmitReq.Output, "done")
	require.Contains(t, client.directSubmitReq.Output, "executor_git_summary")
	require.Contains(t, eventTypes(client.directEvents), "runtime_claimed")
	require.Contains(t, eventTypes(client.directEvents), "executor_git_summary")
}

func TestRuntimeWorkerClaimsDiscoveredRepositoryWorkdir(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat: &RuntimeHeartbeatResponse{ClaimPending: true},
		claimByRepository: map[string]*ClaimAgentTaskResponse{
			"repo_2": {
				Task: &ClaimedAgentTask{ID: 7, RunID: 9, PRNodeID: 42, RuntimeID: "runtime_123"},
				Prompt: &ClaimedTaskPrompt{
					ID:         3,
					Type:       domain.PromptTypeImplementation,
					Version:    "prompt_v1",
					PromptText: "Implement PR-001",
					PromptHash: "hash",
				},
				ExecutionContext: &ClaimedTaskExecutionContext{RepositoryID: "repo_2"},
			},
		},
	}
	executor := &fakeRuntimeExecutor{result: &ExecutionResult{Status: "completed", Output: "ok", ExitCode: 0}}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{
		RuntimeID: "runtime_123",
		Executor:  ExecutorNameCodexCLI,
		Repositories: []domain.SpecForgeRuntimeRepository{
			{RepositoryID: "repo_1", RepoDir: "/workspace/repo-1"},
			{RepositoryID: "repo_2", RepoDir: "/workspace/repo-2"},
		},
	}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.Len(t, client.heartbeatReq.Repositories, 2)
	require.Len(t, client.claimReqs, 2)
	require.Equal(t, "repo_1", client.claimReqs[0].RepositoryID)
	require.Equal(t, "/workspace/repo-1", client.claimReqs[0].Workdir)
	require.Equal(t, "repo_2", client.claimReqs[1].RepositoryID)
	require.Equal(t, "/workspace/repo-2", client.claimReqs[1].Workdir)
	require.Equal(t, "/workspace/repo-2", executor.context.Workdir)
}

func TestRuntimeWorkerSubmitsCancelledWhenDirectTaskIsCancelledByPlatform(t *testing.T) {
	client := &fakeRuntimeClient{
		heartbeat:        &RuntimeHeartbeatResponse{ClaimPending: true},
		directTaskStatus: domain.AgentTaskStatusCancelled,
		claim: &ClaimAgentTaskResponse{
			DirectTask:       &ClaimedDirectAgentTask{ID: 99, RepositoryID: "repo_123", Executor: ExecutorNameCodexCLI, RuntimeID: "runtime_123"},
			Prompt:           &ClaimedTaskPrompt{ID: 99, Type: "implementation", Version: "direct-v1", PromptText: "Update README"},
			ExecutionContext: &ClaimedTaskExecutionContext{RepositoryID: "repo_123"},
		},
	}
	executor := &fakeRuntimeExecutor{
		waitForCancel: true,
		result:        &ExecutionResult{Status: "completed", Output: "partial", ExitCode: 0},
	}
	worker := NewRuntimeWorker(RuntimeWorkerConfig{RuntimeID: "runtime_123", RepositoryID: "repo_123", RepoDir: "/workspace/repo"}, client, executor)

	result, err := worker.RunOnce(context.Background())

	require.NoError(t, err)
	require.True(t, result.Claimed)
	require.Equal(t, "cancelled", result.ExecutionResult.Status)
	require.Equal(t, "cancelled", client.directSubmitReq.Status)
	require.Equal(t, "user_cancelled", client.directSubmitReq.FailureReason)
	require.Contains(t, eventTypes(client.directEvents), "executor_cancel_requested")
}

func TestDirectRuntimeProgressReporterSuppressesKnownCodexNoise(t *testing.T) {
	client := &fakeRuntimeClient{}
	reporter := &directRuntimeProgressReporter{
		client:    client,
		taskID:    99,
		runtimeID: "runtime_123",
		tool:      ExecutorNameCodexCLI,
	}

	require.NoError(t, reporter.OnEvent(context.Background(), ExecutionProgressEvent{
		Type:   "executor_stderr",
		Tool:   ExecutorNameCodexCLI,
		Output: "2026-06-03T15:50:08Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path must not contain '..'",
	}))
	require.NoError(t, reporter.OnEvent(context.Background(), ExecutionProgressEvent{
		Type:   "executor_stderr",
		Tool:   ExecutorNameCodexCLI,
		Output: "real stderr line",
	}))
	require.NoError(t, reporter.OnEvent(context.Background(), ExecutionProgressEvent{
		Type:   "executor_stderr",
		Tool:   ExecutorNameCodexCLI,
		Output: "2026-06-03T15:50:17Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path must not contain '..'",
	}))
	require.NoError(t, reporter.Flush(context.Background()))

	require.Len(t, client.directEvents, 2)
	require.Equal(t, "executor_stderr", client.directEvents[0].Type)
	require.Equal(t, "real stderr line", client.directEvents[0].Output)
	require.Equal(t, "executor_log_suppressed", client.directEvents[1].Type)
	require.Contains(t, client.directEvents[1].Content, "2 noisy CLI warning lines")
	require.Contains(t, client.directEvents[1].Output, "codex skill icon_small warning: 2")
}

type fakeRuntimeClient struct {
	heartbeat         *RuntimeHeartbeatResponse
	heartbeatReq      *RuntimeHeartbeatRequest
	claim             *ClaimAgentTaskResponse
	claimByRepository map[string]*ClaimAgentTaskResponse
	claimRuntimeID    string
	claimReq          *ClaimAgentTaskRequest
	claimReqs         []*ClaimAgentTaskRequest
	events            []*CreateTaskEventRequest
	submitReq         *SubmitTaskResultRequest
	directEvents      []*CreateTaskEventRequest
	directSubmitReq   *SubmitTaskResultRequest
	directTaskStatus  string
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
	c.claimReqs = append(c.claimReqs, req)
	if c.claimByRepository != nil {
		return c.claimByRepository[req.RepositoryID], nil
	}
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

func (c *fakeRuntimeClient) GetDirectTask(ctx context.Context, taskID uint, runtimeID string) (*domain.CodingCTODirectAgentTask, error) {
	status := c.directTaskStatus
	if status == "" {
		status = domain.AgentTaskStatusRunning
	}
	return &domain.CodingCTODirectAgentTask{ID: taskID, RuntimeID: runtimeID, Status: status}, nil
}

func (c *fakeRuntimeClient) CreateDirectTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.CodingCTODirectTaskEvent, error) {
	c.directEvents = append(c.directEvents, req)
	return &domain.CodingCTODirectTaskEvent{TaskID: taskID, Type: req.Type}, nil
}

func (c *fakeRuntimeClient) SubmitDirectTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.CodingCTODirectAgentTask, error) {
	c.directSubmitReq = req
	return &domain.CodingCTODirectAgentTask{ID: taskID, Status: req.Status}, nil
}

func (c *fakeRuntimeClient) Deregister(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	return &domain.SpecForgeRuntimeSweepResult{}, nil
}

type fakeRuntimeExecutor struct {
	ran           bool
	context       ExecutionContext
	prompt        CompiledExecutionPrompt
	result        *ExecutionResult
	err           error
	waitForCancel bool
}

func (e *fakeRuntimeExecutor) Name() string {
	return ExecutorNameCodexCLI
}

func (e *fakeRuntimeExecutor) SetProgressReporter(reporter ProgressReporter) {}

func (e *fakeRuntimeExecutor) Prepare(ctx context.Context, execContext ExecutionContext) error {
	return nil
}

func (e *fakeRuntimeExecutor) Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	e.ran = true
	e.context = execContext
	e.prompt = prompt
	if e.waitForCancel {
		<-ctx.Done()
	}
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
