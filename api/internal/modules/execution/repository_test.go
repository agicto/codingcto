package execution

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

func TestRepositoryUpsertsRuntimeAndClaimsDispatchedTask(t *testing.T) {
	repo := newTestExecutionRepository(t)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusWaiting, AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))
	runtime := &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_123",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		Hostname:   "worker-1",
		LastSeenAt: time.Now(),
	}
	require.NoError(t, repo.UpsertRuntime(context.Background(), runtime))
	require.NotZero(t, runtime.ID)

	pending, err := repo.HasClaimableAgentTask(context.Background(), "runtime_123", ExecutorNameCodexCLI)
	require.NoError(t, err)
	require.True(t, pending)
	claimed, err := repo.ClaimDispatchedAgentTask(context.Background(), "runtime_123", ExecutorNameCodexCLI, "session_123", "/tmp/task")

	require.NoError(t, err)
	require.Equal(t, bundle.Tasks[0].ID, claimed.ID)
	require.Equal(t, domain.AgentTaskStatusRunning, claimed.Status)
	require.Equal(t, "runtime_123", claimed.RuntimeID)
	require.Equal(t, "session_123", claimed.SessionID)
	require.Equal(t, "/tmp/task", claimed.Workdir)
	require.NotNil(t, claimed.StartedAt)

	pending, err = repo.HasClaimableAgentTask(context.Background(), "runtime_123", ExecutorNameCodexCLI)
	require.NoError(t, err)
	require.False(t, pending)
}

func TestRepositoryCreatesAndListsTaskEventsInSequence(t *testing.T) {
	repo := newTestExecutionRepository(t)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))
	first := &domain.SpecForgeTaskEvent{
		TaskID:  bundle.Tasks[0].ID,
		Type:    "stdout",
		Content: "starting",
	}
	second := &domain.SpecForgeTaskEvent{
		TaskID: bundle.Tasks[0].ID,
		Type:   "tool",
		Tool:   "go test",
		Input:  "go test ./...",
		Output: "ok",
	}
	require.NoError(t, repo.CreateTaskEvent(context.Background(), first))
	require.NoError(t, repo.CreateTaskEvent(context.Background(), second))

	require.Equal(t, 1, first.Seq)
	require.Equal(t, 2, second.Seq)
	events, err := repo.ListTaskEvents(context.Background(), bundle.Tasks[0].ID, 1)

	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, second.ID, events[0].ID)
	require.Equal(t, "tool", events[0].Type)
	require.Equal(t, "go test", events[0].Tool)
	require.Equal(t, "ok", events[0].Output)
}

func TestRepositoryListsRuntimePendingTasks(t *testing.T) {
	repo := newTestExecutionRepository(t)
	oldDispatchedAt := time.Now().Add(-2 * time.Minute)
	newDispatchedAt := time.Now()
	startedAt := time.Now().Add(-1 * time.Minute)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, DispatchedAt: &oldDispatchedAt, AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, RuntimeID: "runtime_123", DispatchedAt: &newDispatchedAt, AttemptNumber: 1},
			{PRNodeID: 12, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, RuntimeID: "runtime_123", StartedAt: &startedAt, AttemptNumber: 1},
			{PRNodeID: 13, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, RuntimeID: "runtime_other", DispatchedAt: &oldDispatchedAt, AttemptNumber: 1},
			{PRNodeID: 14, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusQueued, AttemptNumber: 1},
			{PRNodeID: 15, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusCompleted, RuntimeID: "runtime_123", AttemptNumber: 1},
			{PRNodeID: 16, Executor: "other_executor", Status: domain.AgentTaskStatusDispatched, DispatchedAt: &oldDispatchedAt, AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	tasks, err := repo.ListPendingAgentTasksByRuntime(context.Background(), "runtime_123", ExecutorNameCodexCLI)

	require.NoError(t, err)
	require.Len(t, tasks, 3)
	require.Equal(t, bundle.Tasks[0].ID, tasks[0].ID)
	require.Equal(t, bundle.Tasks[1].ID, tasks[1].ID)
	require.Equal(t, bundle.Tasks[2].ID, tasks[2].ID)
}

