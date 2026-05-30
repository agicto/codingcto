package execution

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/infra/events"
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
	require.Equal(t, domain.PromptTypeImplementation, bundle.Tasks[0].PromptType)
	require.Equal(t, []uint{4, 5}, bundle.SelectedPRNodeIDs)
	require.Len(t, planningRepo.prompts, 2)
	require.Equal(t, domain.PromptTypeImplementation, planningRepo.prompts[0].Type)
	require.Contains(t, planningRepo.prompts[0].PromptText, "approved plan snapshot")
}

func TestStartRunCanLimitExecutionToSelectedPRNodes(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)

	bundle, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{
		PRNodeIDs: []uint{planningRepo.bundle.PRNodes[0].ID},
	})

	require.NoError(t, err)
	require.Len(t, bundle.Tasks, 1)
	require.Equal(t, []uint{planningRepo.bundle.PRNodes[0].ID}, bundle.SelectedPRNodeIDs)
	require.Equal(t, planningRepo.bundle.PRNodes[0].ID, bundle.Tasks[0].PRNodeID)
	require.Len(t, planningRepo.prompts, 1)
	require.Equal(t, planningRepo.bundle.PRNodes[0].ID, planningRepo.prompts[0].PRNodeID)
}

func TestStartRunRejectsSelectedPRNodeWithoutDependency(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	svc := NewService(&memoryExecutionRepo{}, planningRepo, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{
		PRNodeIDs: []uint{planningRepo.bundle.PRNodes[1].ID},
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestStartRunRejectsUnknownSelectedPRNode(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	svc := NewService(&memoryExecutionRepo{}, planningRepo, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{
		PRNodeIDs: []uint{999},
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestStartRunIncludesRepoProfileInCompiledPrompt(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.RepoProfile = &domain.SpecForgeRepoProfile{
		Summary:           "Next.js app with a Go API backend.",
		Stack:             []string{"Next.js", "Go", "PostgreSQL"},
		CIProvider:        "GitHub Actions",
		TestCommands:      []string{"go test ./...", "pnpm type-check"},
		AppStructure:      []string{"api/internal/modules", "web/src/features"},
		CodingConventions: []string{"Keep API and web contracts explicit."},
		RiskAreas:         []string{"auth", "database migrations"},
	}
	planningRepo := &memoryPlanningRepo{bundle: bundle}
	svc := NewService(&memoryExecutionRepo{}, planningRepo, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.NotEmpty(t, planningRepo.prompts)
	prompt := planningRepo.prompts[0].PromptText
	require.Contains(t, prompt, "Target repository: repo_123")
	require.Contains(t, prompt, "Repository context")
	require.Contains(t, prompt, "Next.js app with a Go API backend.")
	require.Contains(t, prompt, "GitHub Actions")
	require.Contains(t, prompt, "pnpm type-check")
	require.Contains(t, prompt, "api/internal/modules")
	require.Contains(t, prompt, "Keep API and web contracts explicit.")
	require.Contains(t, prompt, "database migrations")
}

func TestStartRunIncludesActiveRepoSkillsInCompiledPrompt(t *testing.T) {
	bundle := approvedPlanBundle()
	planningRepo := &memoryPlanningRepo{
		bundle: bundle,
		skills: []*domain.SpecForgeSkill{
			{
				RepositoryID: "repo_123",
				Name:         "Service layer",
				Description:  "Persistence rule",
				Content:      "Do not access GORM directly from HTTP handlers.",
				Active:       true,
			},
			{
				RepositoryID: "repo_123",
				Name:         "Inactive rule",
				Content:      "This inactive skill should not be injected.",
				Active:       false,
			},
			{
				RepositoryID: "other_repo",
				Name:         "Other repo rule",
				Content:      "This belongs to another repository.",
				Active:       true,
			},
		},
	}
	svc := NewService(&memoryExecutionRepo{}, planningRepo, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.NotEmpty(t, planningRepo.prompts)
	prompt := planningRepo.prompts[0].PromptText
	require.Contains(t, prompt, "Repository skills")
	require.Contains(t, prompt, "## Service layer")
	require.Contains(t, prompt, "Persistence rule")
	require.Contains(t, prompt, "Do not access GORM directly from HTTP handlers.")
	require.NotContains(t, prompt, "inactive skill")
	require.NotContains(t, prompt, "another repository")
}

func TestStartRunHydratesProjectContextInCompiledPrompt(t *testing.T) {
	projectID := uint(9)
	bundle := approvedPlanBundle()
	bundle.Idea.ProjectID = &projectID
	bundle.Idea.RepositoryID = "repo_api"
	planningRepo := &memoryPlanningRepo{
		bundle: bundle,
		skills: []*domain.SpecForgeSkill{
			{
				RepositoryID: "repo_web",
				Name:         "SpecForge planning SOP",
				Description:  "Evidence-first planning workflow",
				Content:      "Read repo evidence before planning and run a reverse trace.",
				Active:       true,
			},
		},
	}
	profileRepo := &memoryExecutionProfileRepo{profiles: map[string]*domain.SpecForgeRepoProfile{
		"repo_api": {
			RepositoryID:  "repo_api",
			DefaultBranch: "main",
			Stack:         []string{"Go", "Gin"},
			TestCommands:  []string{"go test ./..."},
			Summary:       "API service",
		},
		"repo_web": {
			RepositoryID:  "repo_web",
			DefaultBranch: "main",
			Stack:         []string{"Next.js", "React"},
			TestCommands:  []string{"pnpm type-check"},
			Summary:       "Web console",
		},
	}}
	projectRepo := &memoryExecutionProjectRepo{
		project: &domain.SpecForgeProject{ID: projectID, WorkspaceID: "ws_1", Name: "SpecForge", Slug: "specforge", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: projectID, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
			{ID: 2, ProjectID: projectID, RepositoryID: "repo_web", Role: domain.ProjectRepositoryRoleDependency, Active: true},
		},
	}
	svc := NewService(&memoryExecutionRepo{}, planningRepo, nil, nil, nil, nil, nil)
	svc.profileRepo = profileRepo
	svc.projectRepo = projectRepo

	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.NotEmpty(t, planningRepo.prompts)
	prompt := planningRepo.prompts[0].PromptText
	require.Contains(t, prompt, "Project context")
	require.Contains(t, prompt, "Project: SpecForge")
	require.Contains(t, prompt, "Repository repo_api (primary)")
	require.Contains(t, prompt, "Repository repo_web (dependency)")
	require.Contains(t, prompt, "Web console")
	require.Contains(t, prompt, "pnpm type-check")
	require.Contains(t, prompt, "SpecForge planning SOP")
	require.Contains(t, prompt, "Read repo evidence before planning")
}

func TestStartRunRejectsUnapprovedPlan(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.Plan.Status = domain.PlanStatusDraft
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: bundle}, nil, nil, nil, nil, nil)

	_, err := svc.StartRun(context.Background(), 42, bundle.Plan.ID, &StartExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestStartRunRejectsInvalidPRDAG(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*domain.SpecForgePlanBundle)
	}{
		{
			name: "too many nodes",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				for len(bundle.PRNodes) <= 5 {
					node := *bundle.PRNodes[len(bundle.PRNodes)-1]
					node.ID += uint(len(bundle.PRNodes) + 1)
					node.Order = len(bundle.PRNodes) + 1
					node.NodeKey = fmt.Sprintf("PR-%03d", node.Order)
					node.BranchName = fmt.Sprintf("specforge/extra-%02d", node.Order)
					bundle.PRNodes = append(bundle.PRNodes, &node)
				}
			},
		},
		{
			name: "missing node scope",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[0].ExpectedFiles = nil
			},
		},
		{
			name: "missing non-goals",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[0].NonGoals = nil
			},
		},
		{
			name: "duplicate branch",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[1].BranchName = bundle.PRNodes[0].BranchName
			},
		},
		{
			name: "unknown dependency",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[1].DependsOn = []string{"PR-404"}
			},
		},
		{
			name: "self dependency",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[1].DependsOn = []string{bundle.PRNodes[1].NodeKey}
			},
		},
		{
			name: "out of order dependency",
			mutate: func(bundle *domain.SpecForgePlanBundle) {
				bundle.PRNodes[0].DependsOn = []string{bundle.PRNodes[1].NodeKey}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			bundle := approvedPlanBundle()
			tc.mutate(bundle)
			svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: bundle}, nil, nil, nil, nil, nil)

			_, err := svc.StartRun(context.Background(), 42, bundle.Plan.ID, &StartExecutionRunRequest{})

			require.ErrorIs(t, err, domain.ErrConflict)
		})
	}
}

