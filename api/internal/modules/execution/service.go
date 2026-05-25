package execution

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	StartRun(ctx context.Context, userID, planID uint, req *StartExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	GetRun(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error)
	DispatchRun(ctx context.Context, runID uint, req *DispatchExecutionRunRequest) (*domain.SpecForgeExecutionBundle, error)
	CompleteTask(ctx context.Context, taskID uint) (*domain.SpecForgeExecutionBundle, error)
}

type service struct {
	repo         domain.SpecForgeExecutionRepository
	planningRepo domain.SpecForgePlanningRepository
}

func NewService(repo domain.SpecForgeExecutionRepository, planningRepo domain.SpecForgePlanningRepository) *service {
	return &service{repo: repo, planningRepo: planningRepo}
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
	dispatched := 0
	now := time.Now()
	for _, task := range bundle.Tasks {
		if task.Status != domain.AgentTaskStatusQueued {
			continue
		}
		task.Status = domain.AgentTaskStatusRunning
		task.StartedAt = &now
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

func (s *service) CompleteTask(ctx context.Context, taskID uint) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	task, err := s.repo.FindAgentTaskByID(ctx, taskID)
	if err != nil {
		return nil, err
	}
	if task.Status != domain.AgentTaskStatusRunning {
		return nil, domain.ErrConflict
	}

	now := time.Now()
	task.Status = domain.AgentTaskStatusCompleted
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

func buildInitialTasks(nodes []*domain.SpecForgePRNode, executor string) []*domain.SpecForgeAgentTask {
	tasks := make([]*domain.SpecForgeAgentTask, 0, len(nodes))
	for _, node := range nodes {
		status := domain.AgentTaskStatusQueued
		if len(node.DependsOn) > 0 {
			status = domain.AgentTaskStatusWaiting
		}
		tasks = append(tasks, &domain.SpecForgeAgentTask{
			PRNodeID: node.ID,
			Executor: executor,
			Status:   status,
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