func TestRepositorySweepsOfflineRuntimesAndFailsActiveTasks(t *testing.T) {
	repo := newTestExecutionRepository(t)
	oldSeen := time.Now().Add(-10 * time.Minute)
	freshSeen := time.Now()
	oldRuntime := &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_old",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: oldSeen,
	}
	freshRuntime := &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_fresh",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: freshSeen,
	}
	require.NoError(t, repo.UpsertRuntime(context.Background(), oldRuntime))
	require.NoError(t, repo.UpsertRuntime(context.Background(), freshRuntime))
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, RuntimeID: "runtime_old", AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, RuntimeID: "runtime_fresh", AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	runtimes, err := repo.MarkStaleRuntimesOffline(context.Background(), time.Now().Add(-5*time.Minute))
	require.NoError(t, err)
	failedTasks, err := repo.FailTasksForOfflineRuntimes(context.Background())

	require.NoError(t, err)
	require.Len(t, runtimes, 1)
	require.Equal(t, "runtime_old", runtimes[0].RuntimeID)
	require.Equal(t, domain.RuntimeStatusOffline, runtimes[0].Status)
	require.Len(t, failedTasks, 1)
	require.Equal(t, bundle.Tasks[0].ID, failedTasks[0].ID)
	require.Equal(t, domain.AgentTaskStatusFailed, failedTasks[0].Status)
	require.Equal(t, "runtime_offline", failedTasks[0].FailureReason)
	require.NotNil(t, failedTasks[0].FinishedAt)
}

func TestRepositoryListsRuntimesWithFiltersAndLimit(t *testing.T) {
	repo := newTestExecutionRepository(t)
	now := time.Now()
	require.NoError(t, repo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-old",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: now.Add(-2 * time.Minute),
	}))
	require.NoError(t, repo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-new",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: now,
	}))
	require.NoError(t, repo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-other",
		Executor:   "other_executor",
		Status:     domain.RuntimeStatusOffline,
		LastSeenAt: now.Add(time.Minute),
	}))

	runtimes, err := repo.ListRuntimes(context.Background(), ExecutorNameCodexCLI, domain.RuntimeStatusOnline, 1)

	require.NoError(t, err)
	require.Len(t, runtimes, 1)
	require.Equal(t, "runtime-new", runtimes[0].RuntimeID)

	all, err := repo.ListRuntimes(context.Background(), "", "", 2)
	require.NoError(t, err)
	require.Len(t, all, 2)
	require.Equal(t, "runtime-other", all[0].RuntimeID)
	require.Equal(t, "runtime-new", all[1].RuntimeID)
}

func TestRepositoryDeregistersRuntimeAndFailsOnlyItsTasks(t *testing.T) {
	repo := newTestExecutionRepository(t)
	require.NoError(t, repo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_leaving",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: time.Now(),
	}))
	require.NoError(t, repo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_other",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: time.Now(),
	}))
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, RuntimeID: "runtime_leaving", AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, RuntimeID: "runtime_other", AttemptNumber: 1},
			{PRNodeID: 12, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusCompleted, RuntimeID: "runtime_leaving", AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	runtimes, err := repo.MarkRuntimesOfflineByRuntimeIDs(context.Background(), []string{" runtime_leaving ", "runtime_leaving"})
	require.NoError(t, err)
	failedTasks, err := repo.FailTasksForRuntimeIDs(context.Background(), []string{"runtime_leaving"}, "runtime_deregistered", "runtime deregistered")

	require.NoError(t, err)
	require.Len(t, runtimes, 1)
	require.Equal(t, "runtime_leaving", runtimes[0].RuntimeID)
	require.Equal(t, domain.RuntimeStatusOffline, runtimes[0].Status)
	require.Len(t, failedTasks, 1)
	require.Equal(t, bundle.Tasks[0].ID, failedTasks[0].ID)
	require.Equal(t, domain.AgentTaskStatusFailed, failedTasks[0].Status)
	require.Equal(t, "runtime_deregistered", failedTasks[0].FailureReason)
	require.Contains(t, failedTasks[0].ErrorLog, "runtime deregistered")
	found, err := repo.FindExecutionBundleByRunID(context.Background(), bundle.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, found.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusDispatched, found.Tasks[1].Status)
	require.Equal(t, domain.AgentTaskStatusCompleted, found.Tasks[2].Status)
}

