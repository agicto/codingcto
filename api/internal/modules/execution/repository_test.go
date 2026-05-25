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

func newTestExecutionRepository(t *testing.T) *repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&ExecutionRunPO{}, &AgentTaskPO{}, &RuntimePO{}))
	return NewRepository(db)
}
