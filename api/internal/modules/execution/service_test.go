package execution

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestStartRunCreatesTasksFromApprovedPlanDAG(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil)

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
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: bundle}, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, bundle.Plan.ID, &StartExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestGetRunAttachesPlanBundle(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil)
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
	svc := NewService(runRepo, planningRepo, nil, nil, nil)
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
	svc := NewService(runRepo, planningRepo, nil, nil, nil)
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
	svc := NewService(runRepo, planningRepo, executor, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "/tmp/repo", executor.execContext.Workdir)
	require.Equal(t, "specforge/pr-001", executor.execContext.BranchName)
	require.Equal(t, "Implement PR-001", executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
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
	svc := NewService(runRepo, planningRepo, executor, preparer, nil)
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
	svc := NewService(runRepo, planningRepo, executor, preparer, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Empty(t, executor.prompt.PromptText)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
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
	svc := NewService(runRepo, planningRepo, executor, nil, deliverer)
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
	svc := NewService(runRepo, planningRepo, executor, nil, deliverer)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
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
	svc := NewService(runRepo, planningRepo, executor, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	updated, err := svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, "boom", updated.Tasks[0].ErrorLog)
	require.NotNil(t, updated.Tasks[0].ExitCode)
	require.Equal(t, 2, *updated.Tasks[0].ExitCode)
	require.Equal(t, domain.AgentTaskStatusWaiting, updated.Tasks[1].Status)
}

func TestCompleteTaskCompletesRunWhenAllTasksDone(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil)
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
