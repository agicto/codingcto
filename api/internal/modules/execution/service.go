package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"github.com/zgiai/luas/api/pkg/redact"
)

type Service interface {
	StartRun(ctx context.Context, userID, planID uint, req *StartExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	GetRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error)
	DispatchRun(ctx context.Context, runID uint, req *DispatchExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	CancelRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error)
	HeartbeatRuntime(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error)
	DeregisterRuntimes(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error)
	ListRuntimes(ctx context.Context, req *ListRuntimesRequest) (*RuntimeListResponse, error)
	ListRuntimePendingTasks(ctx context.Context, runtimeID, executor string) (*RuntimePendingTasksResponse, error)
	SweepStaleRuntimes(ctx context.Context, req *RuntimeSweepRequest) (*domain.SpecForgeRuntimeSweepResult, error)
	SweepStaleTasks(ctx context.Context, req *StaleTaskSweepRequest) (*domain.SpecForgeTaskSweepResult, error)
	ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error)
	RetryTask(ctx context.Context, taskID uint, req *RetryAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
	CreateFixTaskForPRNode(ctx context.Context, prNodeID uint, req *FixAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
	CreateReviewPatchTask(ctx context.Context, taskID uint, req *ReviewPatchAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
	CreateReviewPatchTaskForGitHubPR(ctx context.Context, prNumber int, req *ReviewPatchAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
	UnlockReadyTasksForPRNode(ctx context.Context, prNodeID uint) (*domain.SpecForgeExecutionBundle, error)
	CancelTasksBlockedByClosedPRNode(ctx context.Context, prNodeID uint) (*domain.SpecForgeExecutionBundle, error)
	PinTaskSession(ctx context.Context, taskID uint, req *PinAgentTaskSessionRequest) (*domain.SpecForgeExecutionBundle, error)
	ExecuteTask(ctx context.Context, taskID uint, req *ExecuteAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
	SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error)
	CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error)
	ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*domain.SpecForgeTaskEvent, error)
	CompleteTask(ctx context.Context, taskID uint) (*domain.SpecForgeExecutionBundle, error)
}

type PRNodeDeliverer interface {
	DeliverPRNode(ctx context.Context, req *githubintegration.DeliverPRNodeRequest) (*domain.SpecForgePRNode, error)
}

type PRNodeBranchPreparer interface {
	PreparePRNodeBranch(ctx context.Context, req *githubintegration.PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error)
}

type service struct {
	repo               domain.SpecForgeExecutionRepository
	planningRepo       domain.SpecForgePlanningRepository
	skillRepo          domain.SpecForgeSkillRepository
	repositoryResolver RepositoryResolver
	executor           CodeExecutor
	worktrees          WorktreeManager
	preparer           PRNodeBranchPreparer
	deliverer          PRNodeDeliverer
	eventBus           *events.EventBus
}

func NewService(repo domain.SpecForgeExecutionRepository, planningRepo domain.SpecForgePlanningRepository, repositoryResolver RepositoryResolver, executor CodeExecutor, worktrees WorktreeManager, preparer PRNodeBranchPreparer, deliverer PRNodeDeliverer) *service {
	return newService(repo, planningRepo, repositoryResolver, executor, worktrees, preparer, deliverer, nil)
}

func NewEventedService(repo domain.SpecForgeExecutionRepository, planningRepo domain.SpecForgePlanningRepository, repositoryResolver RepositoryResolver, executor CodeExecutor, worktrees WorktreeManager, preparer PRNodeBranchPreparer, deliverer PRNodeDeliverer, eventBus *events.EventBus) *service {
	return newService(repo, planningRepo, repositoryResolver, executor, worktrees, preparer, deliverer, eventBus)
}

func newService(repo domain.SpecForgeExecutionRepository, planningRepo domain.SpecForgePlanningRepository, repositoryResolver RepositoryResolver, executor CodeExecutor, worktrees WorktreeManager, preparer PRNodeBranchPreparer, deliverer PRNodeDeliverer, eventBus *events.EventBus) *service {
	if executor == nil {
		executor = NewCodexCLIExecutor(CodexCLIExecutorConfig{}, nil)
	}
	var skillRepo domain.SpecForgeSkillRepository
	if repo, ok := planningRepo.(domain.SpecForgeSkillRepository); ok {
		skillRepo = repo
	}
	return &service{repo: repo, planningRepo: planningRepo, skillRepo: skillRepo, repositoryResolver: repositoryResolver, executor: executor, worktrees: worktrees, preparer: preparer, deliverer: deliverer, eventBus: eventBus}
}

func (s *service) StartRun(ctx context.Context, userID, planID uint, req *StartExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error) {
	if userID == 0 || planID == 0 {
		return nil, domain.ErrInvalidInput
	}

	plan, err := s.planningRepo.FindPlanBundleByPlanID(ctx, planID)
	if err != nil {
		return nil, err
	}
	if plan.Plan.Status != domain.PlanStatusApproved {
		return nil, domain.ErrConflict
	}
	if !domain.ExecutableSpecForgePRDAG(plan.PRNodes) {
		return nil, domain.ErrConflict
	}
	selectedNodes, err := selectedPRNodes(plan.PRNodes, req)
	if err != nil {
		return nil, err
	}
	if !domain.ExecutableSpecForgePRDAG(selectedNodes) {
		return nil, domain.ErrConflict
	}
	if _, err := s.repo.FindLatestActiveExecutionBundleByPlanID(ctx, planID); err == nil {
		return nil, domain.ErrConflict
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("find active execution run: %w", err)
	}
	if err := s.ensureImplementationPrompts(ctx, userID, plan, selectedNodes); err != nil {
		return nil, err
	}

	executor := "codex_cli"
	if req != nil && strings.TrimSpace(req.Executor) != "" {
		executor = strings.TrimSpace(req.Executor)
	}

	bundle := &domain.SpecForgeExecutionBundle{
		Run: &domain.SpecForgeExecutionRun{
			PlanID:    planID,
			Status:    domain.ExecutionRunStatusQueued,
			StartedBy: userID,
			StartedAt: time.Now(),
		},
		Plan:  plan,
		Tasks: buildInitialTasks(selectedNodes, executor),
	}
	if err := s.repo.CreateExecutionBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create execution run: %w", err)
	}
	return attachExecutionRange(bundle), nil
}

func selectedPRNodes(nodes []*domain.SpecForgePRNode, req *StartExecutionRunRequest) ([]*domain.SpecForgePRNode, error) {
	if req == nil || len(req.PRNodeIDs) == 0 {
		return nodes, nil
	}

	selectedIDs := make(map[uint]struct{}, len(req.PRNodeIDs))
	for _, id := range req.PRNodeIDs {
		if id == 0 {
			return nil, domain.ErrInvalidInput
		}
		selectedIDs[id] = struct{}{}
	}

	nodesByKey := make(map[string]*domain.SpecForgePRNode, len(nodes))
	selected := make([]*domain.SpecForgePRNode, 0, len(selectedIDs))
	for _, node := range nodes {
		if node == nil {
			continue
		}
		nodesByKey[node.NodeKey] = node
		if _, ok := selectedIDs[node.ID]; ok {
			selected = append(selected, node)
			delete(selectedIDs, node.ID)
		}
	}
	if len(selectedIDs) > 0 || len(selected) == 0 {
		return nil, domain.ErrInvalidInput
	}

	selectedKeys := make(map[string]struct{}, len(selected))
	for _, node := range selected {
		selectedKeys[node.NodeKey] = struct{}{}
	}
	for _, node := range selected {
		for _, dependency := range node.DependsOn {
			dependencyNode := nodesByKey[strings.TrimSpace(dependency)]
			if dependencyNode == nil {
				return nil, domain.ErrConflict
			}
			if _, ok := selectedKeys[dependencyNode.NodeKey]; !ok {
				return nil, domain.ErrConflict
			}
		}
	}

	return selected, nil
}