func TestStartRunRejectsDuplicateActiveRunForPlan(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	_, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)

	_, err = svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
	require.Len(t, runRepo.bundle.Tasks, 2)
	require.Len(t, planningRepo.prompts, 2)
}

func TestStartRunAllowsNewRunAfterPreviousRunCancelled(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	first, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	_, err = svc.CancelRun(context.Background(), first.Run.ID)
	require.NoError(t, err)

	next, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})

	require.NoError(t, err)
	require.NotEqual(t, first.Run.ID, next.Run.ID)
	require.Equal(t, domain.ExecutionRunStatusQueued, next.Run.Status)
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
	require.Equal(t, []uint{4, 5}, found.SelectedPRNodeIDs)
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

func TestDispatchRunRejectsBlockedRun(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Run.Status = domain.ExecutionRunStatusBlocked
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestSatisfiedDependencyNodeKeySetIncludesReadyAndMergedPRNodes(t *testing.T) {
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 1, NodeKey: "PR-001", Status: domain.PRNodeStatusReadyForReview},
				{ID: 2, NodeKey: "PR-002", Status: domain.PRNodeStatusMerged},
				{ID: 3, NodeKey: "PR-003", Status: domain.PRNodeStatusClosed},
				{ID: 4, NodeKey: "PR-004", Status: domain.PRNodeStatusBlocked},
				{ID: 5, NodeKey: "PR-005", Status: domain.PRNodeStatusCIRunning},
				{ID: 6, NodeKey: "PR-006", Status: domain.PRNodeStatusPlanned},
			},
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 6, Status: domain.AgentTaskStatusCompleted},
		},
	}

	completed := satisfiedDependencyNodeKeySet(bundle)

	require.Contains(t, completed, "PR-001")
	require.Contains(t, completed, "PR-002")
	require.Contains(t, completed, "PR-006")
	require.NotContains(t, completed, "PR-003")
	require.NotContains(t, completed, "PR-004")
	require.NotContains(t, completed, "PR-005")
}

func TestSatisfiedDependencyNodeKeySetDoesNotUseCompletedTaskForOpenedPRNode(t *testing.T) {
	prNumber := 42
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{
					ID:             1,
					NodeKey:        "PR-001",
					Status:         domain.PRNodeStatusPROpened,
					GitHubPRNumber: &prNumber,
					GitHubPRURL:    "https://github.com/agicto/codingcto/pull/42",
				},
				{ID: 2, NodeKey: "PR-002", Status: domain.PRNodeStatusPlanned},
			},
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 1, Status: domain.AgentTaskStatusCompleted},
			{PRNodeID: 2, Status: domain.AgentTaskStatusCompleted},
		},
	}

	completed := satisfiedDependencyNodeKeySet(bundle)

	require.NotContains(t, completed, "PR-001")
	require.Contains(t, completed, "PR-002")
}

func TestDependenciesCompleteWaitsForReadyPRStatusAfterTaskCompletion(t *testing.T) {
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 1, NodeKey: "PR-001", Status: domain.PRNodeStatusPROpened, GitHubPRURL: "https://github.com/agicto/codingcto/pull/42"},
				{ID: 2, NodeKey: "PR-002", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
			},
		},
		Tasks: []*domain.SpecForgeAgentTask{
			{PRNodeID: 1, Status: domain.AgentTaskStatusCompleted},
		},
	}

	node := bundle.Plan.PRNodes[1]

	require.False(t, dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)))
	bundle.Plan.PRNodes[0].Status = domain.PRNodeStatusReadyForReview
	require.True(t, dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)))
}

func TestDependenciesCompleteUsesReadyForReviewPRStatus(t *testing.T) {
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 1, NodeKey: "PR-001", Status: domain.PRNodeStatusReadyForReview},
				{ID: 2, NodeKey: "PR-002", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
			},
		},
	}

	node := bundle.Plan.PRNodes[1]

	require.True(t, dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)))
}

func TestDependenciesCompleteDoesNotUseClosedPRStatus(t *testing.T) {
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 1, NodeKey: "PR-001", Status: domain.PRNodeStatusClosed},
				{ID: 2, NodeKey: "PR-002", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
			},
		},
	}

	node := bundle.Plan.PRNodes[1]

	require.False(t, dependenciesComplete(node, satisfiedDependencyNodeKeySet(bundle)))
}

func TestUnlockReadyTasksUsesReadyForReviewPRStatus(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusWaiting, created.Tasks[1].Status)
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusReadyForReview

	bundle, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	err = svc.unlockReadyTasks(context.Background(), bundle)

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestUnlockReadyTasksForPRNodeUsesLatestActivePlanRun(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusMerged

	updated, err := svc.UnlockReadyTasksForPRNode(context.Background(), planningRepo.bundle.PRNodes[0].ID)

	require.NoError(t, err)
	require.Equal(t, created.Run.ID, updated.Run.ID)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestHandlerUnlocksReadyTasksFromDependencySatisfiedEvent(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusReadyForReview
	bus := events.NewEventBus()
	NewHandler(svc).RegisterEvents(bus)

	err = bus.Publish(context.Background(), domain.NewSpecForgePRNodeDependencySatisfiedEvent(planningRepo.bundle.PRNodes[0]))

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[1].Status)
}

func TestHandlerCancelsTasksBlockedByClosedPRNodeEvent(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.PRNodes = append(bundle.PRNodes, &domain.SpecForgePRNode{
		ID:                 6,
		PlanID:             bundle.Plan.ID,
		NodeKey:            "PR-003",
		Order:              3,
		Title:              "Add integration tests",
		Type:               "test",
		Goal:               "Cover the feature flow.",
		DependsOn:          []string{"PR-002"},
		ExpectedFiles:      []string{"api/tests/feature/specforge_test.go"},
		NonGoals:           []string{"Do not change implementation scope."},
		AcceptanceCriteria: []string{"Tests cover the accepted flow."},
		TestCommands:       []string{"go test ./..."},
		BranchName:         "specforge/team-invite-03-tests",
		RepositoryID:       "repo_123",
		Status:             domain.PRNodeStatusPlanned,
	})
	planningRepo := &memoryPlanningRepo{bundle: bundle}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	require.Len(t, created.Tasks, 3)
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusClosed
	bus := events.NewEventBus()
	NewHandler(svc).RegisterEvents(bus)

	err = bus.Publish(context.Background(), domain.NewSpecForgePRNodeClosedEvent(planningRepo.bundle.PRNodes[0]))

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusQueued, updated.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusCancelled, updated.Tasks[1].Status)
	require.Equal(t, "dependency_closed", updated.Tasks[1].FailureReason)
	require.Equal(t, domain.AgentTaskStatusCancelled, updated.Tasks[2].Status)
	require.Equal(t, "dependency_closed", updated.Tasks[2].FailureReason)
}

