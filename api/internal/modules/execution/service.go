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