func (s *service) ensureImplementationPrompts(ctx context.Context, userID uint, bundle *domain.SpecForgePlanBundle, nodes []*domain.SpecForgePRNode) error {
	if bundle == nil || bundle.Plan == nil {
		return domain.ErrInvalidInput
	}
	for _, node := range nodes {
		if node == nil || node.ID == 0 {
			continue
		}
		if err := s.ensurePromptForPRNode(ctx, userID, bundle, node, domain.PromptTypeImplementation, nil); err != nil {
			return err
		}
	}
	return nil
}

func (s *service) ensurePromptForPRNode(ctx context.Context, userID uint, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, promptType string, parent *domain.SpecForgeAgentTask) error {
	promptType = strings.TrimSpace(promptType)
	if bundle == nil || bundle.Plan == nil || node == nil || node.ID == 0 || promptType == "" {
		return domain.ErrInvalidInput
	}
	_, err := s.planningRepo.FindLatestCompiledPromptByPRNodeIDAndType(ctx, node.ID, promptType)
	if err == nil {
		return nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return fmt.Errorf("find %s prompt for PR node: %w", promptType, err)
	}
	return s.createPromptForPRNode(ctx, userID, bundle, node, promptType, parent)
}

func (s *service) createPromptForPRNode(ctx context.Context, userID uint, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, promptType string, parent *domain.SpecForgeAgentTask) error {
	promptType = strings.TrimSpace(promptType)
	if bundle == nil || bundle.Plan == nil || node == nil || node.ID == 0 || promptType == "" {
		return domain.ErrInvalidInput
	}
	skills, err := s.activeSkillsFor(ctx, bundle)
	if err != nil {
		return err
	}
	text := compileRunPromptText(bundle, node, promptType, parent, skills)
	hash := sha256.Sum256([]byte(text))
	prompt := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   node.ID,
		PlanID:     bundle.Plan.ID,
		Type:       promptType,
		Version:    "prompt_v1",
		PromptText: text,
		PromptHash: hex.EncodeToString(hash[:]),
		CreatedBy:  userID,
	}
	if err := s.planningRepo.CreateCompiledPrompt(ctx, prompt); err != nil {
		return fmt.Errorf("create %s prompt for PR node: %w", promptType, err)
	}
	return nil
}

func (s *service) activeSkillsFor(ctx context.Context, bundle *domain.SpecForgePlanBundle) ([]*domain.SpecForgeSkill, error) {
	if s.skillRepo == nil || bundle == nil || bundle.Idea == nil || strings.TrimSpace(bundle.Idea.RepositoryID) == "" {
		return []*domain.SpecForgeSkill{}, nil
	}
	skills, err := s.skillRepo.ListActiveSkillsByRepositoryID(ctx, bundle.Idea.RepositoryID)
	if err != nil {
		return nil, fmt.Errorf("load active repo skills: %w", err)
	}
	return skills, nil
}

func (s *service) GetRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error) {
	if runID == 0 {
		return nil, domain.ErrInvalidInput
	}
	bundle, err := s.repo.FindExecutionBundleByRunID(ctx, runID)
	if err != nil {
		return nil, err
	}
	if bundle.Run != nil {
		plan, err := s.planningRepo.FindPlanBundleByPlanID(ctx, bundle.Run.PlanID)
		if err != nil {
			return nil, err
		}
		bundle.Plan = plan
	}
	return attachExecutionRange(bundle), nil
}

func attachExecutionRange(bundle *domain.SpecForgeExecutionBundle) *domain.SpecForgeExecutionBundle {
	if bundle == nil {
		return nil
	}
	seen := make(map[uint]struct{}, len(bundle.Tasks))
	selected := make([]uint, 0, len(bundle.Tasks))
	for _, task := range bundle.Tasks {
		if task == nil || task.PRNodeID == 0 {
			continue
		}
		if _, ok := seen[task.PRNodeID]; ok {
			continue
		}
		seen[task.PRNodeID] = struct{}{}
		selected = append(selected, task.PRNodeID)
	}
	bundle.SelectedPRNodeIDs = selected
	return bundle
}

func (s *service) DispatchRun(ctx context.Context, runID uint, req *DispatchExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error) {
	if runID == 0 {
		return nil, domain.ErrInvalidInput
	}
	limit := 20
	if req != nil && req.MaxTasks > 0 {
		limit = req.MaxTasks
	}

	bundle, err := s.GetRun(ctx, runID)
	if err != nil {
		return nil, err
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil, domain.ErrConflict
	}
	dispatched := 0
	now := time.Now()
	for _, task := range bundle.Tasks {
		if task.Status != domain.AgentTaskStatusQueued {
			continue
		}
		task.Status = domain.AgentTaskStatusDispatched
		task.DispatchedAt = &now
		if task.AttemptNumber == 0 {
			task.AttemptNumber = 1
		}
		if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
			return nil, fmt.Errorf("dispatch agent task: %w", err)
		}
		dispatched++
		if dispatched >= limit {
			break
		}
	}
	if dispatched > 0 && bundle.Run.Status == domain.ExecutionRunStatusQueued {
		bundle.Run.Status = domain.ExecutionRunStatusRunning
		if err := s.repo.UpdateExecutionRun(ctx, bundle.Run); err != nil {
			return nil, fmt.Errorf("update execution run: %w", err)
		}
	}
	return s.GetRun(ctx, runID)
}

func (s *service) CancelRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error) {
	if runID == 0 {
		return nil, domain.ErrInvalidInput
	}
	bundle, err := s.GetRun(ctx, runID)
	if err != nil {
		return nil, err
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil, domain.ErrConflict
	}
	tasks, err := s.repo.CancelActiveTasksByRunID(ctx, runID)
	if err != nil {
		return nil, fmt.Errorf("cancel active agent tasks: %w", err)
	}
	if err := s.publishFixTasksFinished(ctx, tasks); err != nil {
		return nil, err
	}
	now := time.Now()
	bundle.Run.Status = domain.ExecutionRunStatusCancelled
	bundle.Run.CompletedAt = &now
	if err := s.repo.UpdateExecutionRun(ctx, bundle.Run); err != nil {
		return nil, fmt.Errorf("cancel execution run: %w", err)
	}
	return s.GetRun(ctx, runID)
}