func TestHandlerBlocksRunWhenClosedPRLeavesNoRunnableTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Tasks[0].Status = domain.AgentTaskStatusCompleted
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), created.Tasks[0]))
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusClosed
	bus := events.NewEventBus()
	NewHandler(svc).RegisterEvents(bus)

	err = bus.Publish(context.Background(), domain.NewSpecForgePRNodeClosedEvent(planningRepo.bundle.PRNodes[0]))

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusCancelled, updated.Tasks[1].Status)
	require.Equal(t, "dependency_closed", updated.Tasks[1].FailureReason)
	require.Equal(t, domain.ExecutionRunStatusBlocked, updated.Run.Status)
	require.Nil(t, updated.Run.CompletedAt)
}

func TestHandlerBlocksRunWhenPRNodeNeedsDecision(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	bus := events.NewEventBus()
	NewHandler(svc).RegisterEvents(bus)

	err = bus.Publish(context.Background(), domain.NewSpecForgePRNodeNeedsDecisionEvent(
		planningRepo.bundle.PRNodes[0].ID,
		"ci_log_unavailable",
		"CI logs could not be read.",
		"Inspect the workflow run in GitHub.",
	))

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusBlocked, updated.Run.Status)
	require.Nil(t, updated.Run.CompletedAt)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
}

func TestHandlerCreatesReviewPatchOnlyForActionableFeedback(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	prNumber := 42
	planningRepo.bundle.PRNodes[0].GitHubPRNumber = &prNumber
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	completed := dispatched.Tasks[0]
	completed.Status = domain.AgentTaskStatusCompleted
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), completed))
	bus := events.NewEventBus()
	NewHandler(svc).RegisterEvents(bus)

	err = bus.Publish(context.Background(), domain.NewSpecForgeReviewFeedbackReceivedEvent(
		planningRepo.bundle.PRNodes[0].ID,
		prNumber,
		"agicto/codingcto",
		"LGTM",
		"reviewer",
		"https://github.com/agicto/codingcto/pull/42#issuecomment-1",
		"",
		"",
	))
	require.NoError(t, err)
	unchanged, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Len(t, unchanged.Tasks, 2)

	err = bus.Publish(context.Background(), domain.NewSpecForgeReviewFeedbackReceivedEvent(
		planningRepo.bundle.PRNodes[0].ID,
		prNumber,
		"agicto/codingcto",
		"Please preserve the existing API response shape.",
		"reviewer",
		"https://github.com/agicto/codingcto/pull/42#issuecomment-2",
		"",
		"",
	))

	require.NoError(t, err)
	updated, err := svc.GetRun(context.Background(), created.Run.ID)
	require.NoError(t, err)
	require.Len(t, updated.Tasks, 3)
	require.Equal(t, domain.PromptTypeReviewPatch, updated.Tasks[2].PromptType)
	reviewPrompt := latestMemoryPromptByType(planningRepo, completed.PRNodeID, domain.PromptTypeReviewPatch)
	require.NotNil(t, reviewPrompt)
	require.Contains(t, reviewPrompt.PromptText, "Please preserve the existing API response shape.")
	require.Contains(t, reviewPrompt.PromptText, "Source: https://github.com/agicto/codingcto/pull/42#issuecomment-2")
}

func TestActionableReviewFeedbackClassifier(t *testing.T) {
	require.False(t, actionableReviewFeedback(""))
	require.False(t, actionableReviewFeedback("LGTM"))
	require.False(t, actionableReviewFeedback("Thanks for the quick fix."))
	require.True(t, actionableReviewFeedback("Please add a nil workspace role guard."))
	require.True(t, actionableReviewFeedback("This branch regresses the existing API response shape."))
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

func TestCancelRunPublishesLinkedFixTaskResult(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	bus := events.NewEventBus()
	var published domain.SpecForgeFixTaskFinishedEvent
	bus.Subscribe(domain.EventSpecForgeFixTaskFinished, func(ctx context.Context, event events.Event) error {
		var underlying any = event
		if wrapped, ok := event.(events.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixTaskFinishedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewEventedService(runRepo, planningRepo, nil, nil, nil, nil, nil, bus)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	fixAttemptID := uint(99)
	dispatched.Tasks[0].FixAttemptID = &fixAttemptID
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))

	_, err = svc.CancelRun(context.Background(), dispatched.Run.ID)

	require.NoError(t, err)
	require.Equal(t, fixAttemptID, published.FixAttemptID)
	require.Equal(t, dispatched.Tasks[0].ID, published.TaskID)
	require.Equal(t, domain.AgentTaskStatusCancelled, published.TaskStatus)
	require.Equal(t, domain.FixAttemptStatusFailed, published.FixAttemptStatus)
	require.Equal(t, "run_cancelled", published.FailureReason)
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

func TestCancelRunAllowsBlockedRun(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Run.Status = domain.ExecutionRunStatusBlocked
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	cancelled, err := svc.CancelRun(context.Background(), created.Run.ID)

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusCancelled, cancelled.Run.Status)
	require.NotNil(t, cancelled.Run.CompletedAt)
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
	require.Equal(t, domain.PromptTypeFix, retry.PromptType)
	require.Equal(t, "session_123", retry.SessionID)
	require.Equal(t, "/tmp/specforge/task", retry.Workdir)
	require.Equal(t, domain.AgentTaskStatusFailed, retried.Tasks[0].Status)
	fixPrompt := latestMemoryPromptByType(planningRepo, failed.PRNodeID, domain.PromptTypeFix)
	require.NotNil(t, fixPrompt)
	require.Contains(t, fixPrompt.PromptText, "targeted repair")
	require.Contains(t, fixPrompt.PromptText, "test_failure")
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

func TestCreateFixTaskForPRNodeCreatesQueuedFixAttempt(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	completed := dispatched.Tasks[0]
	completed.Status = domain.AgentTaskStatusCompleted
	completed.SessionID = "session_123"
	completed.Workdir = "/tmp/specforge/task"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), completed))

	updated, err := svc.CreateFixTaskForPRNode(context.Background(), completed.PRNodeID, &FixAgentTaskRequest{
		FailureType:       "unit_test_failure",
		FixAttemptID:      99,
		CILogExcerpt:      "--- FAIL: TestInvite",
		LikelyCause:       "GitHub Actions job \"API\" failed at step \"go test\".",
		RecommendedAction: "Patch the failing assertion.",
	})

	require.NoError(t, err)
	require.Len(t, updated.Tasks, 3)
	fixTask := updated.Tasks[2]
	require.Equal(t, completed.ID, *fixTask.ParentTaskID)
	require.Equal(t, uint(99), *fixTask.FixAttemptID)
	require.Equal(t, completed.PRNodeID, fixTask.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusQueued, fixTask.Status)
	require.Equal(t, domain.PromptTypeFix, fixTask.PromptType)
	require.Equal(t, "session_123", fixTask.SessionID)
	require.Equal(t, "/tmp/specforge/task", fixTask.Workdir)
	fixPrompt := latestMemoryPromptByType(planningRepo, completed.PRNodeID, domain.PromptTypeFix)
	require.NotNil(t, fixPrompt)
	require.Contains(t, fixPrompt.PromptText, "unit_test_failure")
	require.Contains(t, fixPrompt.PromptText, "TestInvite")
	require.Contains(t, fixPrompt.PromptText, "Patch the failing assertion.")
}

