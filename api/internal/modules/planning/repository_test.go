package planning

import (
	"context"
	"testing"
	"time"

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

func TestRepositoryFindsPRNodeByGitHubPRNumber(t *testing.T) {
	repo := newTestPlanningRepository(t)
	bundle := testPlanBundle()
	require.NoError(t, repo.CreatePlanBundle(context.Background(), bundle))
	node := bundle.PRNodes[0]
	prNumber := 42
	node.GitHubPRNumber = &prNumber
	require.NoError(t, repo.UpdatePRNode(context.Background(), node))

	found, err := repo.FindPRNodeByGitHubPRNumber(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, node.ID, found.ID)
	require.Equal(t, node.BranchName, found.BranchName)
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

func TestRepositoryFindsLatestCompiledPromptForPRNodeByType(t *testing.T) {
	repo := newTestPlanningRepository(t)
	bundle := testPlanBundle()
	require.NoError(t, repo.CreatePlanBundle(context.Background(), bundle))
	implementation := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   bundle.PRNodes[0].ID,
		PlanID:     bundle.Plan.ID,
		Type:       domain.PromptTypeImplementation,
		Version:    "prompt_impl_v1",
		PromptText: "implementation prompt",
		PromptHash: "hash1",
		CreatedBy:  7,
	}
	firstFix := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   bundle.PRNodes[0].ID,
		PlanID:     bundle.Plan.ID,
		Type:       domain.PromptTypeFix,
		Version:    "prompt_fix_v1",
		PromptText: "old fix prompt",
		PromptHash: "hash2",
		CreatedBy:  7,
	}
	secondFix := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   bundle.PRNodes[0].ID,
		PlanID:     bundle.Plan.ID,
		Type:       domain.PromptTypeFix,
		Version:    "prompt_fix_v2",
		PromptText: "new fix prompt",
		PromptHash: "hash3",
		CreatedBy:  7,
	}
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), implementation))
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), firstFix))
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), secondFix))

	found, err := repo.FindLatestCompiledPromptByPRNodeIDAndType(context.Background(), bundle.PRNodes[0].ID, domain.PromptTypeFix)

	require.NoError(t, err)
	require.Equal(t, secondFix.ID, found.ID)
	require.Equal(t, domain.PromptTypeFix, found.Type)
	require.Equal(t, "new fix prompt", found.PromptText)
}

func TestRepositoryPersistsEvidenceRefs(t *testing.T) {
	repo := newTestPlanningRepository(t)
	bundle := testPlanBundle()
	bundle.Plan.EvidenceRefs = []string{"idea:1", "implementation_plan:1:v1"}
	bundle.PRNodes[0].EvidenceRefs = []string{"pr_node:1", "target_repository:repo_123"}
	require.NoError(t, repo.CreatePlanBundle(context.Background(), bundle))

	bundle.Plan.EvidenceRefs = []string{"idea:1", "implementation_plan:1:v1", "product_spec:1:goals"}
	require.NoError(t, repo.UpdatePlan(context.Background(), bundle.Plan))
	bundle.PRNodes[0].EvidenceRefs = []string{"pr_node:1", "target_repository:repo_123", "repo_profile:repo_123"}
	require.NoError(t, repo.UpdatePRNode(context.Background(), bundle.PRNodes[0]))

	prompt := &domain.SpecForgeCompiledPrompt{
		PRNodeID:     bundle.PRNodes[0].ID,
		PlanID:       bundle.Plan.ID,
		Type:         domain.PromptTypeImplementation,
		Version:      "prompt_v2",
		PromptText:   "prompt",
		PromptHash:   "hash",
		EvidenceRefs: []string{"pr_node:1", "skill:2"},
		CreatedBy:    7,
	}
	require.NoError(t, repo.CreateCompiledPrompt(context.Background(), prompt))
	run := &domain.SpecForgeSkillRun{
		PlanID:        &bundle.Plan.ID,
		Stage:         domain.SkillRunStageProductPlan,
		Status:        domain.SkillRunStatusCompleted,
		InputSummary:  "input",
		OutputSummary: "output",
		EvidenceRefs:  []string{"implementation_plan:1:v1", "skill_run.stage:product_plan"},
		CreatedBy:     7,
	}
	require.NoError(t, repo.CreateSkillRun(context.Background(), run))

	foundBundle, err := repo.FindPlanBundleByPlanID(context.Background(), bundle.Plan.ID)
	require.NoError(t, err)
	require.Contains(t, foundBundle.Plan.EvidenceRefs, "product_spec:1:goals")
	require.Contains(t, foundBundle.PRNodes[0].EvidenceRefs, "repo_profile:repo_123")
	foundPrompt, err := repo.FindLatestCompiledPromptByPRNodeID(context.Background(), bundle.PRNodes[0].ID)
	require.NoError(t, err)
	require.Contains(t, foundPrompt.EvidenceRefs, "skill:2")
	runs, err := repo.ListSkillRunsByPlanID(context.Background(), bundle.Plan.ID)
	require.NoError(t, err)
	require.Len(t, runs, 1)
	require.Contains(t, runs[0].EvidenceRefs, "skill_run.stage:product_plan")
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

func TestRepositoryUpsertsProjectSkillsAndRecordsSkillRuns(t *testing.T) {
	repo := newTestPlanningRepository(t)
	skill := &domain.SpecForgeSkill{
		RepositoryID: "github_agicto__codingcto",
		Name:         "planning-sop",
		Content:      "Ground every plan in repo evidence.",
		Active:       true,
		CreatedBy:    7,
	}
	require.NoError(t, repo.UpsertSkill(context.Background(), skill))

	projectSkill := &domain.SpecForgeProjectSkill{
		WorkspaceID:  "workspace_1",
		ProjectID:    42,
		RepositoryID: skill.RepositoryID,
		SkillID:      skill.ID,
		Active:       true,
		SortOrder:    10,
		CreatedBy:    7,
	}
	require.NoError(t, repo.UpsertProjectSkill(context.Background(), projectSkill))
	require.NotZero(t, projectSkill.ID)
	require.NotNil(t, projectSkill.Skill)
	require.Equal(t, "planning-sop", projectSkill.Skill.Name)

	all, err := repo.ListProjectSkillsByProjectID(context.Background(), 42)
	require.NoError(t, err)
	require.Len(t, all, 1)
	active, err := repo.ListActiveProjectSkillsByProjectID(context.Background(), 42)
	require.NoError(t, err)
	require.Len(t, active, 1)

	requirementID := uint(11)
	planID := uint(22)
	projectID := uint(42)
	now := time.Now()
	run := &domain.SpecForgeSkillRun{
		RequirementID: &requirementID,
		PlanID:        &planID,
		ProjectID:     &projectID,
		Stage:         domain.SkillRunStagePRDAG,
		Status:        domain.SkillRunStatusCompleted,
		InputSummary:  "Idea: Add team invite",
		OutputSummary: "PR-001: Add invite model",
		StartedAt:     &now,
		CompletedAt:   &now,
		CreatedBy:     7,
	}
	require.NoError(t, repo.CreateSkillRun(context.Background(), run))
	require.NotZero(t, run.ID)

	requirementRuns, err := repo.ListSkillRunsByRequirementID(context.Background(), requirementID)
	require.NoError(t, err)
	require.Len(t, requirementRuns, 1)
	require.Equal(t, domain.SkillRunStagePRDAG, requirementRuns[0].Stage)
	planRuns, err := repo.ListSkillRunsByPlanID(context.Background(), planID)
	require.NoError(t, err)
	require.Len(t, planRuns, 1)
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
		&ProjectSkillPO{},
		&SkillRunPO{},
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
