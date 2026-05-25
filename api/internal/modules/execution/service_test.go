package execution

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestStartRunCreatesTasksFromApprovedPlanDAG(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)

	bundle, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusQueued, bundle.Run.Status)
	require.Equal(t, uint(42), bundle.Run.StartedBy)
	require.Len(t, bundle.Tasks, 2)
	require.Equal(t, domain.AgentTaskStatusQueued, bundle.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusWaiting, bundle.Tasks[1].Status)
	require.Equal(t, 1, bundle.Tasks[0].AttemptNumber)
	require.Equal(t, "codex_cli", bundle.Tasks[0].Executor)
}

func TestStartRunRejectsUnapprovedPlan(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.Plan.Status = domain.PlanStatusDraft
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: bundle}, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, bundle.Plan.ID, &StartExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestGetRunAttachesPlanBundle(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{Executor: "custom"})
	require.NoError(t, err)

	found, err := svc.GetRun(context.Background(), created.Run.ID)

	require.NoError(t, err)
	require.Equal(t, created.Run.ID, found.Run.ID)
	require.Equal(t, "custom", found.Tasks[0].Executor)
	require.NotNil(t, found.Plan)
	require.Equal(t, planningRepo.bundle.Plan.ID, found.Plan.Plan.ID)
}

func TestDispatchRunMovesQueuedTasksToDispatched(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)

	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusRunning, dispatched.Run.Status)
	require.Equal(t, domain.AgentTaskStatusDispatched, dispatched.Tasks[0].Status)
	require.NotNil(t, dispatched.Tasks[0].DispatchedAt)
	require.Nil(t, dispatched.Tasks[0].StartedAt)
	require.Equal(t, domain.AgentTaskStatusWaiting, dispatched.Tasks[1].Status)
}

func TestDispatchRunRejectsCancelledRun(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Run.Status = domain.ExecutionRunStatusCancelled
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCancelRunCancelsNonTerminalTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	dispatched.Tasks[0].Status = domain.AgentTaskStatusRunning
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))

	cancelled, err := svc.CancelRun(context.Background(), dispatched.Run.ID)

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusCancelled, cancelled.Run.Status)
	require.NotNil(t, cancelled.Run.CompletedAt)
	require.Equal(t, domain.AgentTaskStatusCancelled, cancelled.Tasks[0].Status)
	require.Equal(t, "run_cancelled", cancelled.Tasks[0].FailureReason)
	require.Equal(t, domain.AgentTaskStatusCancelled, cancelled.Tasks[1].Status)
	require.Equal(t, "run_cancelled", cancelled.Tasks[1].FailureReason)
}

func TestCancelRunRejectsCompletedRun(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Run.Status = domain.ExecutionRunStatusCompleted
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	_, err = svc.CancelRun(context.Background(), created.Run.ID)

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestRetryTaskCreatesQueuedAttemptForFailedTask(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	failed := dispatched.Tasks[0]
	failed.Status = domain.AgentTaskStatusFailed
	failed.FailureReason = "test_failure"
	failed.SessionID = "session_123"
	failed.Workdir = "/tmp/specforge/task"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), failed))

	retried, err := svc.RetryTask(context.Background(), failed.ID, &RetryAgentTaskRequest{})

	require.NoError(t, err)
	require.Len(t, retried.Tasks, 3)
	retry := retried.Tasks[2]
	require.Equal(t, failed.ID, *retry.ParentTaskID)
	require.Equal(t, failed.PRNodeID, retry.PRNodeID)
	require.Equal(t, 2, retry.AttemptNumber)
	require.Equal(t, domain.AgentTaskStatusQueued, retry.Status)
	require.Equal(t, "session_123", retry.SessionID)
	require.Equal(t, "/tmp/specforge/task", retry.Workdir)
	require.Equal(t, domain.AgentTaskStatusFailed, retried.Tasks[0].Status)
}