func (s *service) HeartbeatRuntime(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error) {
	if req == nil || strings.TrimSpace(req.RuntimeID) == "" {
		return nil, domain.ErrInvalidInput
	}
	executor := strings.TrimSpace(req.Executor)
	if executor == "" {
		executor = ExecutorNameCodexCLI
	}
	runtime := &domain.SpecForgeRuntime{
		RuntimeID:  strings.TrimSpace(req.RuntimeID),
		Executor:   executor,
		Status:     domain.RuntimeStatusOnline,
		Hostname:   strings.TrimSpace(req.Hostname),
		Version:    strings.TrimSpace(req.Version),
		LastSeenAt: time.Now(),
	}
	if err := s.repo.UpsertRuntime(ctx, runtime); err != nil {
		return nil, fmt.Errorf("upsert runtime heartbeat: %w", err)
	}
	pending, err := s.repo.HasClaimableAgentTask(ctx, runtime.RuntimeID, runtime.Executor)
	if err != nil {
		return nil, fmt.Errorf("check claimable task: %w", err)
	}
	return &RuntimeHeartbeatResponse{Runtime: runtime, ClaimPending: pending}, nil
}

func (s *service) DeregisterRuntimes(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	if req == nil || len(req.RuntimeIDs) == 0 {
		return nil, domain.ErrInvalidInput
	}
	runtimeIDs := compactStrings(req.RuntimeIDs)
	if len(runtimeIDs) == 0 {
		return nil, domain.ErrInvalidInput
	}
	runtimes, err := s.repo.MarkRuntimesOfflineByRuntimeIDs(ctx, runtimeIDs)
	if err != nil {
		return nil, fmt.Errorf("mark deregistered runtimes offline: %w", err)
	}
	tasks, err := s.repo.FailTasksForRuntimeIDs(ctx, runtimeIDs, "runtime_deregistered", "runtime deregistered")
	if err != nil {
		return nil, fmt.Errorf("fail tasks for deregistered runtimes: %w", err)
	}
	if err := s.markPRNodesBlockedForFailedTasks(ctx, tasks); err != nil {
		return nil, err
	}
	if err := s.publishFixTasksFinished(ctx, tasks); err != nil {
		return nil, err
	}
	return &domain.SpecForgeRuntimeSweepResult{
		OfflineRuntimes: runtimes,
		FailedTasks:     tasks,
	}, nil
}

func (s *service) ListRuntimes(ctx context.Context, req *ListRuntimesRequest) (*RuntimeListResponse, error) {
	if req == nil {
		req = &ListRuntimesRequest{}
	}
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	runtimes, err := s.repo.ListRuntimes(ctx, strings.TrimSpace(req.Executor), strings.TrimSpace(req.Status), limit)
	if err != nil {
		return nil, fmt.Errorf("list runtimes: %w", err)
	}
	return &RuntimeListResponse{Runtimes: runtimes}, nil
}

func (s *service) ListRuntimePendingTasks(ctx context.Context, runtimeID, executor string) (*RuntimePendingTasksResponse, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	executor = strings.TrimSpace(executor)
	if runtimeID == "" {
		return nil, domain.ErrInvalidInput
	}
	tasks, err := s.repo.ListPendingAgentTasksByRuntime(ctx, runtimeID, executor)
	if err != nil {
		return nil, fmt.Errorf("list runtime pending tasks: %w", err)
	}
	return &RuntimePendingTasksResponse{Tasks: tasks}, nil
}

func (s *service) SweepStaleRuntimes(ctx context.Context, req *RuntimeSweepRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	staleSeconds := 300
	if req != nil && req.StaleSeconds > 0 {
		staleSeconds = req.StaleSeconds
	}
	staleBefore := time.Now().Add(-time.Duration(staleSeconds) * time.Second)
	runtimes, err := s.repo.MarkStaleRuntimesOffline(ctx, staleBefore)
	if err != nil {
		return nil, fmt.Errorf("mark stale runtimes offline: %w", err)
	}
	tasks, err := s.repo.FailTasksForOfflineRuntimes(ctx)
	if err != nil {
		return nil, fmt.Errorf("fail tasks for offline runtimes: %w", err)
	}
	if err := s.markPRNodesBlockedForFailedTasks(ctx, tasks); err != nil {
		return nil, err
	}
	if err := s.publishFixTasksFinished(ctx, tasks); err != nil {
		return nil, err
	}
	return &domain.SpecForgeRuntimeSweepResult{
		OfflineRuntimes: runtimes,
		FailedTasks:     tasks,
	}, nil
}

func (s *service) SweepStaleTasks(ctx context.Context, req *StaleTaskSweepRequest) (*domain.SpecForgeTaskSweepResult, error) {
	dispatchTimeoutSeconds := 300
	runningTimeoutSeconds := 9000
	if req != nil {
		if req.DispatchTimeoutSeconds > 0 {
			dispatchTimeoutSeconds = req.DispatchTimeoutSeconds
		}
		if req.RunningTimeoutSeconds > 0 {
			runningTimeoutSeconds = req.RunningTimeoutSeconds
		}
	}
	now := time.Now()
	tasks, err := s.repo.FailStaleAgentTasks(
		ctx,
		now.Add(-time.Duration(dispatchTimeoutSeconds)*time.Second),
		now.Add(-time.Duration(runningTimeoutSeconds)*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("fail stale agent tasks: %w", err)
	}
	if err := s.markPRNodesBlockedForFailedTasks(ctx, tasks); err != nil {
		return nil, err
	}
	if err := s.publishFixTasksFinished(ctx, tasks); err != nil {
		return nil, err
	}
	return &domain.SpecForgeTaskSweepResult{FailedTasks: tasks}, nil
}

func (s *service) ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	if runtimeID == "" {
		return nil, domain.ErrInvalidInput
	}
	if req == nil {
		req = &ClaimAgentTaskRequest{}
	}
	task, err := s.repo.ClaimDispatchedAgentTask(ctx, runtimeID, req.Executor, req.SessionID, req.Workdir)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return &ClaimAgentTaskResponse{}, nil
		}
		return nil, fmt.Errorf("claim agent task: %w", err)
	}
	claim, err := s.buildClaimResponse(ctx, task)
	if err != nil {
		task.Status = domain.AgentTaskStatusDispatched
		task.RuntimeID = ""
		task.SessionID = ""
		task.Workdir = ""
		task.StartedAt = nil
		if updateErr := s.repo.UpdateAgentTask(ctx, task); updateErr != nil {
			return nil, fmt.Errorf("revert unservable claimed task: %w", updateErr)
		}
		return nil, err
	}
	return claim, nil
}

func (s *service) RetryTask(ctx context.Context, taskID uint, req *RetryAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if req == nil {
		req = &RetryAgentTaskRequest{}
	}
	parent, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if parent.Status != domain.AgentTaskStatusFailed && parent.Status != domain.AgentTaskStatusCancelled {
		return nil, domain.ErrConflict
	}
	bundle, err := s.GetRun(ctx, parent.RunID)
	if err != nil {
		return nil, err
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil, domain.ErrConflict
	}
	status := domain.AgentTaskStatusWaiting
	node := nodeByID(bundle.Plan.PRNodes)[parent.PRNodeID]
	if node == nil {
		return nil, domain.ErrNotFound
	}
	if dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)) {
		status = domain.AgentTaskStatusQueued
	}
	promptType := retryPromptType(parent)
	if err := s.ensurePromptForPRNode(ctx, 0, bundle.Plan, node, promptType, parent); err != nil {
		return nil, err
	}
	if _, err := s.repo.CreateRetryAgentTask(ctx, parent, status, req.ForceFreshSession); err != nil {
		return nil, fmt.Errorf("create retry agent task: %w", err)
	}
	return s.GetRun(ctx, parent.RunID)
}

