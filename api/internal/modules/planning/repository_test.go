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