func TestRepositoryFailsStaleDispatchedAndRunningTasks(t *testing.T) {
	repo := newTestExecutionRepository(t)
	oldDispatchedAt := time.Now().Add(-10 * time.Minute)
	freshDispatchedAt := time.Now()
	oldStartedAt := time.Now().Add(-3 * time.Hour)
	freshStartedAt := time.Now()
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, DispatchedAt: &oldDispatchedAt, AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, StartedAt: &oldStartedAt, AttemptNumber: 1},
			{PRNodeID: 12, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusDispatched, DispatchedAt: &freshDispatchedAt, AttemptNumber: 1},
			{PRNodeID: 13, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, StartedAt: &freshStartedAt, AttemptNumber: 1},
			{PRNodeID: 14, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusCompleted, StartedAt: &oldStartedAt, AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	failedTasks, err := repo.FailStaleAgentTasks(context.Background(), time.Now().Add(-5*time.Minute), time.Now().Add(-2*time.Hour))

	require.NoError(t, err)
	require.Len(t, failedTasks, 2)
	require.Equal(t, bundle.Tasks[0].ID, failedTasks[0].ID)
	require.Equal(t, domain.AgentTaskStatusFailed, failedTasks[0].Status)
	require.Equal(t, "dispatch_timeout", failedTasks[0].FailureReason)
	require.Contains(t, failedTasks[0].ErrorLog, "task dispatch timed out")
	require.NotNil(t, failedTasks[0].FinishedAt)
	require.Equal(t, bundle.Tasks[1].ID, failedTasks[1].ID)
	require.Equal(t, domain.AgentTaskStatusFailed, failedTasks[1].Status)
	require.Equal(t, "execution_timeout", failedTasks[1].FailureReason)
	require.Contains(t, failedTasks[1].ErrorLog, "task execution timed out")
	require.NotNil(t, failedTasks[1].FinishedAt)

	found, err := repo.FindExecutionBundleByRunID(context.Background(), bundle.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, found.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusFailed, found.Tasks[1].Status)
	require.Equal(t, domain.AgentTaskStatusDispatched, found.Tasks[2].Status)
	require.Equal(t, domain.AgentTaskStatusRunning, found.Tasks[3].Status)
	require.Equal(t, domain.AgentTaskStatusCompleted, found.Tasks[4].Status)
}

func TestRepositoryCancelsActiveTasksByRunID(t *testing.T) {
	repo := newTestExecutionRepository(t)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 10, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusQueued, AttemptNumber: 1},
			{PRNodeID: 11, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusRunning, AttemptNumber: 1},
			{PRNodeID: 12, Executor: ExecutorNameCodexCLI, Status: domain.AgentTaskStatusCompleted, AttemptNumber: 1},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	cancelled, err := repo.CancelActiveTasksByRunID(context.Background(), bundle.Run.ID)

	require.NoError(t, err)
	require.Len(t, cancelled, 2)
	require.Equal(t, domain.AgentTaskStatusCancelled, cancelled[0].Status)
	require.Equal(t, "run_cancelled", cancelled[0].FailureReason)
	require.NotNil(t, cancelled[0].FinishedAt)
	found, err := repo.FindExecutionBundleByRunID(context.Background(), bundle.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusCancelled, found.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusCancelled, found.Tasks[1].Status)
	require.Equal(t, domain.AgentTaskStatusCompleted, found.Tasks[2].Status)
}

func TestRepositoryCreatesRetryAgentTask(t *testing.T) {
	repo := newTestExecutionRepository(t)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{
				PRNodeID:      10,
				Executor:      ExecutorNameCodexCLI,
				Status:        domain.AgentTaskStatusFailed,
				AttemptNumber: 1,
				SessionID:     "session_123",
				Workdir:       "/tmp/specforge/task",
			},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	retry, err := repo.CreateRetryAgentTask(context.Background(), bundle.Tasks[0], domain.AgentTaskStatusQueued, false)

	require.NoError(t, err)
	require.NotEqual(t, bundle.Tasks[0].ID, retry.ID)
	require.Equal(t, bundle.Tasks[0].ID, *retry.ParentTaskID)
	require.Equal(t, 2, retry.AttemptNumber)
	require.Equal(t, domain.AgentTaskStatusQueued, retry.Status)
	require.Equal(t, "session_123", retry.SessionID)
	require.Equal(t, "/tmp/specforge/task", retry.Workdir)
	found, err := repo.FindExecutionBundleByRunID(context.Background(), bundle.Run.ID)
	require.NoError(t, err)
	require.Len(t, found.Tasks, 2)
	require.Equal(t, domain.AgentTaskStatusFailed, found.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusQueued, found.Tasks[1].Status)
}

func TestRepositoryCreatesFreshRetryAgentTask(t *testing.T) {
	repo := newTestExecutionRepository(t)
	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    1,
			Status:    domain.ExecutionRunStatusRunning,
			StartedBy: 7,
			StartedAt: time.Now(),
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{
				PRNodeID:      10,
				Executor:      ExecutorNameCodexCLI,
				Status:        domain.AgentTaskStatusFailed,
				AttemptNumber: 2,
				SessionID:     "session_123",
				Workdir:       "/tmp/specforge/task",
			},
		},
	}
	require.NoError(t, repo.CreateExecutionBundle(context.Background(), bundle))

	retry, err := repo.CreateRetryAgentTask(context.Background(), bundle.Tasks[0], domain.AgentTaskStatusQueued, true)

	require.NoError(t, err)
	require.Equal(t, 3, retry.AttemptNumber)
	require.Empty(t, retry.SessionID)
	require.Empty(t, retry.Workdir)
}

func newTestExecutionRepository(t *testing.T) *repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&ExecutionRunPO{}, &AgentTaskPO{}, &RuntimePO{}, &TaskEventPO{}))
	return NewRepository(db)
}