func (s *service) CreateFixTaskForPRNode(ctx context.Context, prNodeID uint, req *FixAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error) {
	if prNodeID == 0 || req == nil || strings.TrimSpace(req.FailureType) == "" {
		return nil, domain.ErrInvalidInput
	}
	parent, err := s.repo.FindLatestTerminalAgentTaskByPRNodeID(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	bundle, err := s.GetRun(ctx, parent.RunID)
	if err != nil {
		return nil, err
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil, domain.ErrConflict
	}
	node := nodeByID(bundle.Plan.PRNodes)[parent.PRNodeID]
	if node == nil {
		return nil, domain.ErrNotFound
	}
	status := domain.AgentTaskStatusWaiting
	if dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)) {
		status = domain.AgentTaskStatusQueued
	}
	fixParent := *parent
	fixParent.PromptType = domain.PromptTypeFix
	fixParent.FailureReason = strings.TrimSpace(req.FailureType)
	if req.FixAttemptID > 0 {
		fixParent.FixAttemptID = &req.FixAttemptID
	}
	fixParent.ErrorLog = fixTaskFailureContext(req)
	if err := s.createPromptForPRNode(ctx, 0, bundle.Plan, node, domain.PromptTypeFix, &fixParent); err != nil {
		return nil, err
	}
	if _, err := s.repo.CreateRetryAgentTask(ctx, &fixParent, status, req.ForceFreshSession); err != nil {
		return nil, fmt.Errorf("create fix agent task: %w", err)
	}
	return s.GetRun(ctx, parent.RunID)
}

func (s *service) CreateReviewPatchTask(ctx context.Context, taskID uint, req *ReviewPatchAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 || req == nil || strings.TrimSpace(req.Feedback) == "" {
		return nil, domain.ErrInvalidInput
	}
	parent, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if parent.Status != domain.AgentTaskStatusCompleted && parent.Status != domain.AgentTaskStatusFailed && parent.Status != domain.AgentTaskStatusCancelled {
		return nil, domain.ErrConflict
	}
	bundle, err := s.GetRun(ctx, parent.RunID)
	if err != nil {
		return nil, err
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil, domain.ErrConflict
	}
	node := nodeByID(bundle.Plan.PRNodes)[parent.PRNodeID]
	if node == nil {
		return nil, domain.ErrNotFound
	}
	status := domain.AgentTaskStatusWaiting
	if dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)) {
		status = domain.AgentTaskStatusQueued
	}
	reviewParent := *parent
	reviewParent.PromptType = domain.PromptTypeReviewPatch
	reviewParent.FailureReason = "review_feedback"
	reviewParent.ErrorLog = strings.TrimSpace(req.Feedback)
	if err := s.createPromptForPRNode(ctx, 0, bundle.Plan, node, domain.PromptTypeReviewPatch, &reviewParent); err != nil {
		return nil, err
	}
	if _, err := s.repo.CreateRetryAgentTask(ctx, &reviewParent, status, req.ForceFreshSession); err != nil {
		return nil, fmt.Errorf("create review patch agent task: %w", err)
	}
	return s.GetRun(ctx, parent.RunID)
}

func fixTaskFailureContext(req *FixAgentTaskRequest) string {
	if req == nil {
		return ""
	}
	parts := make([]string, 0, 3)
	if value := strings.TrimSpace(req.LikelyCause); value != "" {
		parts = append(parts, "Likely cause: "+value)
	}
	if value := strings.TrimSpace(req.RecommendedAction); value != "" {
		parts = append(parts, "Recommended action: "+value)
	}
	if value := strings.TrimSpace(req.CILogExcerpt); value != "" {
		parts = append(parts, "CI log excerpt:\n"+value)
	}
	return strings.Join(parts, "\n\n")
}

func (s *service) CreateReviewPatchTaskForGitHubPR(ctx context.Context, prNumber int, req *ReviewPatchAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error) {
	if prNumber <= 0 || req == nil || strings.TrimSpace(req.Feedback) == "" {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByGitHubPRNumber(ctx, prNumber)
	if err != nil {
		return nil, err
	}
	parent, err := s.repo.FindLatestTerminalAgentTaskByPRNodeID(ctx, node.ID)
	if err != nil {
		return nil, err
	}
	return s.CreateReviewPatchTask(ctx, parent.ID, req)
}

func (s *service) UnlockReadyTasksForPRNode(ctx context.Context, prNodeID uint) (*domain.SpecForgeExecutionBundle, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	if !prNodeStatusSatisfiesDependency(node.Status) {
		return nil, domain.ErrConflict
	}
	bundle, err := s.repo.FindLatestActiveExecutionBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return nil, err
	}
	plan, err := s.planningRepo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return nil, err
	}
	bundle.Plan = plan
	if err := s.unlockReadyTasks(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.completeRunIfDeliveryReady(ctx, bundle, time.Now()); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, bundle.Run.ID)
}

func (s *service) CancelTasksBlockedByClosedPRNode(ctx context.Context, prNodeID uint) (*domain.SpecForgeExecutionBundle, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	if node.Status != domain.PRNodeStatusClosed {
		return nil, domain.ErrConflict
	}
	bundle, err := s.repo.FindLatestActiveExecutionBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return nil, err
	}
	plan, err := s.planningRepo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return nil, err
	}
	bundle.Plan = plan
	blockedKeys := nodeKeysBlockedByClosedDependency(plan.PRNodes, node.NodeKey)
	nodeByID := nodeByID(plan.PRNodes)
	now := time.Now()
	for _, task := range bundle.Tasks {
		if task == nil {
			continue
		}
		taskNode := nodeByID[task.PRNodeID]
		if taskNode == nil {
			continue
		}
		if _, ok := blockedKeys[taskNode.NodeKey]; !ok {
			continue
		}
		switch task.Status {
		case domain.AgentTaskStatusQueued, domain.AgentTaskStatusDispatched, domain.AgentTaskStatusWaiting, domain.AgentTaskStatusRunning:
			task.Status = domain.AgentTaskStatusCancelled
			task.FailureReason = "dependency_closed"
			task.FinishedAt = &now
			if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
				return nil, fmt.Errorf("cancel task blocked by closed PR node: %w", err)
			}
		}
	}
	return s.GetRun(ctx, bundle.Run.ID)
}

func (s *service) PinTaskSession(ctx context.Context, taskID uint, req *PinAgentTaskSessionRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 || req == nil {
		return nil, domain.ErrInvalidInput
	}
	sessionID := strings.TrimSpace(req.SessionID)
	workdir := strings.TrimSpace(req.Workdir)
	if sessionID == "" && workdir == "" {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}
	if sessionID != "" {
		task.SessionID = sessionID
	}
	if workdir != "" {
		task.Workdir = workdir
	}
	if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
		return nil, fmt.Errorf("pin agent task session: %w", err)
	}
	return s.GetRun(ctx, task.RunID)
}