func TestCompleteTaskPublishesLinkedFixTaskResult(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	bus := events.NewEventBus()
	var published domain.SpecForgeFixTaskFinishedEvent
	bus.Subscribe(domain.EventSpecForgeFixTaskFinished, func(ctx context.Context, event events.Event) error {
		var underlying any = event
		if wrapped, ok := event.(events.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixTaskFinishedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewEventedService(runRepo, planningRepo, nil, nil, nil, nil, nil, bus)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	fixAttemptID := uint(99)
	dispatched.Tasks[0].FixAttemptID = &fixAttemptID
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))

	_, err = svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)

	require.NoError(t, err)
	require.Equal(t, fixAttemptID, published.FixAttemptID)
	require.Equal(t, dispatched.Tasks[0].ID, published.TaskID)
	require.Equal(t, dispatched.Tasks[0].PRNodeID, published.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusCompleted, published.TaskStatus)
	require.Equal(t, domain.FixAttemptStatusSuccess, published.FixAttemptStatus)
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

func TestRetryTaskResumesBlockedRun(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	failed := created.Tasks[0]
	failed.Status = domain.AgentTaskStatusFailed
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), failed))
	created.Run.Status = domain.ExecutionRunStatusBlocked
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	retried, err := svc.RetryTask(context.Background(), failed.ID, &RetryAgentTaskRequest{})

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusRunning, retried.Run.Status)
	require.Len(t, retried.Tasks, 3)
	require.Equal(t, domain.AgentTaskStatusQueued, retried.Tasks[2].Status)
	require.Equal(t, failed.ID, *retried.Tasks[2].ParentTaskID)
}

func TestRetryTaskRejectsDependencyClosedTask(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	cancelled := created.Tasks[1]
	cancelled.Status = domain.AgentTaskStatusCancelled
	cancelled.FailureReason = "dependency_closed"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), cancelled))
	created.Run.Status = domain.ExecutionRunStatusBlocked
	require.NoError(t, runRepo.UpdateExecutionRun(context.Background(), created.Run))

	_, err = svc.RetryTask(context.Background(), cancelled.ID, &RetryAgentTaskRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCreateReviewPatchTaskCreatesQueuedReviewAttempt(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	completed := dispatched.Tasks[0]
	completed.Status = domain.AgentTaskStatusCompleted
	completed.SessionID = "session_123"
	completed.Workdir = "/tmp/specforge/task"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), completed))

	updated, err := svc.CreateReviewPatchTask(context.Background(), completed.ID, &ReviewPatchAgentTaskRequest{Feedback: "Please handle nil workspace roles."})

	require.NoError(t, err)
	require.Len(t, updated.Tasks, 3)
	reviewTask := updated.Tasks[2]
	require.Equal(t, completed.ID, *reviewTask.ParentTaskID)
	require.Equal(t, completed.PRNodeID, reviewTask.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusQueued, reviewTask.Status)
	require.Equal(t, domain.PromptTypeReviewPatch, reviewTask.PromptType)
	require.Equal(t, "session_123", reviewTask.SessionID)
	require.Equal(t, "/tmp/specforge/task", reviewTask.Workdir)
	reviewPrompt := latestMemoryPromptByType(planningRepo, completed.PRNodeID, domain.PromptTypeReviewPatch)
	require.NotNil(t, reviewPrompt)
	require.Contains(t, reviewPrompt.PromptText, "response to human PR review feedback")
	require.Contains(t, reviewPrompt.PromptText, "Please handle nil workspace roles.")
}

func TestCreateReviewPatchTaskForGitHubPRCreatesQueuedReviewAttempt(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	prNumber := 42
	planningRepo.bundle.PRNodes[0].GitHubPRNumber = &prNumber
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	completed := dispatched.Tasks[0]
	completed.Status = domain.AgentTaskStatusCompleted
	completed.SessionID = "session_123"
	completed.Workdir = "/tmp/specforge/task"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), completed))

	updated, err := svc.CreateReviewPatchTaskForGitHubPR(context.Background(), prNumber, &ReviewPatchAgentTaskRequest{Feedback: "Please preserve the existing API response shape."})

	require.NoError(t, err)
	require.Len(t, updated.Tasks, 3)
	reviewTask := updated.Tasks[2]
	require.Equal(t, completed.ID, *reviewTask.ParentTaskID)
	require.Equal(t, completed.PRNodeID, reviewTask.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusQueued, reviewTask.Status)
	require.Equal(t, domain.PromptTypeReviewPatch, reviewTask.PromptType)
	reviewPrompt := latestMemoryPromptByType(planningRepo, completed.PRNodeID, domain.PromptTypeReviewPatch)
	require.NotNil(t, reviewPrompt)
	require.Contains(t, reviewPrompt.PromptText, "Please preserve the existing API response shape.")
}

func TestCreateReviewPatchTaskRejectsNonTerminalTask(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)

	_, err = svc.CreateReviewPatchTask(context.Background(), created.Tasks[0].ID, &ReviewPatchAgentTaskRequest{Feedback: "Please update this."})

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

func TestListRuntimePendingTasksReturnsVisibleTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	dispatched.Tasks[1].Status = domain.AgentTaskStatusRunning
	dispatched.Tasks[1].RuntimeID = "runtime_123"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[1]))
	runRepo.bundle.Tasks = append(runRepo.bundle.Tasks, &domain.SpecForgeAgentTask{
		ID:            99,
		RunID:         dispatched.Run.ID,
		PRNodeID:      99,
		Executor:      ExecutorNameCodexCLI,
		Status:        domain.AgentTaskStatusDispatched,
		RuntimeID:     "runtime_other",
		AttemptNumber: 1,
	})

	result, err := svc.ListRuntimePendingTasks(context.Background(), "runtime_123", ExecutorNameCodexCLI)

	require.NoError(t, err)
	require.Len(t, result.Tasks, 2)
	require.Equal(t, dispatched.Tasks[0].ID, result.Tasks[0].ID)
	require.Equal(t, dispatched.Tasks[1].ID, result.Tasks[1].ID)
}

func TestListRuntimePendingTasksRejectsMissingRuntimeID(t *testing.T) {
	svc := NewService(&memoryExecutionRepo{}, &memoryPlanningRepo{bundle: approvedPlanBundle()}, nil, nil, nil, nil, nil)

	_, err := svc.ListRuntimePendingTasks(context.Background(), " ", "")

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestClaimTaskRevertsWhenPromptContextIsMissing(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	planningRepo.prompt = nil
	planningRepo.prompts = nil
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
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
}

func TestSubmitTaskResultDoesNotBlockReadyPRNode(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusReadyForReview
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	_, err = svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	claim, err := svc.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: "codex_cli"})
	require.NoError(t, err)

	_, err = svc.SubmitTaskResult(context.Background(), claim.Task.ID, &SubmitTaskResultRequest{
		RuntimeID:     "runtime_123",
		Status:        "failed",
		Error:         "tests failed",
		ExitCode:      2,
		FailureReason: "test_failure",
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.bundle.PRNodes[0].Status)
}

func TestSubmitTaskResultRedactsPersistedLogs(t *testing.T) {
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
		RuntimeID: "runtime_123",
		Status:    "failed",
		Output:    "OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345",
		Error:     "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc123",
		ExitCode:  1,
	})

	require.NoError(t, err)
	require.NotContains(t, updated.Tasks[0].OutputLog, "sk-proj-abc123")
	require.Contains(t, updated.Tasks[0].OutputLog, "[REDACTED CREDENTIAL]")
	require.NotContains(t, updated.Tasks[0].ErrorLog, "eyJhbGci")
	require.Contains(t, updated.Tasks[0].ErrorLog, "Bearer [REDACTED]")
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