func TestRetryTaskCanForceFreshSession(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	failed := dispatched.Tasks[0]
	failed.Status = domain.AgentTaskStatusFailed
	failed.SessionID = "session_123"
	failed.Workdir = "/tmp/specforge/task"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), failed))

	retried, err := svc.RetryTask(context.Background(), failed.ID, &RetryAgentTaskRequest{ForceFreshSession: true})

	require.NoError(t, err)
	retry := retried.Tasks[2]
	require.Empty(t, retry.SessionID)
	require.Empty(t, retry.Workdir)
}

func TestRetryTaskRejectsNonTerminalTask(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)

	_, err = svc.RetryTask(context.Background(), created.Tasks[0].ID, &RetryAgentTaskRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestRetryTaskRejectsCancelledRun(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	failed := created.Tasks[0]
	failed.Status = domain.AgentTaskStatusFailed
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), failed))
	created.Run.Status = domain.ExecutionRunStatusCancelled
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	_, err = svc.RetryTask(context.Background(), failed.ID, &RetryAgentTaskRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestHeartbeatRuntimeRecordsRuntimeAndReportsPendingClaim(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	heartbeat, err := svc.HeartbeatRuntime(context.Background(), &RuntimeHeartbeatRequest{
		RuntimeID: "runtime_123",
		Executor:  "codex_cli",
		Hostname:  "worker-1",
		Version:   "0.1.0",
	})

	require.NoError(t, err)
	require.True(t, heartbeat.ClaimPending)
	require.Equal(t, "runtime_123", heartbeat.Runtime.RuntimeID)
	require.Equal(t, "worker-1", heartbeat.Runtime.Hostname)
	require.Equal(t, domain.RuntimeStatusOnline, heartbeat.Runtime.Status)
	require.NotZero(t, heartbeat.Runtime.LastSeenAt)
}

func TestClaimTaskBindsRuntimeAndMarksTaskRunning(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{
		Executor:  "codex_cli",
		SessionID: "session_123",
		Workdir:   "/tmp/specforge/runtime_123/task",
	})

	require.NoError(t, err)
	require.NotNil(t, claim.Task)
	require.Equal(t, dispatched.Tasks[0].ID, claim.Task.ID)
	require.Equal(t, "runtime_123", claim.Task.RuntimeID)
	require.Equal(t, "session_123", claim.Task.SessionID)
	require.Equal(t, "/tmp/specforge/runtime_123/task", claim.Task.Workdir)
	require.Equal(t, domain.AgentTaskStatusRunning, claim.Task.Status)
	require.NotNil(t, claim.PRNode)
	require.Equal(t, dispatched.Tasks[0].PRNodeID, claim.PRNode.ID)
	require.Equal(t, "specforge/pr-001", claim.PRNode.BranchName)
	require.NotNil(t, claim.Prompt)
	require.Equal(t, "prompt_v1", claim.Prompt.Version)
	require.Equal(t, "Implement PR-001", claim.Prompt.PromptText)
	require.NotNil(t, claim.ExecutionContext)
	require.Equal(t, "repo_123", claim.ExecutionContext.RepositoryID)
	require.Equal(t, "specforge/pr-001", claim.ExecutionContext.BranchName)
	updated, err := svc.GetRun(context.Background(), dispatched.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusRunning, updated.Tasks[0].Status)
	require.NotNil(t, updated.Tasks[0].StartedAt)
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestClaimTaskReturnsEmptyWhenNoTaskAvailable(t *testing.T) {
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: approvedPlanBundle()}, nil, nil, nil, nil, nil)

	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})

	require.NoError(t, err)
	require.Nil(t, claim.Task)
}

func TestClaimTaskRevertsWhenPromptContextIsMissing(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	_, err = svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})

	require.Error(t, err)
	updated, err := svc.GetRun(context.Background(), dispatched.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusDispatched, updated.Tasks[0].Status)
	require.Empty(t, updated.Tasks[0].RuntimeID)
	require.Empty(t, updated.Tasks[0].SessionID)
	require.Nil(t, updated.Tasks[0].StartedAt)
}

