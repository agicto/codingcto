package execution

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

type Service interface {
	StartRun(ctx context.Context, userID, planID uint, req *StartExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	GetRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error)
	DispatchRun(ctx context.Context, runID uint, req *DispatchExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	CancelRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error)
	HeartbeatRuntime(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error)
	SweepStaleRuntimes(ctx context.Context, req *RuntimeSweepRequest) (*domain.SpecForgeRuntimeSweepResult, error)
	SweepStaleTasks(ctx context.Context, req *StaleTaskSweepRequest) (*domain.SpecForgeTaskSweepResult, error)
	ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error)
	RetryTask(ctx context.Context, taskID uint, req *RetryAgentTaskRequest) (*domain.SpecForgeExecutionBundle, error)
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
	repositoryResolver RepositoryResolver
	executor           CodeExecutor
	worktrees          WorktreeManager
	preparer           PRNodeBranchPreparer
	deliverer          PRNodeDeliverer
}

func NewService(repo domain.SpecForgeExecutionRepository, planningRepo domain.SpecForgePlanningRepository, repositoryResolver RepositoryResolver, executor CodeExecutor, worktrees WorktreeManager, preparer PRNodeBranchPreparer, deliverer PRNodeDeliverer) *service {
	if executor == nil {
		executor = NewCodexCLIExecutor(CodexCLIExecutorConfig{}, nil)
	}
	return &service{repo: repo, planningRepo: planningRepo, repositoryResolver: repositoryResolver, executor: executor, worktrees: worktrees, preparer: preparer, deliverer: deliverer}
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
		Tasks: buildInitialTasks(plan.PRNodes, executor),
	}
	if err := s.repo.CreateExecutionBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create execution run: %w", err)
	}
	return bundle, nil
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
	return bundle, nil
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
	if _, err := s.repo.CancelActiveTasksByRunID(ctx, runID); err != nil {
		return nil, fmt.Errorf("cancel active agent tasks: %w", err)
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
	if dependenciesComplete(node, completedNodeKeySet(bundle)) {
		status = domain.AgentTaskStatusQueued
	}
	if _, err := s.repo.CreateRetryAgentTask(ctx, parent, status, req.ForceFreshSession); err != nil {
		return nil, fmt.Errorf("create retry agent task: %w", err)
	}
	return s.GetRun(ctx, parent.RunID)
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
		markTaskFailed(task, "branch_preparation_failed", err.Error(), -1)
		if updateErr := s.repo.UpdateAgentTask(ctx, task); updateErr != nil {
			return nil, fmt.Errorf("update failed branch preparation task: %w", updateErr)
		}
		return s.GetRun(ctx, task.RunID)
	}
	if strings.TrimSpace(task.Workdir) == "" {
		worktree, err := s.prepareTaskWorktree(ctx, task, branchName)
		if err != nil {
			markTaskFailed(task, "worktree_preparation_failed", err.Error(), -1)
			if updateErr := s.repo.UpdateAgentTask(ctx, task); updateErr != nil {
				return nil, fmt.Errorf("update failed worktree preparation task: %w", updateErr)
			}
			return s.GetRun(ctx, task.RunID)
		}
		task.Workdir = worktree
		if err := s.repo.UpdateAgentTask(ctx, task); err != nil {
			return nil, fmt.Errorf("update agent task worktree: %w", err)
		}
	}
	prompt, err := s.planningRepo.FindLatestCompiledPromptByPRNodeID(ctx, task.PRNodeID)
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
		Content: strings.TrimSpace(req.Content),
		Input:   strings.TrimSpace(req.Input),
		Output:  strings.TrimSpace(req.Output),
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

	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return nil, err
	}
	if err := s.unlockReadyTasks(ctx, bundle); err != nil {
		return nil, err
	}
	if allTasksCompleted(bundle.Tasks) {
		bundle.Run.Status = domain.ExecutionRunStatusCompleted
		bundle.Run.CompletedAt = &now
		if err := s.repo.UpdateExecutionRun(ctx, bundle.Run); err != nil {
			return nil, fmt.Errorf("complete execution run: %w", err)
		}
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
	prompt, err := s.planningRepo.FindLatestCompiledPromptByPRNodeID(ctx, task.PRNodeID)
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
	task.OutputLog = result.Output
	task.ErrorLog = result.Error
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
		return s.GetRun(ctx, task.RunID)
	}

	bundle, err := s.GetRun(ctx, task.RunID)
	if err != nil {
		return nil, err
	}
	if err := s.unlockReadyTasks(ctx, bundle); err != nil {
		return nil, err
	}
	if allTasksCompleted(bundle.Tasks) {
		bundle.Run.Status = domain.ExecutionRunStatusCompleted
		bundle.Run.CompletedAt = &finishedAt
		if err := s.repo.UpdateExecutionRun(ctx, bundle.Run); err != nil {
			return nil, fmt.Errorf("complete execution run: %w", err)
		}
	}
	return s.GetRun(ctx, task.RunID)
}

func appendLogLine(existing, line string) string {
	line = strings.TrimSpace(line)
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
			AttemptNumber: 1,
		})
	}
	return tasks
}

func (s *service) unlockReadyTasks(ctx context.Context, bundle *domain.SpecForgeExecutionBundle) error {
	completedNodeKeys := completedNodeKeySet(bundle)
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

func completedNodeKeySet(bundle *domain.SpecForgeExecutionBundle) map[string]struct{} {
	nodeByID := nodeByID(bundle.Plan.PRNodes)
	out := make(map[string]struct{}, len(bundle.Tasks))
	for _, task := range bundle.Tasks {
		if task.Status != domain.AgentTaskStatusCompleted {
			continue
		}
		if node := nodeByID[task.PRNodeID]; node != nil {
			out[node.NodeKey] = struct{}{}
		}
	}
	return out
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

func allTasksCompleted(tasks []*domain.SpecForgeAgentTask) bool {
	if len(tasks) == 0 {
		return false
	}
	for _, task := range tasks {
		if task.Status != domain.AgentTaskStatusCompleted {
			return false
		}
	}
	return true
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
		RuntimeID:     task.RuntimeID,
		AttemptNumber: task.AttemptNumber,
		ParentTaskID:  task.ParentTaskID,
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
