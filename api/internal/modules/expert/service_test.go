package expert

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	agentcontract "github.com/zgiai/luas/api/internal/contracts/agent"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestExpertSkillVersionsAndEvolutionProposalFlow(t *testing.T) {
	svc := newTestService(t)

	created, err := svc.UpsertExpert(context.Background(), 42, &UpsertExpertRequest{
		Key:          "architecture-impact",
		Name:         "Architecture Impact Expert",
		Role:         "architecture",
		SystemPrompt: "Review architecture impact before planning.",
	})
	require.NoError(t, err)

	skill, err := svc.UpsertExpertSkill(context.Background(), 42, created.ID, &UpsertExpertSkillRequest{
		RepositoryID:  "repo_web",
		Name:          "module-boundary",
		Description:   "Keep feature folders isolated.",
		Content:       "Do not cross feature folder boundaries without explicit evidence.",
		ChangeSummary: "Initial version",
		TargetAgents:  []string{"planning", "codex_cli"},
	})
	require.NoError(t, err)
	require.NotNil(t, skill.CurrentVersionID)
	require.Equal(t, 1, skill.CurrentVersion.Version)

	proposal, err := svc.CreateEvolutionProposal(context.Background(), 42, skill.ID, &CreateEvolutionProposalRequest{
		ProposedContent: "Require explicit evidence before changing shared feature contracts.",
		Rationale:       "Expert run observed ambiguous shared contract edits.",
	})
	require.NoError(t, err)
	require.Equal(t, domain.ExpertSkillProposalStatusPendingReview, proposal.Status)

	versions, err := svc.ListSkillVersions(context.Background(), skill.ID)
	require.NoError(t, err)
	require.Len(t, versions, 1)

	approved, err := svc.ApproveEvolutionProposal(context.Background(), 7, proposal.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ExpertSkillProposalStatusApproved, approved.Status)

	promoted, err := svc.PromoteEvolutionProposal(context.Background(), 7, proposal.ID)
	require.NoError(t, err)
	require.Equal(t, 2, promoted.Version)

	versions, err = svc.ListSkillVersions(context.Background(), skill.ID)
	require.NoError(t, err)
	require.Len(t, versions, 2)
}

func TestRunPlanningExpertsRecordsSkillVersionRefs(t *testing.T) {
	svc := newTestService(t)
	expert, err := svc.UpsertExpert(context.Background(), 42, &UpsertExpertRequest{
		Key:          "qa-verification",
		Name:         "QA Verification Expert",
		Role:         "qa",
		SystemPrompt: "Review test strategy.",
	})
	require.NoError(t, err)
	skill, err := svc.UpsertExpertSkill(context.Background(), 42, expert.ID, &UpsertExpertSkillRequest{
		RepositoryID: "repo_api",
		Name:         "test-gate",
		Content:      "Every milestone needs a test command.",
	})
	require.NoError(t, err)

	bundle, err := svc.RunPlanningExperts(context.Background(), 42, &domain.SpecForgeExpertPlanningRequest{
		ExpertIDs:    []uint{expert.ID},
		RepositoryID: "repo_api",
		Idea:         "Add expert-selected planning",
	})
	require.NoError(t, err)
	require.Len(t, bundle.Runs, 1)
	expectedRef := agentcontract.FormatSkillVersionRef(skill.ID, 1)
	require.Contains(t, bundle.Runs[0].SkillVersionRefs, expectedRef)
	require.Contains(t, bundle.SkillVersionRefs, expectedRef)
}

func newTestService(t *testing.T) *service {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&ExpertPO{},
		&ExpertSkillPO{},
		&ExpertSkillVersionPO{},
		&ExpertRunPO{},
		&SkillEvolutionProposalPO{},
	))
	return NewService(NewRepository(db))
}