func TestSubmitTaskResultCompletesClaimedTaskAndUnlocksDependents(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	deliverer := &fakePRNodeDeliverer{node: &domain.SpecForgePRNode{ID: 4, GitHubPRURL: "https://github.com/agicto/codingcto/pull/42"}}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, deliverer)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})
	require.NoError(t, err)

	updated, err := svc.SubmitTaskResult(context.Background(), claim.Task.ID, &SubmitTaskResultRequest{
		RuntimeID: "runtime_123",
		Status:    "completed",
		Output:    "done",
		ExitCode:  0,
	})

	require.NoError(t, err)
	require.Equal(t, "repo_123", deliverer.request.RepositoryID)
	require.Equal(t, dispatched.Tasks[0].PRNodeID, deliverer.request.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.Equal(t, "done", updated.Tasks[0].OutputLog)
	require.NotNil(t, updated.Tasks[0].FinishedAt)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestSubmitTaskResultMarksFailureWithoutUnlockingDependents(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})
	require.NoError(t, err)

	updated, err := svc.SubmitTaskResult(context.Background(), claim.Task.ID, &SubmitTaskResultRequest{
		RuntimeID:     "runtime_123",
		Status:        "failed",
		Error:         "tests failed",
		ExitCode:      2,
		FailureReason: "test_failure",
	})

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "test_failure", updated.Tasks[0].FailureReason)
	require.Equal(t, "tests failed", updated.Tasks[0].ErrorLog)
	require.NotNil(t, updated.Tasks[0].ExitCode)
	require.Equal(t, 2, *updated.Tasks[0].ExitCode)
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestSubmitTaskResultRejectsRuntimeMismatch(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})
	require.NoError(t, err)

	_, err = svc.SubmitTaskResult(context.Background(), claim.Task.ID, &SubmitTaskResultRequest{
		RuntimeID: "runtime_other",
		Status:    "completed",
		ExitCode:  0,
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCompleteTaskUnlocksDependentTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	updated, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.NotNil(t, updated.Tasks[0].StartedAt)
	require.NotNil(t, updated.Tasks[0].FinishedAt)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
	require.Equal(t, domain.ExecutionRunStatusRunning, updated.Run.Status)
}

func TestPinTaskSessionPersistsResumePointers(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.PinTaskSession(context.Background(), dispatched.Tasks[0].ID, &PinAgentTaskSessionRequest{
		SessionID: "codex-session-123",
		Workdir:   "/tmp/specforge-worktree",
	})

	require.NoError(t, err)
	require.Equal(t, "codex-session-123", updated.Tasks[0].SessionID)
	require.Equal(t, "/tmp/specforge-worktree", updated.Tasks[0].Workdir)
	require.Equal(t, domain.AgentTaskStatusDispatched, updated.Tasks[0].Status)
}

func TestExecuteTaskPreservesPinnedSessionWhenRequestOmitsSessionID(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	pinned, err := svc.PinTaskSession(context.Background(), dispatched.Tasks[0].ID, &PinAgentTaskSessionRequest{SessionID: "session_to_keep"})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), pinned.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "session_to_keep", updated.Tasks[0].SessionID)
	require.Equal(t, "/tmp/repo", updated.Tasks[0].Workdir)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
}

