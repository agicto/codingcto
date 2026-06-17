package expert

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	agentcontract "github.com/zgiai/luas/api/internal/contracts/agent"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestListExpertsSeedsDefaultProfilesAndSkills(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	experts, err := svc.ListExperts(ctx, true)
	require.NoError(t, err)
	require.Len(t, experts, 4)

	expertsByKey := map[string]*domain.CodingCTOExpert{}
	for _, expert := range experts {
		expertsByKey[expert.Key] = expert
		require.NotEmpty(t, expert.SystemPrompt)
		require.Contains(t, expert.SystemPrompt, "CodingCTO")
	}

	for _, seed := range defaultExpertSeeds() {
		expert := expertsByKey[seed.Expert.Key]
		require.NotNil(t, expert, seed.Expert.Key)
		require.Equal(t, seed.Expert.SystemPrompt, expert.SystemPrompt)

		skills, err := svc.ListExpertSkills(ctx, expert.ID)
		require.NoError(t, err)
		require.Len(t, skills, len(seed.Skills))
		skillsByName := map[string]*domain.CodingCTOExpertSkill{}
		for _, skill := range skills {
			skillsByName[skill.Name] = skill
		}
		for _, skillSeed := range seed.Skills {
			skill := skillsByName[skillSeed.Name]
			require.NotNil(t, skill, skillSeed.Name)
			require.True(t, skill.Active)
			require.Contains(t, skill.TargetAgents, "planning")
			require.NotNil(t, skill.CurrentVersion)
			require.Equal(t, 1, skill.CurrentVersion.Version)
			require.Equal(t, defaultExpertSkillSource, skill.CurrentVersion.Source)
			require.Equal(t, strings.TrimSpace(skillSeed.Content), skill.CurrentVersion.Content)
		}
	}

	_, err = svc.ListExperts(ctx, true)
	require.NoError(t, err)
	for _, expert := range experts {
		skills, err := svc.ListExpertSkills(ctx, expert.ID)
		require.NoError(t, err)
		require.Len(t, skills, 3)
		for _, skill := range skills {
			versions, err := svc.ListSkillVersions(ctx, skill.ID)
			require.NoError(t, err)
			require.Len(t, versions, 1)
		}
	}
}

func TestDefaultExpertSeedDoesNotOverwriteUserContent(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	customExpert, err := svc.UpsertExpert(ctx, 42, &UpsertExpertRequest{
		Key:          "product-requirements",
		Name:         "Product Requirements Expert",
		Role:         "product",
		Description:  "Custom product expert.",
		SystemPrompt: "Use the team's custom product planning policy.",
		Active:       boolPtr(true),
	})
	require.NoError(t, err)
	customSkill, err := svc.UpsertExpertSkill(ctx, 42, customExpert.ID, &UpsertExpertSkillRequest{
		Name:         "Requirement Boundary Contract",
		Description:  "Custom requirement boundary.",
		Content:      "Always use the user's custom product boundary template.",
		TargetAgents: []string{"planning"},
	})
	require.NoError(t, err)

	experts, err := svc.ListExperts(ctx, true)
	require.NoError(t, err)
	var productExpert *domain.CodingCTOExpert
	for _, expert := range experts {
		if expert.Key == "product-requirements" {
			productExpert = expert
			break
		}
	}
	require.NotNil(t, productExpert)
	require.Equal(t, "Custom product expert.", productExpert.Description)
	require.Equal(t, "Use the team's custom product planning policy.", productExpert.SystemPrompt)

	skills, err := svc.ListExpertSkills(ctx, productExpert.ID)
	require.NoError(t, err)
	var boundarySkill *domain.CodingCTOExpertSkill
	for _, skill := range skills {
		if skill.Name == "Requirement Boundary Contract" {
			boundarySkill = skill
			break
		}
	}
	require.NotNil(t, boundarySkill)
	require.Equal(t, customSkill.ID, boundarySkill.ID)
	require.NotNil(t, boundarySkill.CurrentVersion)
	require.Equal(t, "manual", boundarySkill.CurrentVersion.Source)
	require.Equal(t, "Always use the user's custom product boundary template.", boundarySkill.CurrentVersion.Content)
	versions, err := svc.ListSkillVersions(ctx, customSkill.ID)
	require.NoError(t, err)
	require.Len(t, versions, 1)
}

func TestRunPlanningExpertsUsesDefaultSkillVersionRefs(t *testing.T) {
	svc := newTestService(t)
	ctx := context.Background()

	experts, err := svc.ListExperts(ctx, true)
	require.NoError(t, err)
	var qaExpert *domain.CodingCTOExpert
	for _, expert := range experts {
		if expert.Key == "qa-verification" {
			qaExpert = expert
			break
		}
	}
	require.NotNil(t, qaExpert)

	bundle, err := svc.RunPlanningExperts(ctx, 42, &domain.SpecForgeExpertPlanningRequest{
		ExpertIDs:    []uint{qaExpert.ID},
		RepositoryID: "repo_api",
		Idea:         "Add default expert skills",
	})
	require.NoError(t, err)
	require.Len(t, bundle.Runs, 1)
	require.Len(t, bundle.Runs[0].SkillVersionRefs, 3)
	require.Len(t, bundle.SkillVersionRefs, 3)
}

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
	dbName := strings.NewReplacer("/", "_", " ", "_").Replace(t.Name())
	db, err := gorm.Open(sqlite.Open("file:"+dbName+"?mode=memory&cache=shared"), &gorm.Config{})
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

func boolPtr(value bool) *bool {
	return &value
}