func TestExecuteTaskUsesPromptMatchingTaskPromptType(t *testing.T) {
	planningRepo := &memoryPlanningRepo{
		bundle: approvedPlanBundle(),
		prompts: []*domain.SpecForgeCompiledPrompt{
			{
				ID:         7,
				PRNodeID:   4,
				PlanID:     3,
				Type:       domain.PromptTypeImplementation,
				Version:    "prompt_impl_v1",
				PromptText: "Implement PR-001",
			},
			{
				ID:         8,
				PRNodeID:   4,
				PlanID:     3,
				Type:       domain.PromptTypeFix,
				Version:    "prompt_fix_v1",
				PromptText: "Fix PR-001",
			},
		},
	}
	runRepo := &memoryExecutionRepo{}
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	svc := NewService(runRepo, planningRepo, nil, executor, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	created.Tasks[0].PromptType = domain.PromptTypeFix
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), created.Tasks[0]))
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)

	_, err = svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, "Fix PR-001", executor.prompt.PromptText)
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
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
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
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
}

func TestExecuteTaskPublishesLinkedFixTaskResultForEarlyFailure(t *testing.T) {
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
	bus := events.NewEventBus()
	var published domain.SpecForgeFixTaskFinishedEvent
	bus.Subscribe(domain.EventSpecForgeFixTaskFinished, func(ctx context.Context, event events.Event) error {
		var underlying any = event
		if wrapped, ok := event.(events.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixTaskFinishedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	executor := &fakeExecutor{result: &ExecutionResult{Status: "completed", Output: "done", ExitCode: 0}}
	preparer := &fakePRNodeBranchPreparer{err: fmt.Errorf("base branch missing")}
	svc := NewEventedService(runRepo, planningRepo, nil, executor, nil, preparer, nil, bus)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	fixAttemptID := uint(99)
	dispatched.Tasks[0].FixAttemptID = &fixAttemptID
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))

	_, err = svc.ExecuteTask(context.Background(), dispatched.Tasks[0].ID, &ExecuteAgentTaskRequest{Workdir: "/tmp/repo"})

	require.NoError(t, err)
	require.Equal(t, fixAttemptID, published.FixAttemptID)
	require.Equal(t, dispatched.Tasks[0].ID, published.TaskID)
	require.Equal(t, dispatched.Tasks[0].PRNodeID, published.PRNodeID)
	require.Equal(t, domain.AgentTaskStatusFailed, published.TaskStatus)
	require.Equal(t, domain.FixAttemptStatusFailed, published.FixAttemptStatus)
	require.Equal(t, "branch_preparation_failed", published.FailureReason)
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
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
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

func TestCompleteTaskCompletesRunAfterSuccessfulRetry(t *testing.T) {
	planningRepo := memoryPlanningRepoWithPrompt()
	planningRepo.bundle.PRNodes = planningRepo.bundle.PRNodes[:1]
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	failed := dispatched.Tasks[0]
	failed.Status = domain.AgentTaskStatusFailed
	failed.FailureReason = "test_failure"
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), failed))
	retried, err := svc.RetryTask(context.Background(), failed.ID, &RetryAgentTaskRequest{})
	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusRunning, retried.Run.Status)

	dispatchedRetry, err := svc.DispatchRun(context.Background(), retried.Run.ID, &DispatchExecutionRunRequest{MaxTasks: 1})
	require.NoError(t, err)
	retry := dispatchedRetry.Tasks[1]
	require.Equal(t, failed.ID, *retry.ParentTaskID)
	require.Equal(t, domain.AgentTaskStatusDispatched, retry.Status)
	completed, err := svc.CompleteTask(context.Background(), retry.ID)

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, completed.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusCompleted, completed.Tasks[1].Status)
	require.Equal(t, domain.ExecutionRunStatusCompleted, completed.Run.Status)
	require.NotNil(t, completed.Run.CompletedAt)
}

func TestRunDeliveryCompleteWaitsForActiveRetry(t *testing.T) {
	plan := approvedPlanBundle()
	plan.PRNodes = plan.PRNodes[:1]
	bundle := &domain.SpecForgeExecutionBundle{
		Plan: plan,
		Tasks: []*domain.SpecForgeAgentTask{
			{
				ID:       1,
				PRNodeID: plan.PRNodes[0].ID,
				Status:   domain.AgentTaskStatusCompleted,
			},
			{
				ID:       2,
				PRNodeID: plan.PRNodes[0].ID,
				Status:   domain.AgentTaskStatusQueued,
			},
		},
	}

	require.False(t, runDeliveryComplete(bundle))
}

func TestCompleteTaskWaitsForPRReadinessBeforeCompletingRun(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.PRNodes = bundle.PRNodes[:1]
	bundle.PRNodes[0].Status = domain.PRNodeStatusPROpened
	bundle.PRNodes[0].GitHubPRURL = "https://github.com/agicto/codingcto/pull/42"
	planningRepo := &memoryPlanningRepo{bundle: bundle}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	updated, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)

	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusCompleted, updated.Tasks[0].Status)
	require.Equal(t, domain.ExecutionRunStatusRunning, updated.Run.Status)
	require.Nil(t, updated.Run.CompletedAt)
}

func TestCompleteTaskIgnoresUnselectedPRNodeDeliveryState(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.PRNodes[1].Status = domain.PRNodeStatusPROpened
	bundle.PRNodes[1].GitHubPRURL = "https://github.com/agicto/codingcto/pull/43"
	planningRepo := &memoryPlanningRepo{bundle: bundle}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{
		PRNodeIDs: []uint{planningRepo.bundle.PRNodes[0].ID},
	})
	require.NoError(t, err)
	require.Equal(t, []uint{planningRepo.bundle.PRNodes[0].ID}, created.SelectedPRNodeIDs)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	completed, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusCompleted, completed.Run.Status)
	require.NotNil(t, completed.Run.CompletedAt)
}

func TestUnlockReadyTasksForPRNodeCompletesRunWhenAllPRNodesReady(t *testing.T) {
	bundle := approvedPlanBundle()
	bundle.PRNodes = bundle.PRNodes[:1]
	bundle.PRNodes[0].Status = domain.PRNodeStatusPROpened
	bundle.PRNodes[0].GitHubPRURL = "https://github.com/agicto/codingcto/pull/42"
	planningRepo := &memoryPlanningRepo{bundle: bundle}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	updated, err := svc.CompleteTask(context.Background(), dispatched.Tasks[0].ID)
	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusRunning, updated.Run.Status)
	planningRepo.bundle.PRNodes[0].Status = domain.PRNodeStatusReadyForReview

	completed, err := svc.UnlockReadyTasksForPRNode(context.Background(), planningRepo.bundle.PRNodes[0].ID)

	require.NoError(t, err)
	require.Equal(t, domain.ExecutionRunStatusCompleted, completed.Run.Status)
	require.NotNil(t, completed.Run.CompletedAt)
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