func (s *service) ExecuteTask(ctx context.Context, taskID uint, req *ExecuteAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 || req == nil {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}
	now := time.Now()
	task.Status = domain.AgentTaskStatusRunning
	if runtimeID := strings.TrimSpace(req.RuntimeID); runtimeID != "" {
		task.RuntimeID = runtimeID
	}
	if sessionID := strings.TrimSpace(req.SessionID); sessionID != "" {
		task.SessionID = sessionID
	}
	if workdir := strings.TrimSpace(req.Workdir); workdir != "" {
		task.Workdir = workdir
	}
	if task.AttemptNumber == 0 {
		task.AttemptNumber = 1
	}
	if task.StartedAt == nil {
		task.StartedAt = &now
	}
	if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
		return nil, fmt.Errorf("mark agent task running: %w", err)
	}
	branchName, err := s.prepareTaskBranch(ctx, task)
	if err != nil {
		return s.failTaskBeforeExecutor(ctx, task, "branch_preparation_failed", err.Error())
	}
	if strings.TrimSpace(task.Workdir) == "" {
		worktree, err := s.prepareTaskWorktree(ctx, task, branchName)
		if err != nil {
			return s.failTaskBeforeExecutor(ctx, task, "worktree_preparation_failed", err.Error())
		}
		task.Workdir = worktree
		if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
			return nil, fmt.Errorf("update agent task worktree: %w", err)
		}
	}
	prompt, err := s.planningRepo.FindLatestCompiledPromptByPRNodeIDAndType(ctx, task.PRNodeID, taskPromptType(task))
	if err != nil {
		return nil, err
	}
	result, runErr := s.executor.Run(ctx, ExecutionContext{
		RunID:      strconv.FormatUint(uint64(task.RunID), 10),
		TaskID:     task.ID,
		Workdir:    task.Workdir,
		BranchName: branchName,
		Env:        req.Env,
	}, CompiledExecutionPrompt{
		ID:         prompt.ID,
		PRNodeID:   prompt.PRNodeID,
		Type:       prompt.Type,
		Version:    prompt.Version,
		PromptText: prompt.PromptText,
	})
	if result == nil {
		result = &ExecutionResult{Status: "failed", Error: "executor returned no result", ExitCode: -1}
	}

	return s.finalizeTaskResult(ctx, task, result, runErr, "")
}

func (s *service) SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 || req == nil || strings.TrimSpace(req.Status) == "" {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}
	if runtimeID := strings.TrimSpace(req.RuntimeID); runtimeID != "" {
		if strings.TrimSpace(task.RuntimeID) != "" && task.RuntimeID != runtimeID {
			return nil, domain.ErrConflict
		}
		task.RuntimeID = runtimeID
	}
	if sessionID := strings.TrimSpace(req.SessionID); sessionID != "" {
		task.SessionID = sessionID
	}
	if workdir := strings.TrimSpace(req.Workdir); workdir != "" {
		task.Workdir = workdir
	}
	result := &ExecutionResult{
		Status:   strings.TrimSpace(req.Status),
		Output:   strings.TrimSpace(req.Output),
		Error:    strings.TrimSpace(req.Error),
		ExitCode: req.ExitCode,
	}
	return s.finalizeTaskResult(ctx, task, result, nil, strings.TrimSpace(req.FailureReason))
}

func (s *service) CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error) {
	if taskID == 0 || req == nil || strings.TrimSpace(req.Type) == "" {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}
	event := &domain.SpecForgeTaskEvent{
		TaskID:  taskID,
		Type:    strings.TrimSpace(req.Type),
		Tool:    strings.TrimSpace(req.Tool),
		Content: redact.Text(strings.TrimSpace(req.Content)),
		Input:   redact.Text(strings.TrimSpace(req.Input)),
		Output:  redact.Text(strings.TrimSpace(req.Output)),
	}
	if err := s.repo.CreateTaskEvent(ctx, event); err != nil {
		return nil, fmt.Errorf("create task event: %w", err)
	}
	return event, nil
}

func (s *service) ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*domain.SpecForgeTaskEvent, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if _, err := s.repo.FindAgentTaskByID(ctx, taskID); err != nil {
		return nil, err
	}
	events, err := s.repo.ListTaskEvents(ctx, taskID, afterSeq)
	if err != nil {
		return nil, fmt.Errorf("list task events: %w", err)
	}
	return events, nil
}

func (s *service) CompleteTask(ctx context.Context, taskID uint) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}

	now := time.Now()
	task.Status = domain.AgentTaskStatusCompleted
	if task.StartedAt == nil {
		task.StartedAt = &now
	}
	task.FinishedAt = &now
	if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
		return nil, fmt.Errorf("complete agent task: %w", err)
	}
	if err := s.publishFixTaskFinished(ctx, task); err != nil {
		return nil, err
	}

	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return nil, err
	}
	if err := s.unlockReadyTasks(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.completeRunIfDeliveryReady(ctx, bundle, now); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, task.RunID)
}

func (s *service) prepareTaskBranch(ctx context.Context, task *domain.SpecForgeAgentTask) (string, error) {
	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return "", err
	}
	if bundle.Plan == nil || bundle.Plan.Idea == nil || strings.TrimSpace(bundle.Plan.Idea.RepositoryID) == "" {
		return "", domain.ErrInvalidInput
	}
	node := nodeByID(bundle.Plan.PRNodes)[task.PRNodeID]
	if node == nil {
		return "", domain.ErrNotFound
	}
	branchName := strings.TrimSpace(node.BranchName)
	if s.preparer == nil {
		return branchName, nil
	}
	_, err = s.preparer.PreparePRNodeBranch(ctx, &githubintegration.PreparePRNodeBranchRequest{
		RepositoryID: bundle.Plan.Idea.RepositoryID,
		PRNodeID:     task.PRNodeID,
	})
	if err != nil {
		return "", fmt.Errorf("prepare PR node branch: %w", err)
	}
	return branchName, nil
}

func (s *service) prepareTaskWorktree(ctx context.Context, task *domain.SpecForgeAgentTask, branchName string) (string, error) {
	if s.repositoryResolver == nil || s.worktrees == nil {
		return "", domain.ErrInvalidInput
	}
	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return "", err
	}
	if bundle.Plan == nil || bundle.Plan.Idea == nil || strings.TrimSpace(bundle.Plan.Idea.RepositoryID) == "" {
		return "", domain.ErrInvalidInput
	}
	repository, err := s.repositoryResolver.GetRepository(ctx, bundle.Plan.Idea.RepositoryID)
	if err != nil {
		return "", err
	}
	worktree, err := s.worktrees.PrepareWorktree(ctx, WorktreeRequest{
		Repository: repository,
		BranchName: branchName,
		RunID:      task.RunID,
		TaskID:     task.ID,
	})
	if err != nil {
		return "", err
	}
	if worktree == nil || strings.TrimSpace(worktree.Path) == "" {
		return "", domain.ErrInvalidInput
	}
	return strings.TrimSpace(worktree.Path), nil
}

func (s *service) deliverTaskPR(ctx context.Context, task *domain.SpecForgeAgentTask) error {
	if s.deliverer == nil {
		return nil
	}
	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return err
	}
	if bundle.Plan == nil || bundle.Plan.Idea == nil || strings.TrimSpace(bundle.Plan.Idea.RepositoryID) == "" {
		return domain.ErrInvalidInput
	}
	_, err = s.deliverer.DeliverPRNode(ctx, &githubintegration.DeliverPRNodeRequest{
		RepositoryID: bundle.Plan.Idea.RepositoryID,
		PRNodeID:     task.PRNodeID,
	})
	if err != nil {
		return fmt.Errorf("deliver PR node: %w", err)
	}
	return nil
}

