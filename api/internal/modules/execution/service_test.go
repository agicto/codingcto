package execution

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestStartRunCreatesTasksFromApprovedPlanDAG(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo)

	bundle, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusQueued, bundle.Run.Status)
	require.Equal(t, uint(42), bundle.Run.StartedBy)
	require.Len(t, bundle.Tasks, 2)
	require.Equal(t, domain.AgentTaskStatusQueued, bundle.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusWaiting, bundle.Tasks[1].Status)
	require.Equal(t, "codex_cli", bundle.Tasks[0].Executor)
}

func TestStartRunRejectsUnapprovedPlan(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.Plan.Status = domain.PlanStatusDraft
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: bundle})

	_, err := svc.StartRun(context.Background(), 42, bundle.Plan.ID, &StartExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestGetRunAttachesPlanBundle(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{Executor: "custom"})
	require.NoError(t, err)

	found, err := svc.GetRun(context.Background(), created.Run.ID)

	require.NoError(t, err)
	require.Equal(t, created.Run.ID, found.Run.ID)
	require.Equal(t, "custom", found.Tasks[0].Executor)
	require.NotNil(t, found.Plan)
	require.Equal(t, planningRepo.bundle.Plan.ID, found.Plan.Plan.ID)
}

func TestDispatchRunMovesQueuedTasksToRunning(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)

	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusRunning, dispatched.Run.Status)
	require.Equal(t, domain.AgentTaskStatusRunning, dispatched.Tasks[0].Status)
	require.NotNil(t, dispatched.Tasks[0].StartedAt)
	require.Equal(t, domain.AgentTaskStatusWaiting, dispatched.Tasks[1].Status)
}

func TestCompleteTaskUnlocksDependentTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	updated, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.NotNil(t, updated.Tasks[0].FinishedAt)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
	require.Equal(t, domain.ExecutionRunStatusRunning, updated.Run.Status)
}

func TestCompleteTaskCompletesRunWhenAllTasksDone(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo)
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

type memoryExecutionRepo struct {
	nextID uint
	bundle *domain.SpecForgeExecutionBundle
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

func (r *memoryPlanningRepo) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	return nil
}

func (r *memoryPlanningRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	r.bundle.Plan = plan
	return nil
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
			{ID: 4, PlanID: 3, NodeKey: "PR-001", Status: domain.PRNodeStatusPlanned},
			{ID: 5, PlanID: 3, NodeKey: "PR-002", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
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