func TestCreateTaskEventRedactsRuntimeOutput(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)

	event, err := svc.CreateTaskEvent(context.Background(), dispatched.Tasks[0].ID, &CreateTaskEventRequest{
		Type:    "tool",
		Content: "using ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
		Input:   "DATABASE_URL=postgres://admin:s3cret@db.example.com:5432/app",
		Output:  "ok",
	})

	require.NoError(t, err)
	require.NotContains(t, event.Content, "ghp_")
	require.Contains(t, event.Content, "[REDACTED GITHUB TOKEN]")
	require.NotContains(t, event.Input, "s3cret")
	require.Contains(t, event.Input, "[REDACTED CREDENTIAL]")
	require.Equal(t, "ok", event.Output)
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
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
}

func TestDeregisterRuntimesMarksOfflineAndFailsTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	dispatched.Tasks[0].RuntimeID = "runtime_leaving"
	dispatched.Tasks[0].Status = domain.AgentTaskStatusRunning
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))
	dispatched.Tasks[1].RuntimeID = "runtime_other"
	dispatched.Tasks[1].Status = domain.AgentTaskStatusDispatched
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[1]))
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_leaving",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: time.Now(),
	}))
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime_other",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: time.Now(),
	}))

	result, err := svc.DeregisterRuntimes(context.Background(), &RuntimeDeregisterRequest{RuntimeIDs: []string{" runtime_leaving "}})

	require.NoError(t, err)
	require.Len(t, result.OfflineRuntimes, 1)
	require.Equal(t, domain.RuntimeStatusOffline, result.OfflineRuntimes[0].Status)
	require.Len(t, result.FailedTasks, 1)
	require.Equal(t, dispatched.Tasks[0].ID, result.FailedTasks[0].ID)
	require.Equal(t, "runtime_deregistered", result.FailedTasks[0].FailureReason)
	updated, err := svc.GetRun(context.Background(), dispatched.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusDispatched, updated.Tasks[1].Status)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
	require.NotEqual(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[1].Status)
}

func TestListRuntimesAppliesFiltersAndLimit(t *testing.T) {
	now := time.Now()
	runRepo := &memoryExecutionRepo{}
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-old",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: now.Add(-2 * time.Minute),
	}))
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-new",
		Executor:   ExecutorNameCodexCLI,
		Status:     domain.RuntimeStatusOnline,
		LastSeenAt: now,
	}))
	require.NoError(t, runRepo.UpsertRuntime(context.Background(), &domain.SpecForgeRuntime{
		RuntimeID:  "runtime-other",
		Executor:   "other_executor",
		Status:     domain.RuntimeStatusOffline,
		LastSeenAt: now.Add(time.Minute),
	}))
	svc := NewService(runRepo, &memoryPlanningRepo{}, nil, nil, nil, nil, nil)

	result, err := svc.ListRuntimes(context.Background(), &ListRuntimesRequest{
		Executor: ExecutorNameCodexCLI,
		Status:   domain.RuntimeStatusOnline,
		Limit:    1,
	})

	require.NoError(t, err)
	require.Len(t, result.Runtimes, 1)
	require.Equal(t, "runtime-new", result.Runtimes[0].RuntimeID)
}

func TestSweepStaleTasksFailsTimedOutTasks(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	svc := NewService(runRepo, planningRepo, nil, nil, nil, nil, nil)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	oldDispatchedAt := time.Now().Add(-10 * time.Minute)
	oldStartedAt := time.Now().Add(-3 * time.Hour)
	freshStartedAt := time.Now()
	dispatched.Tasks[0].Status = domain.AgentTaskStatusDispatched
	dispatched.Tasks[0].DispatchedAt = &oldDispatchedAt
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))
	dispatched.Tasks[1].Status = domain.AgentTaskStatusRunning
	dispatched.Tasks[1].StartedAt = &oldStartedAt
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[1]))
	runRepo.bundle.Tasks = append(runRepo.bundle.Tasks, &domain.SpecForgeAgentTask{
		ID:            99,
		RunID:         dispatched.Run.ID,
		PRNodeID:      99,
		Executor:      ExecutorNameCodexCLI,
		Status:        domain.AgentTaskStatusRunning,
		AttemptNumber: 1,
		StartedAt:     &freshStartedAt,
	})

	result, err := svc.SweepStaleTasks(context.Background(), &StaleTaskSweepRequest{
		DispatchTimeoutSeconds: 300,
		RunningTimeoutSeconds:  7200,
	})

	require.NoError(t, err)
	require.Len(t, result.FailedTasks, 2)
	require.Equal(t, "dispatch_timeout", result.FailedTasks[0].FailureReason)
	require.Equal(t, "execution_timeout", result.FailedTasks[1].FailureReason)
	updated, err := svc.GetRun(context.Background(), dispatched.Run.ID)
	require.NoError(t, err)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[0].Status)
	require.Equal(t, domain.AgentTaskStatusFailed, updated.Tasks[1].Status)
	require.Equal(t, domain.AgentTaskStatusRunning, updated.Tasks[2].Status)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[0].Status)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.bundle.PRNodes[1].Status)
}

