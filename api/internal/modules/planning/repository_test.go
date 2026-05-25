package planning

import (
	"context"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

func TestRepositoryUpdatesPRNodeGitHubLink(t *testing.T) {
	repo := newTestPlanningRepository(t)
	bundle := testPlanBundle()
	require.NoError(t, repo.CreatePlanBundle(context.Background(), bundle))
	node := bundle.PRNodes[0]
	prNumber := 42
	node.GitHubPRNumber = &prNumber
	node.GitHubPRURL = "https://github.com/agicto/codingcto/pull/42"
	node.GitHubHeadSHA = "abc123"
	node.Status = domain.PRNodeStatusPROpened

	require.NoError(t, repo.UpdatePRNode(context.Background(), node))
	found, err := repo.FindPRNodeByBranchName(context.Background(), node.BranchName)

	require.NoError(t, err)
	require.NotNil(t, found.GitHubPRNumber)
	require.Equal(t, 42, *found.GitHubPRNumber)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42", found.GitHubPRURL)
	require.Equal(t, "abc123", found.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusPROpened, found.Status)
}

func TestRepositoryFindsLatestCompiledPromptForPRNode(t *testing.T) {
	repo := newTestPlanningRepository(t)
	bundle := testPlanBundle()
	require.NoError(t, repo.CreatePlanBundle(context.Background(), bundle))
	first := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   bundle.PRNodes[0].ID,
		PlanID:     bundle.Plan.ID,
		Type:       "implementation",
		Version:    "prompt_v1",
		PromptText: "old prompt",
		PromptHash: "hash1",
		CreatedBy:  7,
	}
	second := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   bundle.PRNodes[0].ID,
		PlanID:     bundle.Plan.ID,
		Type:       "implementation",
		Version:    "prompt_v2",
		PromptText: "new prompt",
		PromptHash: "hash2",
		CreatedBy:  7,
	}
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), first))
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), second))

	found, err := repo.FindLatestCompiledPromptByPRNodeID(context.Background(), bundle.PRNodes[0].ID)

	require.NoError(t, err)
	require.Equal(t, second.ID, found.ID)
	require.Equal(t, "prompt_v2", found.Version)
	require.Equal(t, "new prompt", found.PromptText)
}

func TestRepositoryUpsertsAndListsSkills(t *testing.T) {
	repo := newTestPlanningRepository(t)
	skill := &domain.SpecForgeSkill{
		RepositoryID: "github_agicto__codingcto",
		Name:         "go-layering",
		Description:  "Layering rules",
		Content:      "Handlers delegate to services.",
		Active:       true,
		CreatedBy:    7,
	}
	require.NoError(t, repo.UpsertSkill(context.Background(), skill))
	require.NotZero(t, skill.ID)

	skill.Content = "Handlers bind HTTP and services own business logic."
	require.NoError(t, repo.UpsertSkill(context.Background(), skill))
	all, err := repo.ListSkillsByRepositoryID(context.Background(), "github_agicto__codingcto")
	require.NoError(t, err)
	require.Len(t, all, 1)
	require.Equal(t, "Handlers bind HTTP and services own business logic.", all[0].Content)

	active, err := repo.ListActiveSkillsByRepositoryID(context.Background(), "github_agicto__codingcto")
	require.NoError(t, err)
	require.Len(t, active, 1)
}

func newTestPlanningRepository(t *testing.T) *repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&IdeaPO{},
		&ProductSpecPO{},
		&ImplementationPlanPO{},
		&PRNodePO{},
		&CompiledPromptPO{},
		&SkillPO{},
	))
	return NewRepository(db)
}

func testPlanBundle() *domain.SpecForgePlanBundle {
	return &domain.SpecForgePlanBundle{
		Idea: &domain.SpecForgeIdea{
			RepositoryID: "github_agicto__codingcto",
			CreatedBy:    7,
			RawInput:     "Add team invite",
			Type:         "feature",
			Status:       domain.IdeaStatusAwaitingApproval,
		},
		ProductSpec: &domain.SpecForgeProductSpec{
			Goals: []string{"Add team invite"},
		},
		Plan: &domain.SpecForgeImplementationPlan{
			TechnicalSummary: "Add invite flow",
			Status:           domain.PlanStatusApproved,
		},
		PRNodes: []*domain.SpecForgePRNode{
			{
				NodeKey:       "PR-001",
				Order:         1,
				Title:         "Add invite model",
				Type:          "foundation",
				Goal:          "Add model",
				EstimatedRisk: "medium",
				BranchName:    "specforge/team-invite-01-model",
				Status:        domain.PRNodeStatusPlanned,
			},
		},
	}
}