func TestExecuteTaskRunsCompiledPromptAndUnlocksDependents(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{RuntimeID: "runtime_123", SessionID: "session_123", Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "/tmp/repo", executor.execContext.Workdir)
	require.Equal(t, "specforge/pr-001", executor.execContext.BranchName)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.Equal(t, "runtime_123", updated.Tasks[0].RuntimeID)
	require.Equal(t, "session_123", updated.Tasks[0].SessionID)
	require.Equal(t, "/tmp/repo", updated.Tasks[0].Workdir)
	require.Equal(t, "done", updated.Tasks[0].OutputLog)
	require.NotNil(t, updated.Tasks[0].ExitCode)
	require.Equal(t, 0, *updated.Tasks[0].ExitCode)
	require.NotNil(t, updated.Tasks[0].FinishedAt)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestExecuteTaskPreparesBranchBeforeRunningExecutor(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	preparer := &fakePRNodeBranchPreparer{node: &domain.SpecForgePRNode{ID: 4}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, preparer, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "repo_123", preparer.request.RepositoryID)
	require.Equal(t, uint(4), preparer.request.PRNodeID)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
}

func TestExecuteTaskPreparesWorktreeWhenRequestOmitsWorkdir(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	resolver := &fakeRepositoryResolver{repository: &domain.Repository{
		RepositoryID:  "repo_123",
		GitHubOwner:   "agicto",
		GitHubRepo:    "codingcto",
		DefaultBranch: "main",
	}}
	worktrees := &fakeWorktreeManager{worktree: &Worktree{Path: "/tmp/specforge/run-1-task-2"}}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	svc := NewService(runRepo, planningRepo, resolver, executor, worktrees, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{RuntimeID: "runtime_123"})

	require.NoError(t, err)
	require.Equal(t, "repo_123", resolver.repositoryID)
	require.Equal(t, "repo_123", worktrees.request.Repository.RepositoryID)
	require.Equal(t, "specforge/pr-001", worktrees.request.BranchName)
	require.Equal(t, dispatched.Run.ID, worktrees.request.RunID)
	require.Equal(t, dispatched.Tasks[0].ID, worktrees.request.TaskID)
	require.Equal(t, "/tmp/specforge/run-1-task-2", executor.execContext.Workdir)
	require.Equal(t, "/tmp/specforge/run-1-task-2", updated.Tasks[0].Workdir)
	require.Equal(t, "runtime_123", updated.Tasks[0].RuntimeID)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
}

func TestExecuteTaskFailsBeforeExecutorWhenWorktreePreparationFails(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	resolver := &fakeRepositoryResolver{repository: &domain.Repository{
		RepositoryID: "repo_123",
		GitHubOwner:  "agicto",
		GitHubRepo:   "codingcto",
	}}
	worktrees := &fakeWorktreeManager{err: fmt.Errorf("git fetch failed")}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	svc := NewService(runRepo, planningRepo, resolver, executor, worktrees, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{})

	require.NoError(t, err)
	require.Empty(t, executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "worktree_preparation_failed", updated.Tasks[0].FailureReason)
	require.Contains(t, updated.Tasks[0].ErrorLog, "git fetch failed")
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestExecuteTaskFailsBeforeExecutorWhenBranchPreparationFails(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	preparer := &fakePRNodeBranchPreparer{err: fmt.Errorf("base branch missing")}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, preparer, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Empty(t, executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "branch_preparation_failed", updated.Tasks[0].FailureReason)
	require.Contains(t, updated.Tasks[0].ErrorLog, "prepare PR node branch: base branch missing")
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestExecuteTaskDeliversPRBeforeUnlockingDependents(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	deliverer := &fakePRNodeDeliverer{node: &domain.SpecForgePRNode{ID: 4, GitHubPRURL: "https://github.com/agicto/codingcto/pull/42"}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, deliverer)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "repo_123", deliverer.request.RepositoryID)
	require.Equal(t, uint(4), deliverer.request.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestExecuteTaskMarksFailureWhenPRDeliveryFails(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	deliverer := &fakePRNodeDeliverer{err: fmt.Errorf("missing branch")}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, deliverer)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "pr_delivery_failed", updated.Tasks[0].FailureReason)
	require.Contains(t, updated.Tasks[0].ErrorLog, "deliver PR node: missing branch")
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestExecuteTaskMarksFailureWithoutUnlockingDependents(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "failed", Error: "boom", ExitCode: 2}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "executor_failed", updated.Tasks[0].FailureReason)
	require.Equal(t, "boom", updated.Tasks[0].ErrorLog)
	require.NotNil(t, updated.Tasks[0].ExitCode)
	require.Equal(t, 2, *updated.Tasks[0].ExitCode)
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestCompleteTaskCompletesRunWhenAllTasksDone(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	updated, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)
	require.NoError(t, err)
	dispatched, err = svc.DispatchRun(context.Background(), updated.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	completed, err := svc.CompleteTask(context.Background(), dispatched.Tasks[1].ID)

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusCompleted, completed.Run.Status)
	require.NotNil(t, completed.Run.CompletedAt)
	require.Equal(t, domain.AgentTaskStatusCompleted, completed.Tasks[1].Status)
}

func TestCreateTaskEventRecordsOrderedRuntimeOutput(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	first, err := svc.CreateTaskEvent(context.Background(), dispatched.Tasks[0].ID, &CreateTaskEventRequest{
		Type:    "stdout",
		Content: "starting task",
	})
	require.NoError(t, err)
	second, err := svc.CreateTaskEvent(context.Background(), dispatched.Tasks[0].ID, &CreateTaskEventRequest{
		Type:   "tool",
		Tool:   "go test",
		Input:  "go test ./...",
		Output: "ok",
	})
	require.NoError(t, err)
	events, err := svc.ListTaskEvents(context.Background(), dispatched.Tasks[0].ID, first.Seq)

	require.NoError(t, err)
	require.Equal(t, 1, first.Seq)
	require.Equal(t, 2, second.Seq)
	require.Len(t, events, 1)
	require.Equal(t, second.ID, events[0].ID)
	require.Equal(t, "go test", events[0].Tool)
}

func TestSweepStaleRuntimesMarksRuntimeOfflineAndFailsTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	dispatched.Tasks[0].RuntimeID = "runtime_old"
	dispatched.Tasks[0].Status = domain.AgentTaskStatusRunning
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_old",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: time.Now().Add(-10 * time.Minute),
	}))

	result, err := svc.SweepStaleRuntimes(context.Background(), &RuntimeSweepRequest{StaleSeconds: 300})

	require.NoError(t, err)
	require.Len(t, result.OfflineRuntimes, 1)
	require.Equal(t, domain.RuntimeStatusOffline, result.OfflineRuntimes[0].Status)
	require.Len(t, result.FailedTasks, 1)
	require.Equal(t, dispatched.Tasks[0].ID, result.FailedTasks[0].ID)
	require.Equal(t, "runtime_offline", result.FailedTasks[0].FailureReason)
}