func TestSweepStaleTasksPublishesLinkedFixTaskResult(t *testing.T) {
	planningRepo := &memoryPlanningRepo{bundle: approvedPlanBundle()}
	runRepo := &memoryExecutionRepo{}
	bus := events.NewEventBus()
	var published domain.SpecForgeFixTaskFinishedEvent
	bus.Subscribe(domain.EventSpecForgeFixTaskFinished, func(ctx context.Context, event events.Event) error {
		var underlying any = event
		if wrapped, ok := event.(events.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixTaskFinishedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewEventedService(runRepo, planningRepo, nil, nil, nil, nil, nil, bus)
	created, err := svc.StartRun(context.Background(), 42, planningRepo.bundle.Plan.ID, &StartExecutionRunRequest{})
	require.NoError(t, err)
	dispatched, err := svc.DispatchRun(context.Background(), created.Run.ID, &DispatchExecutionRunRequest{})
	require.NoError(t, err)
	oldStartedAt := time.Now().Add(-3 * time.Hour)
	fixAttemptID := uint(99)
	dispatched.Tasks[0].Status = domain.AgentTaskStatusRunning
	dispatched.Tasks[0].StartedAt = &oldStartedAt
	dispatched.Tasks[0].FixAttemptID = &fixAttemptID
	require.NoError(t, runRepo.UpdateAgentTask(context.Background(), dispatched.Tasks[0]))

	_, err = svc.SweepStaleTasks(context.Background(), &StaleTaskSweepRequest{
		RunningTimeoutSeconds: 7200,
	})

	require.NoError(t, err)
	require.Equal(t, fixAttemptID, published.FixAttemptID)
	require.Equal(t, dispatched.Tasks[0].ID, published.TaskID)
	require.Equal(t, domain.AgentTaskStatusFailed, published.TaskStatus)
	require.Equal(t, domain.FixAttemptStatusFailed, published.FixAttemptStatus)
	require.Equal(t, "execution_timeout", published.FailureReason)
	require.Contains(t, published.ErrorLog, "task execution timed out")
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

func (r *memoryExecutionRepo) FindLatestActiveExecutionBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgeExecutionBundle, error) {
	if planID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if r.bundle == nil || r.bundle.Run.PlanID != planID {
		return nil, domain.ErrNotFound
	}
	switch r.bundle.Run.Status {
	case domain.ExecutionRunStatusCompleted, domain.ExecutionRunStatusCancelled:
		return nil, domain.ErrNotFound
	default:
		return cloneExecutionBundle(r.bundle), nil
	}
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

func (r *memoryExecutionRepo) FindLatestTerminalAgentTaskByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeAgentTask, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if r.bundle == nil {
		return nil, domain.ErrNotFound
	}
	for i := len(r.bundle.Tasks) - 1; i >= 0; i-- {
		task := r.bundle.Tasks[i]
		if task.PRNodeID != prNodeID {
			continue
		}
		if task.Status != domain.AgentTaskStatusCompleted && task.Status != domain.AgentTaskStatusFailed && task.Status != domain.AgentTaskStatusCancelled {
			continue
		}
		copied := *task
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (r *memoryExecutionRepo) ListPendingAgentTasksByRuntime(ctx context.Context, runtimeID, executor string) ([]*domain.SpecForgeAgentTask, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	executor = strings.TrimSpace(executor)
	if runtimeID == "" {
		return nil, domain.ErrInvalidInput
	}
	if r.bundle == nil {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	out := make([]*domain.SpecForgeAgentTask, 0)
	for _, task := range r.bundle.Tasks {
		if executor != "" && task.Executor != executor {
			continue
		}
		switch {
		case task.Status == domain.AgentTaskStatusDispatched && (task.RuntimeID == "" || task.RuntimeID == runtimeID):
			copied := *task
			out = append(out, &copied)
		case task.Status == domain.AgentTaskStatusRunning && task.RuntimeID == runtimeID:
			copied := *task
			out = append(out, &copied)
		}
	}
	return out, nil
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

func (r *memoryExecutionRepo) ListRuntimes(ctx context.Context, executor, status string, limit int) ([]*domain.SpecForgeRuntime, error) {
	executor = strings.TrimSpace(executor)
	status = strings.TrimSpace(status)
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	if r.runtimes == nil {
		return []*domain.SpecForgeRuntime{}, nil
	}
	out := make([]*domain.SpecForgeRuntime, 0, len(r.runtimes))
	for _, runtime := range r.runtimes {
		if executor != "" && runtime.Executor != executor {
			continue
		}
		if status != "" && runtime.Status != status {
			continue
		}
		copied := *runtime
		out = append(out, &copied)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].LastSeenAt.Equal(out[j].LastSeenAt) {
			return out[i].ID > out[j].ID
		}
		return out[i].LastSeenAt.After(out[j].LastSeenAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
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

func (r *memoryExecutionRepo) MarkRuntimesOfflineByRuntimeIDs(ctx context.Context, runtimeIDs []string) ([]*domain.SpecForgeRuntime, error) {
	if r.runtimes == nil {
		return []*domain.SpecForgeRuntime{}, nil
	}
	out := make([]*domain.SpecForgeRuntime, 0)
	for _, runtimeID := range compactStrings(runtimeIDs) {
		runtime := r.runtimes[runtimeID]
		if runtime == nil {
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

func (r *memoryExecutionRepo) FailTasksForRuntimeIDs(ctx context.Context, runtimeIDs []string, reason, errorLine string) ([]*domain.SpecForgeAgentTask, error) {
	if r.bundle == nil {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	runtimeSet := make(map[string]struct{})
	for _, runtimeID := range compactStrings(runtimeIDs) {
		runtimeSet[runtimeID] = struct{}{}
	}
	out := make([]*domain.SpecForgeAgentTask, 0)
	now := time.Now()
	for _, task := range r.bundle.Tasks {
		if _, ok := runtimeSet[task.RuntimeID]; !ok {
			continue
		}
		if task.Status != domain.AgentTaskStatusDispatched && task.Status != domain.AgentTaskStatusRunning {
			continue
		}
		task.Status = domain.AgentTaskStatusFailed
		task.FailureReason = reason
		task.FinishedAt = &now
		task.ErrorLog = appendLogLine(task.ErrorLog, errorLine)
		copied := *task
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryExecutionRepo) FailStaleAgentTasks(ctx context.Context, dispatchBefore, runningBefore time.Time) ([]*domain.SpecForgeAgentTask, error) {
	if r.bundle == nil {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	out := make([]*domain.SpecForgeAgentTask, 0)
	now := time.Now()
	for _, task := range r.bundle.Tasks {
		switch {
		case task.Status == domain.AgentTaskStatusDispatched && task.DispatchedAt != nil && task.DispatchedAt.Before(dispatchBefore):
			task.Status = domain.AgentTaskStatusFailed
			task.FailureReason = "dispatch_timeout"
			task.FinishedAt = &now
			task.ErrorLog = appendLogLine(task.ErrorLog, "task dispatch timed out")
		case task.Status == domain.AgentTaskStatusRunning && task.StartedAt != nil && task.StartedAt.Before(runningBefore):
			task.Status = domain.AgentTaskStatusFailed
			task.FailureReason = "execution_timeout"
			task.FinishedAt = &now
			task.ErrorLog = appendLogLine(task.ErrorLog, "task execution timed out")
		default:
			continue
		}
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
		PromptType:    retryPromptType(parent),
		AttemptNumber: parent.AttemptNumber + 1,
		ParentTaskID:  &parent.ID,
		FixAttemptID:  parent.FixAttemptID,
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
	bundle  *domain.SpecForgePlanBundle
	prompt  *domain.SpecForgeCompiledPrompt
	prompts []*domain.SpecForgeCompiledPrompt
	skills  []*domain.SpecForgeSkill
}

func (r *memoryPlanningRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	r.bundle = bundle
	return nil
}

func (r *memoryPlanningRepo) CreateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	if requirement == nil {
		return domain.ErrInvalidInput
	}
	requirement.ID = 1
	return nil
}

func (r *memoryPlanningRepo) FindRequirementByID(ctx context.Context, requirementID uint) (*domain.SpecForgeRequirement, error) {
	if r.bundle != nil && r.bundle.Requirement != nil && r.bundle.Requirement.ID == requirementID {
		copied := *r.bundle.Requirement
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	if r.bundle == nil || requirement == nil {
		return domain.ErrNotFound
	}
	copied := *requirement
	r.bundle.Requirement = &copied
	return nil
}

func (r *memoryPlanningRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Idea.ID != ideaID {
		return nil, domain.ErrNotFound
	}
	return clonePlanBundle(r.bundle), nil
}

func (r *memoryPlanningRepo) FindLatestPlanBundleByRequirementID(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Requirement == nil || r.bundle.Requirement.ID != requirementID {
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

func (r *memoryPlanningRepo) NextPlanVersionByRequirementID(ctx context.Context, requirementID uint) (int, error) {
	if r.bundle != nil && r.bundle.Plan != nil && r.bundle.Plan.RequirementID != nil && *r.bundle.Plan.RequirementID == requirementID {
		return r.bundle.Plan.Version + 1, nil
	}
	return 1, nil
}

func (r *memoryPlanningRepo) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	if r.bundle != nil {
		for _, node := range r.bundle.PRNodes {
			if node != nil && node.ID == prNodeID {
				copied := *node
				return &copied, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*domain.SpecForgePRNode, error) {
	if r.bundle == nil || prNumber <= 0 {
		return nil, domain.ErrNotFound
	}
	for _, node := range r.bundle.PRNodes {
		if node.GitHubPRNumber != nil && *node.GitHubPRNumber == prNumber {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	if r.bundle == nil || node == nil {
		return domain.ErrNotFound
	}
	for i, current := range r.bundle.PRNodes {
		if current != nil && current.ID == node.ID {
			copied := *node
			r.bundle.PRNodes[i] = &copied
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryPlanningRepo) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	if r.prompt == nil {
		r.prompt = prompt
	}
	r.prompts = append(r.prompts, prompt)
	return nil
}

func (r *memoryPlanningRepo) FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeCompiledPrompt, error) {
	for i := len(r.prompts) - 1; i >= 0; i-- {
		prompt := r.prompts[i]
		if prompt != nil && prompt.PRNodeID == prNodeID {
			copied := *prompt
			return &copied, nil
		}
	}
	if r.prompt == nil || r.prompt.PRNodeID != prNodeID {
		return nil, domain.ErrNotFound
	}
	copied := *r.prompt
	return &copied, nil
}

func (r *memoryPlanningRepo) FindLatestCompiledPromptByPRNodeIDAndType(ctx context.Context, prNodeID uint, promptType string) (*domain.SpecForgeCompiledPrompt, error) {
	promptType = strings.TrimSpace(promptType)
	if promptType == "" {
		return nil, domain.ErrInvalidInput
	}
	for i := len(r.prompts) - 1; i >= 0; i-- {
		prompt := r.prompts[i]
		if prompt != nil && prompt.PRNodeID == prNodeID && promptTypeMatches(prompt.Type, promptType) {
			copied := *prompt
			return &copied, nil
		}
	}
	if r.prompt == nil || r.prompt.PRNodeID != prNodeID || !promptTypeMatches(r.prompt.Type, promptType) {
		return nil, domain.ErrNotFound
	}
	copied := *r.prompt
	return &copied, nil
}

func promptTypeMatches(actual, expected string) bool {
	actual = strings.TrimSpace(actual)
	if actual == "" {
		actual = domain.PromptTypeImplementation
	}
	return actual == expected
}

func latestMemoryPromptByType(repo *memoryPlanningRepo, prNodeID uint, promptType string) *domain.SpecForgeCompiledPrompt {
	if repo == nil {
		return nil
	}
	prompt, err := repo.FindLatestCompiledPromptByPRNodeIDAndType(context.Background(), prNodeID, promptType)
	if err != nil {
		return nil
	}
	return prompt
}

func (r *memoryPlanningRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	r.bundle.Plan = plan
	return nil
}

func (r *memoryPlanningRepo) UpsertSkill(ctx context.Context, skill *domain.SpecForgeSkill) error {
	if skill == nil || strings.TrimSpace(skill.RepositoryID) == "" || strings.TrimSpace(skill.Name) == "" || strings.TrimSpace(skill.Content) == "" {
		return domain.ErrInvalidInput
	}
	copied := *skill
	r.skills = append(r.skills, &copied)
	return nil
}

func (r *memoryPlanningRepo) ListActiveSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	out := make([]*domain.SpecForgeSkill, 0, len(r.skills))
	for _, skill := range r.skills {
		if skill == nil || skill.RepositoryID != repositoryID || !skill.Active {
			continue
		}
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryPlanningRepo) ListSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	out := make([]*domain.SpecForgeSkill, 0, len(r.skills))
	for _, skill := range r.skills {
		if skill == nil || skill.RepositoryID != repositoryID {
			continue
		}
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}

type memoryExecutionProfileRepo struct {
	profiles map[string]*domain.SpecForgeRepoProfile
}

func (r *memoryExecutionProfileRepo) UpsertProfile(ctx context.Context, profile *domain.SpecForgeRepoProfile) error {
	if r.profiles == nil {
		r.profiles = map[string]*domain.SpecForgeRepoProfile{}
	}
	copied := *profile
	r.profiles[profile.RepositoryID] = &copied
	return nil
}

func (r *memoryExecutionProfileRepo) FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	if r.profiles == nil || r.profiles[repositoryID] == nil {
		return nil, domain.ErrNotFound
	}
	copied := *r.profiles[repositoryID]
	return &copied, nil
}

type memoryExecutionProjectRepo struct {
	project      *domain.SpecForgeProject
	repositories []*domain.SpecForgeProjectRepository
}

func (r *memoryExecutionProjectRepo) CreateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	copied := *project
	r.project = &copied
	return nil
}

func (r *memoryExecutionProjectRepo) UpdateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	if r.project == nil || r.project.ID != project.ID {
		return domain.ErrNotFound
	}
	copied := *project
	r.project = &copied
	return nil
}

func (r *memoryExecutionProjectRepo) FindProjectByID(ctx context.Context, id uint) (*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.ID != id {
		return nil, domain.ErrNotFound
	}
	copied := *r.project
	return &copied, nil
}

func (r *memoryExecutionProjectRepo) FindProjectByWorkspaceAndSlug(ctx context.Context, workspaceID, slug string) (*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.WorkspaceID != workspaceID || r.project.Slug != slug {
		return nil, domain.ErrNotFound
	}
	copied := *r.project
	return &copied, nil
}

func (r *memoryExecutionProjectRepo) ListProjectsByWorkspace(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.WorkspaceID != workspaceID {
		return []*domain.SpecForgeProject{}, nil
	}
	copied := *r.project
	return []*domain.SpecForgeProject{&copied}, nil
}

func (r *memoryExecutionProjectRepo) CreateProjectRepository(ctx context.Context, binding *domain.SpecForgeProjectRepository) error {
	copied := *binding
	r.repositories = append(r.repositories, &copied)
	return nil
}

func (r *memoryExecutionProjectRepo) DeleteProjectRepository(ctx context.Context, projectID uint, repositoryID string) error {
	for i, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.RepositoryID == repositoryID {
			r.repositories = append(r.repositories[:i], r.repositories[i+1:]...)
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryExecutionProjectRepo) FindProjectRepository(ctx context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.RepositoryID == repositoryID {
			copied := *binding
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryExecutionProjectRepo) ListProjectRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	out := []*domain.SpecForgeProjectRepository{}
	for _, binding := range r.repositories {
		if binding.ProjectID != projectID {
			continue
		}
		copied := *binding
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryExecutionProjectRepo) CountActiveProjectRepositories(ctx context.Context, projectID uint) (int64, error) {
	var count int64
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.Active {
			count++
		}
	}
	return count, nil
}

func (r *memoryExecutionProjectRepo) FindActivePrimaryProjectRepository(ctx context.Context, projectID uint) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.Active && binding.Role == domain.ProjectRepositoryRolePrimary {
			copied := *binding
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
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
			{
				ID:                 4,
				PlanID:             3,
				RepositoryID:       "repo_123",
				NodeKey:            "PR-001",
				Order:              1,
				Title:              "Foundation",
				Goal:               "Prepare the implementation boundary.",
				BranchName:         "specforge/pr-001",
				ExpectedFiles:      []string{"api/internal/modules"},
				NonGoals:           []string{"Do not broaden scope."},
				AcceptanceCriteria: []string{"Foundation is independently reviewable."},
				TestCommands:       []string{"go test ./..."},
				Status:             domain.PRNodeStatusPlanned,
			},
			{
				ID:                 5,
				PlanID:             3,
				RepositoryID:       "repo_123",
				NodeKey:            "PR-002",
				Order:              2,
				Title:              "Implementation",
				Goal:               "Implement the approved feature slice.",
				BranchName:         "specforge/pr-002",
				DependsOn:          []string{"PR-001"},
				ExpectedFiles:      []string{"api/internal/modules"},
				NonGoals:           []string{"Do not broaden scope."},
				AcceptanceCriteria: []string{"Implementation is independently reviewable."},
				TestCommands:       []string{"go test ./..."},
				Status:             domain.PRNodeStatusPlanned,
			},
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
	if bundle.Requirement != nil {
		requirement := *bundle.Requirement
		out.Requirement = &requirement
	}
	if bundle.RepoProfile != nil {
		profile := *bundle.RepoProfile
		out.RepoProfile = &profile
	}
	out.PRNodes = make([]*domain.SpecForgePRNode, len(bundle.PRNodes))
	for i, node := range bundle.PRNodes {
		copied := *node
		out.PRNodes[i] = &copied
	}
	return &out
}