func (s *service) buildClaimResponse(ctx context.Context, task *domain.SpecForgeAgentTask) (*ClaimAgentTaskResponse, error) {
	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return nil, err
	}
	if bundle.Plan == nil || bundle.Plan.Idea == nil {
		return nil, domain.ErrInvalidInput
	}
	node := nodeByID(bundle.Plan.PRNodes)[task.PRNodeID]
	if node == nil {
		return nil, domain.ErrNotFound
	}
	prompt, err := s.planningRepo.FindLatestCompiledPromptByPRNodeIDAndType(ctx, task.PRNodeID, taskPromptType(task))
	if err != nil {
		return nil, fmt.Errorf("find compiled prompt for claimed task: %w", err)
	}
	return &ClaimAgentTaskResponse{
		Task:   toClaimedAgentTask(task),
		PRNode: toClaimedTaskPRNode(node),
		Prompt: &ClaimedTaskPrompt{
			ID:         prompt.ID,
			Version:    prompt.Version,
			Type:       prompt.Type,
			PromptText: prompt.PromptText,
			PromptHash: prompt.PromptHash,
		},
		ExecutionContext: &ClaimedTaskExecutionContext{
			RepositoryID: bundle.Plan.Idea.RepositoryID,
			BranchName:   node.BranchName,
		},
	}, nil
}

func (s *service) finalizeTaskResult(ctx context.Context, task *domain.SpecForgeAgentTask, result *ExecutionResult, runErr error, failureReasonOverride string) (*domain.SpecForgeExecutionBundle, error) {
	if result == nil {
		result = &ExecutionResult{Status: "failed", Error: "executor returned no result", ExitCode: -1}
	}
	finishedAt := time.Now()
	task.OutputLog = redact.Text(result.Output)
	task.ErrorLog = redact.Text(result.Error)
	task.ExitCode = &result.ExitCode
	task.FinishedAt = &finishedAt
	if runErr != nil || result.Status != "completed" || result.ExitCode != 0 {
		task.Status = domain.AgentTaskStatusFailed
		task.FailureReason = executionFailureReason(result, runErr)
		if strings.TrimSpace(failureReasonOverride) != "" {
			task.FailureReason = strings.TrimSpace(failureReasonOverride)
		}
	} else {
		if err := s.deliverTaskPR(ctx, task); err != nil {
			task.Status = domain.AgentTaskStatusFailed
			task.FailureReason = "pr_delivery_failed"
			task.ErrorLog = appendLogLine(task.ErrorLog, err.Error())
		} else {
			task.Status = domain.AgentTaskStatusCompleted
		}
	}
	if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
		return nil, fmt.Errorf("update executed agent task: %w", err)
	}
	if task.Status == domain.AgentTaskStatusFailed {
		if err := s.markPRNodeBlockedForFailedTask(ctx, task); err != nil {
			return nil, err
		}
	}
	if err := s.publishFixTaskFinished(ctx, task); err != nil {
		return nil, err
	}
	if task.Status == domain.AgentTaskStatusFailed {
		return s.GetRun(ctx, task.RunID)
	}

	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return nil, err
	}
	if err := s.unlockReadyTasks(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.completeRunIfDeliveryReady(ctx, bundle, finishedAt); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, task.RunID)
}

func (s *service) failTaskBeforeExecutor(ctx context.Context, task *domain.SpecForgeAgentTask, reason, detail string) (*domain.SpecForgeExecutionBundle, error) {
	markTaskFailed(task, reason, detail, -1)
	if updateErr := s.repo.UpdateAgentTask(ctx, task); updateErr != nil {
		return nil, fmt.Errorf("update failed %s task: %w", reason, updateErr)
	}
	if err := s.markPRNodeBlockedForFailedTask(ctx, task); err != nil {
		return nil, err
	}
	if err := s.publishFixTaskFinished(ctx, task); err != nil {
		return nil, err
	}
	return s.GetRun(ctx, task.RunID)
}

func (s *service) markPRNodeBlockedForFailedTask(ctx context.Context, task *domain.SpecForgeAgentTask) error {
	if task == nil || task.PRNodeID == 0 {
		return nil
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, task.PRNodeID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("find failed task PR node: %w", err)
	}
	switch node.Status {
	case domain.PRNodeStatusReadyForReview, domain.PRNodeStatusMerged, domain.PRNodeStatusClosed:
		return nil
	}
	if node.Status == domain.PRNodeStatusBlocked {
		return nil
	}
	node.Status = domain.PRNodeStatusBlocked
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return fmt.Errorf("mark failed task PR node blocked: %w", err)
	}
	return nil
}

func (s *service) markPRNodesBlockedForFailedTasks(ctx context.Context, tasks []*domain.SpecForgeAgentTask) error {
	for _, task := range tasks {
		if task == nil || task.Status != domain.AgentTaskStatusFailed {
			continue
		}
		if err := s.markPRNodeBlockedForFailedTask(ctx, task); err != nil {
			return err
		}
	}
	return nil
}

func (s *service) publishFixTaskFinished(ctx context.Context, task *domain.SpecForgeAgentTask) error {
	if s.eventBus == nil || task == nil || task.FixAttemptID == nil {
		return nil
	}
	switch task.Status {
	case domain.AgentTaskStatusCompleted, domain.AgentTaskStatusFailed, domain.AgentTaskStatusCancelled:
		return s.eventBus.Publish(ctx, domain.NewSpecForgeFixTaskFinishedEvent(task))
	default:
		return nil
	}
}

func (s *service) publishFixTasksFinished(ctx context.Context, tasks []*domain.SpecForgeAgentTask) error {
	for _, task := range tasks {
		if err := s.publishFixTaskFinished(ctx, task); err != nil {
			return err
		}
	}
	return nil
}

func (s *service) completeRunIfDeliveryReady(ctx context.Context, bundle *domain.SpecForgeExecutionBundle, completedAt time.Time) error {
	if bundle == nil || bundle.Run == nil {
		return nil
	}
	if bundle.Run.Status == domain.ExecutionRunStatusCompleted || bundle.Run.Status == domain.ExecutionRunStatusCancelled {
		return nil
	}
	if !runDeliveryComplete(bundle) {
		return nil
	}
	bundle.Run.Status = domain.ExecutionRunStatusCompleted
	bundle.Run.CompletedAt = &completedAt
	if err := s.repo.UpdateExecutionRun(ctx, bundle.Run); err != nil {
		return fmt.Errorf("complete execution run: %w", err)
	}
	return nil
}

func appendLogLine(existing, line string) string {
	line = redact.Text(strings.TrimSpace(line))
	if line == "" {
		return existing
	}
	existing = strings.TrimSpace(existing)
	if existing == "" {
		return line
	}
	return existing + "\n" + line
}

func buildInitialTasks(nodes []*domain.SpecForgePRNode, executor string) []*domain.SpecForgeAgentTask {
	tasks := make([]*domain.SpecForgeAgentTask, 0, len(nodes))
	for _, node := range nodes {
		status := domain.AgentTaskStatusQueued
		if len(node.DependsOn) > 0 {
			status = domain.AgentTaskStatusWaiting
		}
		tasks = append(tasks, &domain.SpecForgeAgentTask{
			PRNodeID:      node.ID,
			Executor:      executor,
			Status:        status,
			PromptType:    domain.PromptTypeImplementation,
			AttemptNumber: 1,
		})
	}
	return tasks
}