type memoryExecutionRepo struct {
	nextID   uint
	bundle   *domain.SpecForgeExecutionBundle
	runtimes map[string]*domain.SpecForgeRuntime
	events   map[uint][]*domain.SpecForgeTaskEvent
}

func (r *memoryExecutionRepo) CreateExecutionBundle(ctx context.Context, bundle *domain.SpecForgeExecutionBundle) error {
	r.nextID++
	bundle.Run.ID = r.nextID
	for _, task := range bundle.Tasks {
		r.nextID++
		task.ID = r.nextID
		task.RunID = bundle.Run.ID
	}
	r.bundle = cloneExecutionBundle(bundle)
	return nil
}

func (r *memoryExecutionRepo) FindExecutionBundleByRunID(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error) {
	if r.bundle == nil || r.bundle.Run.ID != runID {
		return nil, domain.ErrNotFound
	}
	return cloneExecutionBundle(r.bundle), nil
}

func (r *memoryExecutionRepo) FindAgentTaskByID(ctx context.Context, taskID uint) (*domain.SpecForgeAgentTask, error) {
	if r.bundle == nil {
		return nil, domain.ErrNotFound
	}
	for _, task := range r.bundle.Tasks {
		if task.ID == taskID {
			copied := *task
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryExecutionRepo) CreateTaskEvent(ctx context.Context, event *domain.SpecForgeTaskEvent) error {
	if event == nil || event.TaskID == 0 || event.Type == "" {
		return domain.ErrInvalidInput
	}
	if r.events == nil {
		r.events = make(map[uint][]*domain.SpecForgeTaskEvent)
	}
	r.nextID++
	copied := *event
	copied.ID = r.nextID
	copied.Seq = len(r.events[event.TaskID]) + 1
	event.ID = copied.ID
	event.Seq = copied.Seq
	r.events[event.TaskID] = append(r.events[event.TaskID], &copied)
	return nil
}

func (r *memoryExecutionRepo) ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*domain.SpecForgeTaskEvent, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	out := make([]*domain.SpecForgeTaskEvent, 0, len(r.events[taskID]))
	for _, event := range r.events[taskID] {
		if event.Seq <= afterSeq {
			continue
		}
		copied := *event
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryExecutionRepo) UpsertRuntime(ctx context.Context, runtime *domain.SpecForgeRuntime) error {
	if r.runtimes == nil {
		r.runtimes = make(map[string]*domain.SpecForgeRuntime)
	}
	copied := *runtime
	if existing := r.runtimes[runtime.RuntimeID]; existing != nil {
		copied.ID = existing.ID
	} else {
		r.nextID++
		copied.ID = r.nextID
	}
	runtime.ID = copied.ID
	r.runtimes[runtime.RuntimeID] = &copied
	return nil
}

func (r *memoryExecutionRepo) MarkStaleRuntimesOffline(ctx context.Context, staleBefore time.Time) ([]*domain.SpecForgeRuntime, error) {
	if r.runtimes == nil {
		return []*domain.SpecForgeRuntime{}, nil
	}
	out := make([]*domain.SpecForgeRuntime, 0)
	for runtimeID, runtime := range r.runtimes {
		if runtime.Status != domain.RuntimeStatusOnline || !runtime.LastSeenAt.Before(staleBefore) {
			continue
		}
		copied := *runtime
		copied.Status = domain.RuntimeStatusOffline
		r.runtimes[runtimeID] = &copied
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryExecutionRepo) FailTasksForOfflineRuntimes(ctx context.Context) ([]*domain.SpecForgeAgentTask, error) {
	if r.bundle == nil || r.runtimes == nil {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	out := make([]*domain.SpecForgeAgentTask, 0)
	now := time.Now()
	for _, task := range r.bundle.Tasks {
		runtime := r.runtimes[task.RuntimeID]
		if runtime == nil || runtime.Status != domain.RuntimeStatusOffline {
			continue
		}
		if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
			continue
		}
		task.Status = domain.AgentTaskStatusFailed
		task.FailureReason = "runtime_offline"
		task.FinishedAt = &now
		task.ErrorLog = appendLogLine(task.ErrorLog, "runtime went offline")
		copied := *task
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryExecutionRepo) CancelActiveTasksByRunID(ctx context.Context, runID uint) ([]*domain.SpecForgeAgentTask, error) {
	if runID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if r.bundle == nil || r.bundle.Run.ID != runID {
		return nil, domain.ErrNotFound
	}
	out := make([]*domain.SpecForgeAgentTask, 0)
	now := time.Now()
	for _, task := range r.bundle.Tasks {
		switch task.Status {
		case domain.AgentTaskStatusQueued, domain.AgentTaskStatusDispatched, domain.AgentTaskStatusWaiting, domain.AgentTaskStatusRunning:
			task.Status = domain.AgentTaskStatusCancelled
			task.FailureReason = "run_cancelled"
			task.FinishedAt = &now
			copied := *task
			out = append(out, &copied)
		}
	}
	return out, nil
}

func (r *memoryExecutionRepo) CreateRetryAgentTask(ctx context.Context, parent *domain.SpecForgeAgentTask, status string, forceFreshSession bool) (*domain.SpecForgeAgentTask, error) {
	if parent == nil || parent.ID == 0 || parent.RunID == 0 || parent.PRNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if r.bundle == nil || r.bundle.Run.ID != parent.RunID {
		return nil, domain.ErrNotFound
	}
	r.nextID++
	retry := &domain.SpecForgeAgentTask{
		ID:            r.nextID,
		RunID:         parent.RunID,
		PRNodeID:      parent.PRNodeID,
		Executor:      parent.Executor,
		Status:        status,
		AttemptNumber: parent.AttemptNumber + 1,
		ParentTaskID:  &parent.ID,
	}
	if retry.AttemptNumber <= 1 {
		retry.AttemptNumber = 2
	}
	if !forceFreshSession {
		retry.SessionID = parent.SessionID
		retry.Workdir = parent.Workdir
	}
	r.bundle.Tasks = append(r.bundle.Tasks, retry)
	copied := *retry
	return &copied, nil
}

func (r *memoryExecutionRepo) HasClaimableAgentTask(ctx context.Context, runtimeID, executor string) (bool, error) {
	if r.bundle == nil {
		return false, nil
	}
	for _, task := range r.bundle.Tasks {
		if task.Status != domain.AgentTaskStatusDispatched {
			continue
		}
		if task.RuntimeID != "" && task.RuntimeID != runtimeID {
			continue
		}
		if executor != "" && task.Executor != executor {
			continue
		}
		return true, nil
	}
	return false, nil
}

func (r *memoryExecutionRepo) ClaimDispatchedAgentTask(ctx context.Context, runtimeID, executor, sessionID, workdir string) (*domain.SpecForgeAgentTask, error) {
	if r.bundle == nil {
		return nil, domain.ErrNotFound
	}
	for _, task := range r.bundle.Tasks {
		if task.Status != domain.AgentTaskStatusDispatched {
			continue
		}
		if task.RuntimeID != "" && task.RuntimeID != runtimeID {
			continue
		}
		if executor != "" && task.Executor != executor {
			continue
		}
		now := time.Now()
		task.Status = domain.AgentTaskStatusRunning
		task.RuntimeID = runtimeID
		task.SessionID = sessionID
		task.Workdir = workdir
		if task.StartedAt == nil {
			task.StartedAt = &now
		}
		copied := *task
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (r *memoryExecutionRepo) UpdateExecutionRun(ctx context.Context, run *domain.SpecForgeExecutionRun) error {
	if r.bundle == nil || r.bundle.Run.ID != run.ID {
		return domain.ErrNotFound
	}
	copied := *run
	r.bundle.Run = &copied
	return nil
}

func (r *memoryExecutionRepo) UpdateAgentTask(ctx context.Context, task *domain.SpecForgeAgentTask) error {
	if r.bundle == nil {
		return domain.ErrNotFound
	}
	for i, current := range r.bundle.Tasks {
		if current.ID == task.ID {
			copied := *task
			r.bundle.Tasks[i] = &copied
			return nil
		}
	}
	return domain.ErrNotFound
}

type memoryPlanningRepo struct {
	bundle *domain.SpecForgePlanBundle
	prompt *domain.SpecForgeCompiledPrompt
}

func (r *memoryPlanningRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	r.bundle = bundle
	return nil
}

func (r *memoryPlanningRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Idea.ID != ideaID {
		return nil, domain.ErrNotFound
	}
	return clonePlanBundle(r.bundle), nil
}

func (r *memoryPlanningRepo) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Plan.ID != planID {
		return nil, domain.ErrNotFound
	}
	return clonePlanBundle(r.bundle), nil
}

func (r *memoryPlanningRepo) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	return nil
}

func (r *memoryPlanningRepo) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	r.prompt = prompt
	return nil
}

func (r *memoryPlanningRepo) FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeCompiledPrompt, error) {
	if r.prompt == nil || r.prompt.PRNodeID != prNodeID {
		return nil, domain.ErrNotFound
	}
	copied := *r.prompt
	return &copied, nil
}

func (r *memoryPlanningRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	r.bundle.Plan = plan
	return nil
}

type fakeExecutor struct {
	execContext ExecutionContext
	prompt      CompiledExecutionPrompt
	result      *ExecutionResult
	err         error
}

func (e *fakeExecutor) Name() string {
	return "fake"
}

func (e *fakeExecutor) Prepare(ctx context.Context, execContext ExecutionContext) error {
	return nil
}

func (e *fakeExecutor) Run(ctx context.Context, execContext ExecutionContext, prompt CompiledExecutionPrompt) (*ExecutionResult, error) {
	e.execContext = execContext
	e.prompt = prompt
	return e.result, e.err
}

func (e *fakeExecutor) Cancel(ctx context.Context, runID string) error {
	return nil
}

func (e *fakeExecutor) GetLogs(ctx context.Context, runID string) (*ExecutorLogs, error) {
	return &ExecutorLogs{}, nil
}

type fakePRNodeDeliverer struct {
	request githubintegration.DeliverPRNodeRequest
	node    *domain.SpecForgePRNode
	err     error
}

func (d *fakePRNodeDeliverer) DeliverPRNode(ctx context.Context, req *githubintegration.DeliverPRNodeRequest) (*domain.SpecForgePRNode, error) {
	if req != nil {
		d.request = *req
	}
	return d.node, d.err
}

type fakePRNodeBranchPreparer struct {
	request githubintegration.PreparePRNodeBranchRequest
	node    *domain.SpecForgePRNode
	err     error
}

func (p *fakePRNodeBranchPreparer) PreparePRNodeBranch(ctx context.Context, req *githubintegration.PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error) {
	if req != nil {
		p.request = *req
	}
	return p.node, p.err
}

type fakeRepositoryResolver struct {
	repositoryID string
	repository   *domain.Repository
	err          error
}

func (r *fakeRepositoryResolver) GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	r.repositoryID = repositoryID
	if r.err != nil {
		return nil, r.err
	}
	if r.repository == nil {
		return nil, domain.ErrNotFound
	}
	copied := *r.repository
	return &copied, nil
}

type fakeWorktreeManager struct {
	request  WorktreeRequest
	worktree *Worktree
	err      error
}

func (m *fakeWorktreeManager) PrepareWorktree(ctx context.Context, req WorktreeRequest) (*Worktree, error) {
	m.request = req
	return m.worktree, m.err
}

func approvedPlanBundle() *domain.SpecForgePlanBundle {
	return &domain.SpecForgePlanBundle{
		Idea:        &domain.SpecForgeIdea{ID: 1, RepositoryID: "repo_123"},
		ProductSpec: &domain.SpecForgeProductSpec{ID: 2, IdeaID: 1},
		Plan: &domain.SpecForgeImplementationPlan{
			ID:            3,
			IdeaID:        1,
			ProductSpecID: 2,
			Status:        domain.PlanStatusApproved,
		},
		PRNodes: []*domain.SpecForgePRNode{
			{ID: 4, PlanID: 3, NodeKey: "PR-001", BranchName: "specforge/pr-001", Status: domain.PRNodeStatusPlanned},
			{ID: 5, PlanID: 3, NodeKey: "PR-002", BranchName: "specforge/pr-002", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
		},
	}
}

func memoryPlanningRepoWithPrompt() *memoryPlanningRepo {
	return &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompt: &domain.SpecForgeCompiledPrompt{
			ID:         7,
			PRNodeID:   4,
			PlanID:     3,
			Type:       "implementation",
			Version:    "prompt_v1",
			PromptText: "Implement PR-001",
			PromptHash: "hash_123",
		},
	}
}

func cloneExecutionBundle(bundle *domain.SpecForgeExecutionBundle) *domain.SpecForgeExecutionBundle {
	out := *bundle
	run := *bundle.Run
	out.Run = &run
	out.Tasks = make([]*domain.SpecForgeAgentTask, len(bundle.Tasks))
	for i, task := range bundle.Tasks {
		copied := *task
		out.Tasks[i] = &copied
	}
	return &out
}

func clonePlanBundle(bundle *domain.SpecForgePlanBundle) *domain.SpecForgePlanBundle {
	out := *bundle
	idea := *bundle.Idea
	spec := *bundle.ProductSpec
	plan := *bundle.Plan
	out.Idea = &idea
	out.ProductSpec = &spec
	out.Plan = &plan
	out.PRNodes = make([]*domain.SpecForgePRNode, len(bundle.PRNodes))
	for i, node := range bundle.PRNodes {
		copied := *node
		out.PRNodes[i] = &copied
	}
	return &out
}