func compileRunPromptText(bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, promptType string, parent *domain.SpecForgeAgentTask, skills []*domain.SpecForgeSkill) string {
	promptType = strings.TrimSpace(promptType)
	if promptType == "" {
		promptType = domain.PromptTypeImplementation
	}
	var b strings.Builder
	b.WriteString("You are implementing a SpecForge PR node from an approved plan snapshot.\n\n")
	b.WriteString("Prompt type: " + promptType + "\n")
	b.WriteString("PR node: " + node.NodeKey + " - " + node.Title + "\n")
	b.WriteString("Goal:\n" + strings.TrimSpace(node.Goal) + "\n\n")
	writeExecutionPromptModeInstructions(&b, promptType, parent)
	if bundle != nil && bundle.ProductSpec != nil {
		writeExecutionList(&b, "Product goals", bundle.ProductSpec.Goals)
		writeExecutionList(&b, "Product acceptance criteria", bundle.ProductSpec.AcceptanceCriteria)
	}
	if bundle != nil && bundle.Plan != nil && strings.TrimSpace(bundle.Plan.TechnicalSummary) != "" {
		b.WriteString("Technical plan:\n" + strings.TrimSpace(bundle.Plan.TechnicalSummary) + "\n\n")
	}
	writeExecutionRepoProfile(&b, bundle)
	writeExecutionSkills(&b, skills)
	writeExecutionList(&b, "Expected files", node.ExpectedFiles)
	writeExecutionList(&b, "Dependencies", node.DependsOn)
	writeExecutionList(&b, "Non-goals", node.NonGoals)
	writeExecutionList(&b, "Acceptance criteria", node.AcceptanceCriteria)
	writeExecutionList(&b, "Test commands", node.TestCommands)
	b.WriteString("Execution instructions:\n")
	b.WriteString("- Implement this PR node only; do not broaden scope beyond its non-goals.\n")
	b.WriteString("- Prefer established repository patterns discovered while editing.\n")
	b.WriteString("- Run the listed test commands before submitting the result.\n")
	b.WriteString("- Prepare a PR description with summary, scope, non-goals, tests, risks, and dependencies.\n")
	return b.String()
}

func writeExecutionRepoProfile(b *strings.Builder, bundle *domain.SpecForgePlanBundle) {
	if bundle == nil || bundle.RepoProfile == nil {
		return
	}
	profile := bundle.RepoProfile
	b.WriteString("Repository context:\n")
	if strings.TrimSpace(profile.Summary) != "" {
		b.WriteString(strings.TrimSpace(profile.Summary) + "\n")
	}
	writeExecutionList(b, "Stack", profile.Stack)
	if strings.TrimSpace(profile.CIProvider) != "" {
		b.WriteString("CI provider:\n- " + strings.TrimSpace(profile.CIProvider) + "\n\n")
	}
	writeExecutionList(b, "Repository test commands", profile.TestCommands)
	writeExecutionList(b, "App structure", profile.AppStructure)
	writeExecutionList(b, "Coding conventions", profile.CodingConventions)
	writeExecutionList(b, "Risk areas", profile.RiskAreas)
}

func writeExecutionSkills(b *strings.Builder, skills []*domain.SpecForgeSkill) {
	b.WriteString("Repository skills:\n")
	if len(skills) == 0 {
		b.WriteString("- None\n\n")
		return
	}
	wrote := false
	for _, skill := range skills {
		if skill == nil || strings.TrimSpace(skill.Name) == "" || strings.TrimSpace(skill.Content) == "" {
			continue
		}
		wrote = true
		b.WriteString("## " + strings.TrimSpace(skill.Name) + "\n")
		if strings.TrimSpace(skill.Description) != "" {
			b.WriteString(strings.TrimSpace(skill.Description) + "\n")
		}
		b.WriteString(strings.TrimSpace(skill.Content) + "\n\n")
	}
	if !wrote {
		b.WriteString("- None\n\n")
	}
}

func writeExecutionPromptModeInstructions(b *strings.Builder, promptType string, parent *domain.SpecForgeAgentTask) {
	b.WriteString("Execution mode instructions:\n")
	switch promptType {
	case domain.PromptTypeFix:
		b.WriteString("- Treat this as a targeted repair for a failed PR node, not a fresh implementation.\n")
		b.WriteString("- Inspect the failure context below and patch the smallest cause that explains it.\n")
		b.WriteString("- Keep the fix inside the PR node scope and preserve its non-goals.\n")
		if parent != nil {
			b.WriteString("\nFailure context:\n")
			if strings.TrimSpace(parent.FailureReason) != "" {
				b.WriteString("- Failure reason: " + strings.TrimSpace(parent.FailureReason) + "\n")
			}
			if strings.TrimSpace(parent.ErrorLog) != "" {
				b.WriteString("- Error log:\n" + strings.TrimSpace(parent.ErrorLog) + "\n")
			}
			if strings.TrimSpace(parent.OutputLog) != "" {
				b.WriteString("- Output log:\n" + strings.TrimSpace(parent.OutputLog) + "\n")
			}
		}
	case domain.PromptTypeReviewPatch:
		b.WriteString("- Treat this as a response to human PR review feedback.\n")
		b.WriteString("- Address only actionable review comments that belong to this PR node.\n")
		b.WriteString("- Do not add unrelated cleanup or new feature scope while addressing review feedback.\n")
		if parent != nil && strings.TrimSpace(parent.ErrorLog) != "" {
			b.WriteString("\nReview feedback:\n" + strings.TrimSpace(parent.ErrorLog) + "\n")
		}
	default:
		b.WriteString("- Implement the PR node from the approved plan snapshot.\n")
		b.WriteString("- Prefer established repo patterns over new abstractions unless the node explicitly requires one.\n")
		b.WriteString("- Keep scope, tests, and PR description aligned with the node acceptance criteria.\n")
	}
	b.WriteString("\n")
}

func writeExecutionList(b *strings.Builder, title string, values []string) {
	b.WriteString(title + ":\n")
	if len(values) == 0 {
		b.WriteString("- None\n\n")
		return
	}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		b.WriteString("- " + value + "\n")
	}
	b.WriteString("\n")
}

func taskPromptType(task *domain.SpecForgeAgentTask) string {
	if task == nil || strings.TrimSpace(task.PromptType) == "" {
		return domain.PromptTypeImplementation
	}
	return strings.TrimSpace(task.PromptType)
}

func retryPromptType(parent *domain.SpecForgeAgentTask) string {
	switch taskPromptType(parent) {
	case domain.PromptTypeReviewPatch:
		return domain.PromptTypeReviewPatch
	default:
		return domain.PromptTypeFix
	}
}

func (s *service) unlockReadyTasks(ctx context.Context, bundle *domain.SpecForgeExecutionBundle) error {
	completedNodeKeys := satisfiedDependencyNodeKeySet(bundle)
	nodeByID := nodeByID(bundle.Plan.PRNodes)
	for _, task := range bundle.Tasks {
		if task.Status != domain.AgentTaskStatusWaiting {
			continue
		}
		node := nodeByID[task.PRNodeID]
		if node == nil || !dependenciesComplete(node, completedNodeKeys) {
			continue
		}
		task.Status = domain.AgentTaskStatusQueued
		if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
			return fmt.Errorf("unlock agent task: %w", err)
		}
	}
	return nil
}

func satisfiedDependencyNodeKeySet(bundle *domain.SpecForgeExecutionBundle) map[string]struct{} {
	nodeByID := nodeByID(bundle.Plan.PRNodes)
	out := make(map[string]struct{}, len(bundle.Tasks)+len(bundle.Plan.PRNodes))
	for _, task := range bundle.Tasks {
		if task.Status != domain.AgentTaskStatusCompleted {
			continue
		}
		if node := nodeByID[task.PRNodeID]; node != nil && !prNodeRequiresStatusGate(node) {
			out[node.NodeKey] = struct{}{}
		}
	}
	for _, node := range bundle.Plan.PRNodes {
		if node == nil || !prNodeStatusSatisfiesDependency(node.Status) {
			continue
		}
		out[node.NodeKey] = struct{}{}
	}
	return out
}

func prNodeRequiresStatusGate(node *domain.SpecForgePRNode) bool {
	if node == nil {
		return false
	}
	if node.GitHubPRNumber != nil || strings.TrimSpace(node.GitHubPRURL) != "" || strings.TrimSpace(node.GitHubHeadSHA) != "" {
		return true
	}
	switch node.Status {
	case domain.PRNodeStatusPROpened, domain.PRNodeStatusCIRunning, domain.PRNodeStatusBlocked, domain.PRNodeStatusClosed:
		return true
	default:
		return false
	}
}

func prNodeStatusSatisfiesDependency(status string) bool {
	switch status {
	case domain.PRNodeStatusReadyForReview, domain.PRNodeStatusMerged:
		return true
	default:
		return false
	}
}

func nodeByID(nodes []*domain.SpecForgePRNode) map[uint]*domain.SpecForgePRNode {
	out := make(map[uint]*domain.SpecForgePRNode, len(nodes))
	for _, node := range nodes {
		out[node.ID] = node
	}
	return out
}

func dependenciesComplete(node *domain.SpecForgePRNode, completed map[string]struct{}) bool {
	for _, dependency := range node.DependsOn {
		if _, ok := completed[dependency]; !ok {
			return false
		}
	}
	return true
}

func nodeKeysBlockedByClosedDependency(nodes []*domain.SpecForgePRNode, closedNodeKey string) map[string]struct{} {
	closedNodeKey = strings.TrimSpace(closedNodeKey)
	blocked := map[string]struct{}{}
	if closedNodeKey == "" {
		return blocked
	}
	blocked[closedNodeKey] = struct{}{}
	changed := true
	for changed {
		changed = false
		for _, node := range nodes {
			if node == nil {
				continue
			}
			nodeKey := strings.TrimSpace(node.NodeKey)
			if nodeKey == "" {
				continue
			}
			if _, exists := blocked[nodeKey]; exists {
				continue
			}
			for _, dependency := range node.DependsOn {
				if _, ok := blocked[strings.TrimSpace(dependency)]; ok {
					blocked[nodeKey] = struct{}{}
					changed = true
					break
				}
			}
		}
	}
	delete(blocked, closedNodeKey)
	return blocked
}

func runDeliveryComplete(bundle *domain.SpecForgeExecutionBundle) bool {
	if bundle == nil || len(bundle.Tasks) == 0 {
		return false
	}
	selectedNodeIDs := selectedPRNodeIDSet(bundle.Tasks)
	if len(selectedNodeIDs) == 0 {
		return false
	}
	latestByNodeID := latestTaskByPRNodeID(bundle.Tasks)
	activeByNodeID := activeTaskPRNodeIDSet(bundle.Tasks)
	for nodeID := range selectedNodeIDs {
		latest := latestByNodeID[nodeID]
		if latest == nil || latest.Status != domain.AgentTaskStatusCompleted {
			return false
		}
		if _, active := activeByNodeID[nodeID]; active {
			return false
		}
	}
	if bundle.Plan == nil {
		return true
	}
	for _, node := range bundle.Plan.PRNodes {
		if node == nil {
			continue
		}
		if _, ok := selectedNodeIDs[node.ID]; !ok {
			continue
		}
		if prNodeRequiresStatusGate(node) && !prNodeStatusSatisfiesDependency(node.Status) {
			return false
		}
	}
	return true
}

func selectedPRNodeIDSet(tasks []*domain.SpecForgeAgentTask) map[uint]struct{} {
	out := make(map[uint]struct{}, len(tasks))
	for _, task := range tasks {
		if task == nil || task.PRNodeID == 0 {
			continue
		}
		out[task.PRNodeID] = struct{}{}
	}
	return out
}

func latestTaskByPRNodeID(tasks []*domain.SpecForgeAgentTask) map[uint]*domain.SpecForgeAgentTask {
	out := make(map[uint]*domain.SpecForgeAgentTask, len(tasks))
	for _, task := range tasks {
		if task == nil || task.PRNodeID == 0 {
			continue
		}
		current := out[task.PRNodeID]
		if current == nil || task.ID >= current.ID {
			out[task.PRNodeID] = task
		}
	}
	return out
}

func activeTaskPRNodeIDSet(tasks []*domain.SpecForgeAgentTask) map[uint]struct{} {
	out := make(map[uint]struct{}, len(tasks))
	for _, task := range tasks {
		if task == nil || task.PRNodeID == 0 {
			continue
		}
		if agentTaskStatusActive(task.Status) {
			out[task.PRNodeID] = struct{}{}
		}
	}
	return out
}

func agentTaskStatusActive(status string) bool {
	switch status {
	case domain.AgentTaskStatusQueued, domain.AgentTaskStatusDispatched, domain.AgentTaskStatusWaiting, domain.AgentTaskStatusRunning:
		return true
	default:
		return false
	}
}

func markTaskFailed(task *domain.SpecForgeAgentTask, reason, detail string, exitCode int) {
	now := time.Now()
	task.Status = domain.AgentTaskStatusFailed
	task.FailureReason = reason
	task.ErrorLog = appendLogLine(task.ErrorLog, detail)
	task.ExitCode = &exitCode
	task.FinishedAt = &now
}

func executionFailureReason(result *ExecutionResult, runErr error) string {
	if result != nil && strings.TrimSpace(result.Status) == "timeout" {
		return "executor_timeout"
	}
	if runErr != nil {
		return "executor_error"
	}
	return "executor_failed"
}

func toClaimedAgentTask(task *domain.SpecForgeAgentTask) *ClaimedAgentTask {
	if task == nil {
		return nil
	}
	return &ClaimedAgentTask{
		ID:            task.ID,
		RunID:         task.RunID,
		PRNodeID:      task.PRNodeID,
		Executor:      task.Executor,
		Status:        task.Status,
		PromptType:    taskPromptType(task),
		RuntimeID:     task.RuntimeID,
		AttemptNumber: task.AttemptNumber,
		ParentTaskID:  task.ParentTaskID,
		FixAttemptID:  task.FixAttemptID,
		SessionID:     task.SessionID,
		Workdir:       task.Workdir,
	}
}

func toClaimedTaskPRNode(node *domain.SpecForgePRNode) *ClaimedTaskPRNode {
	if node == nil {
		return nil
	}
	return &ClaimedTaskPRNode{
		ID:                 node.ID,
		NodeKey:            node.NodeKey,
		Title:              node.Title,
		Type:               node.Type,
		Goal:               node.Goal,
		DependsOn:          node.DependsOn,
		ExpectedFiles:      node.ExpectedFiles,
		NonGoals:           node.NonGoals,
		AcceptanceCriteria: node.AcceptanceCriteria,
		TestCommands:       node.TestCommands,
		BranchName:         node.BranchName,
	}
}
