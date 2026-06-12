package planning

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestCreateIdeaBuildsReviewablePlanBundle(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{profile: &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_123",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		CIProvider:    "github_actions",
		RiskAreas:     []string{"database"},
	}}
	svc := NewService(repo, profileRepo, repo, nil)

	bundle, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
		Type:  "feature",
	})

	require.NoError(t, err)
	require.Equal(t, "repo_123", bundle.Idea.RepositoryID)
	require.NotNil(t, bundle.RepoProfile)
	require.Contains(t, bundle.ProductSpec.Assumptions, "Plan generation used the current repo profile for stack, test command, convention, and risk context.")
	require.Equal(t, uint(42), bundle.Idea.CreatedBy)
	require.Equal(t, domain.IdeaStatusAwaitingApproval, bundle.Idea.Status)
	require.NotEmpty(t, bundle.ProductSpec.AcceptanceCriteria)
	require.Equal(t, domain.PlanStatusDraft, bundle.Plan.Status)
	require.Len(t, bundle.PRNodes, 3)
	require.Equal(t, "PR-001", bundle.PRNodes[0].NodeKey)
	require.Contains(t, bundle.ProductSpec.Goals[0], "Add team invite feature for workspace admins")
	require.Contains(t, bundle.Plan.TechnicalSummary, "Add team invite feature for workspace admins")
	require.Contains(t, bundle.PRNodes[0].Title, "Add team invite feature for workspace admins")
	require.Contains(t, bundle.PRNodes[1].Title, "backend support")
	require.NotContains(t, bundle.Plan.TechnicalSummary, "SpecForge planning aggregate")
	require.Empty(t, bundle.PRNodes[0].DependsOn)
	require.Contains(t, bundle.PRNodes[1].DependsOn, "PR-001")
	require.Contains(t, bundle.ProductSpec.Assumptions, "PR DAG review: validation passed for 3 reviewable PR nodes; dependencies resolve within the generated plan.")
}

func TestCreateIdeaBuildsFrontendAndBackendPRDAGFromRepoProfile(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{profile: &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_123",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin", "Next.js", "React", "TypeScript"},
		TestCommands:  []string{"go test ./...", "pnpm test"},
		CIProvider:    "github_actions",
		AppStructure:  []string{"api/internal/modules", "web/src/features"},
	}}
	svc := NewService(repo, profileRepo, repo, nil)

	bundle, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
		Type:  "feature",
	})

	require.NoError(t, err)
	require.Len(t, bundle.PRNodes, 4)
	require.Equal(t, "foundation", bundle.PRNodes[0].Type)
	require.Equal(t, "backend", bundle.PRNodes[1].Type)
	require.Equal(t, "frontend", bundle.PRNodes[2].Type)
	require.Equal(t, "verification", bundle.PRNodes[3].Type)
	require.Contains(t, bundle.PRNodes[2].DependsOn, "PR-002")
	require.Contains(t, bundle.PRNodes[3].DependsOn, "PR-003")
	require.Contains(t, bundle.Plan.AffectedAreas, "api/internal/modules")
	require.Contains(t, bundle.Plan.AffectedAreas, "web/src/features")
	require.Contains(t, bundle.Plan.APIChanges[0], "team invite")
	require.Contains(t, bundle.Plan.UIChanges[0], "team invite")
	require.Contains(t, bundle.ProductSpec.Assumptions, "PR DAG review: validation passed for 4 reviewable PR nodes; dependencies resolve within the generated plan.")
}

func TestCreateIdeaAddsMilestoneGuardrailForOverlargeIdeas(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{profile: &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_123",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin", "Next.js", "React", "Postgres"},
		TestCommands:  []string{"go test ./...", "pnpm test"},
		CIProvider:    "github_actions",
		AppStructure:  []string{"api/internal/modules", "web/src/features"},
		RiskAreas:     []string{"auth", "billing"},
	}}
	svc := NewService(repo, profileRepo, repo, nil)

	bundle, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add workspace invite with database schema, admin UI, email notifications, role permissions, audit log, Stripe billing limits, and Slack integration",
		Type:  "feature",
	})

	require.NoError(t, err)
	require.Contains(t, bundle.ProductSpec.Assumptions, "Complexity guardrail: this idea spans data model or migration, backend API, frontend UI, email or notification, auth or permission, audit or compliance, billing, external integration; keep the first execution milestone to at most five PRs and one high-risk surface.")
	require.Contains(t, bundle.ProductSpec.EdgeCases, "If the approved scope still requires all detected surfaces, split execution into separate milestones before starting autonomous implementation.")
	require.Contains(t, bundle.ProductSpec.NonGoals, "Do not execute all high-risk surfaces in one MVP run; approve a milestone slice first.")
	require.Contains(t, bundle.Plan.SecurityRisks, "Complexity guardrail: combined changes across data model or migration, backend API, frontend UI, email or notification, auth or permission, audit or compliance, billing, external integration increase review and regression risk; isolate security-sensitive changes before UI or notification work.")
	require.Contains(t, bundle.Plan.MigrationRisks, "Complexity guardrail: if persistence or migration work is required, land it in a foundation milestone before dependent API, UI, notification, or audit work.")
	require.Contains(t, bundle.ProductSpec.Assumptions, "PR DAG review: complexity guardrail recommends a milestone split before execution because the idea spans data model or migration, backend API, frontend UI, email or notification, auth or permission, audit or compliance, billing, external integration.")
}

func TestApprovePlanRecordsApproverAndRejectsSecondApproval(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)

	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)

	approved, err := svc.ApprovePlan(context.Background(), 7, created.Plan.ID, &ApprovePlanRequest{
		Approved: true,
		DecisionOverrides: map[string]string{
			"invite_expiration_days": "7",
		},
	})
	require.NoError(t, err)
	require.Equal(t, domain.PlanStatusApproved, approved.Plan.Status)
	require.NotNil(t, approved.Plan.ApprovedBy)
	require.Equal(t, uint(7), *approved.Plan.ApprovedBy)
	require.NotNil(t, approved.Plan.ApprovedAt)
	require.Contains(t, approved.Plan.DecisionOverrides, "invite_expiration_days=7")

	_, err = svc.ApprovePlan(context.Background(), 7, created.Plan.ID, &ApprovePlanRequest{Approved: true})
	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestApprovePlanRejectsInvalidPRDAG(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)
	repo.bundle.PRNodes[0].ExpectedFiles = nil

	_, err = svc.ApprovePlan(context.Background(), 7, created.Plan.ID, &ApprovePlanRequest{Approved: true})

	require.ErrorIs(t, err, domain.ErrConflict)
	require.Equal(t, domain.PlanStatusDraft, repo.bundle.Plan.Status)
}

func TestPlanReviewResponseExposesPRDAGReview(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)
	created.PRNodes[0].ExpectedFiles = nil

	response := toPlanReviewResponse(created)

	require.Contains(t, response.PRDAGReview, "PR DAG review: PR-001 has no expected file scope.")
}

func TestCompilePromptPersistsVersionedPromptForPRNode(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{profile: &domain.SpecForgeRepoProfile{
		RepositoryID:      "repo_123",
		DefaultBranch:     "main",
		Stack:             []string{"Go", "Gin"},
		TestCommands:      []string{"go test ./..."},
		CIProvider:        "github_actions",
		CodingConventions: []string{"Use service layer for business logic"},
		RiskAreas:         []string{"auth"},
		Summary:           "Backend API scaffold",
		Source:            "github_tree",
		Warnings:          []string{"No frontend routes were detected from the repository tree."},
		LastIndexedAt:     time.Date(2026, 5, 29, 9, 30, 0, 0, time.UTC),
	}}
	svc := NewService(repo, profileRepo, repo, nil)

	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[1].ID, &CompilePromptRequest{})
	require.NoError(t, err)
	require.Equal(t, created.PRNodes[1].ID, prompt.PRNodeID)
	require.Equal(t, created.Plan.ID, prompt.PlanID)
	require.Equal(t, "implementation", prompt.Type)
	require.Equal(t, "prompt_v2", prompt.Version)
	require.Len(t, prompt.PromptHash, 64)
	require.Contains(t, prompt.EvidenceRefs, fmt.Sprintf("implementation_plan:%d:v1", created.Plan.ID))
	require.Contains(t, prompt.EvidenceRefs, fmt.Sprintf("pr_node:%d", created.PRNodes[1].ID))
	require.Contains(t, prompt.EvidenceRefs, "target_repository:repo_123")
	require.Contains(t, created.Plan.EvidenceRefs, fmt.Sprintf("implementation_plan:%d:v1", created.Plan.ID))
	require.Contains(t, created.PRNodes[1].EvidenceRefs, fmt.Sprintf("pr_node:%d", created.PRNodes[1].ID))
	require.Contains(t, prompt.PromptText, created.PRNodes[1].Title)
	require.Contains(t, prompt.PromptText, "Target repository: repo_123")
	require.Contains(t, prompt.PromptText, "Grounded prompt contract")
	require.Contains(t, prompt.PromptText, "Evidence refs")
	require.Contains(t, prompt.PromptText, "idea.raw_input: Add team invite feature for workspace admins")
	require.Contains(t, prompt.PromptText, "technical_plan.summary")
	require.Contains(t, prompt.PromptText, "pr_node.expected_files")
	require.Contains(t, prompt.PromptText, "repo_profile.source: github_tree")
	require.Contains(t, prompt.PromptText, "repo_wiki.planning_context_state: ready")
	require.Contains(t, prompt.PromptText, "repo_wiki.planning_context_score: 100%")
	require.Contains(t, prompt.PromptText, "repo_wiki.planning_context_sections")
	require.Contains(t, prompt.PromptText, "Repository overview [ready")
	require.Contains(t, prompt.PromptText, "Testing and quality [ready")
	require.Contains(t, prompt.PromptText, "Scope guardrails")
	require.Contains(t, prompt.PromptText, "Write scope is limited to target repository repo_123.")
	require.Contains(t, prompt.PromptText, "Allowed file scope")
	require.Contains(t, prompt.PromptText, "PR DAG guardrails")
	require.Contains(t, prompt.PromptText, "PR DAG review: validation passed")
	require.Contains(t, prompt.PromptText, "Verification contract")
	require.Contains(t, prompt.PromptText, "PR description must include summary, scope, non-goals, evidence refs used, tests run, and remaining risk.")
	require.Contains(t, prompt.PromptText, "Repository context")
	require.Contains(t, prompt.PromptText, "Backend API scaffold")
	require.Contains(t, prompt.PromptText, "Profile source: github_tree")
	require.Contains(t, prompt.PromptText, "Last indexed at: 2026-05-29T09:30:00Z")
	require.Contains(t, prompt.PromptText, "No frontend routes were detected from the repository tree.")
	require.Contains(t, prompt.PromptText, "Use service layer for business logic")
	require.Contains(t, prompt.PromptText, "Acceptance criteria")
	require.NotNil(t, repo.prompt)
}

func TestUpsertSkillPersistsRepoInstruction(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	active := true

	skill, err := svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:         "service-layer",
		Description:  "API route guidance",
		Content:      "API handlers must delegate business logic to services.",
		Active:       &active,
		TargetAgents: []string{"planning", "planning", " codex_cli "},
	})

	require.NoError(t, err)
	require.Equal(t, "repo_123", skill.RepositoryID)
	require.Equal(t, uint(42), skill.CreatedBy)
	require.True(t, skill.Active)
	require.Equal(t, []string{"planning", "codex_cli"}, skill.TargetAgents)

	skills, err := svc.ListSkills(context.Background(), "repo_123")
	require.NoError(t, err)
	require.Len(t, skills, 1)
	require.Equal(t, "service-layer", skills[0].Name)
	require.Equal(t, "API handlers must delegate business logic to services.", skills[0].Content)
	require.Equal(t, []string{"planning", "codex_cli"}, skills[0].TargetAgents)
}

func TestUpsertProjectSkillBindsSkillToProject(t *testing.T) {
	repo := &memoryRepo{}
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{
			ID:          77,
			WorkspaceID: "workspace_1",
			Name:        "CodingCTO",
			Slug:        "codingcto",
			Status:      domain.ProjectStatusActive,
		},
		repositories: []*domain.SpecForgeProjectRepository{
			{
				WorkspaceID:  "workspace_1",
				ProjectID:    77,
				RepositoryID: "repo_primary",
				Role:         domain.ProjectRepositoryRolePrimary,
				Active:       true,
			},
		},
	}
	svc := NewService(repo, &memoryProfileRepo{}, repo, projectRepo)

	projectSkill, err := svc.UpsertProjectSkill(context.Background(), 42, 77, &UpsertProjectSkillRequest{
		RepositoryID: "repo_primary",
		Name:         "Planning SOP",
		Description:  "Grounded planning workflow",
		Content:      "Map every acceptance criterion to PR nodes before execution.",
		Active:       boolPtr(true),
		SortOrder:    5,
	})

	require.NoError(t, err)
	require.Equal(t, uint(77), projectSkill.ProjectID)
	require.Equal(t, "repo_primary", projectSkill.RepositoryID)
	require.NotZero(t, projectSkill.SkillID)
	require.NotNil(t, projectSkill.Skill)
	require.Equal(t, "Planning SOP", projectSkill.Skill.Name)
	require.Equal(t, 5, projectSkill.SortOrder)

	projectSkills, err := svc.ListProjectSkills(context.Background(), 77)
	require.NoError(t, err)
	require.Len(t, projectSkills, 1)
	require.Equal(t, "Planning SOP", projectSkills[0].Skill.Name)
}

func TestCreateProjectRequirementRecordsSkillRunPipeline(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_web": {
				RepositoryID: "repo_web",
				Stack:        []string{"Next.js", "TypeScript"},
				TestCommands: []string{"pnpm type-check"},
			},
		},
	}
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{
			ID:          77,
			WorkspaceID: "workspace_1",
			Name:        "CodingCTO",
			Slug:        "codingcto",
			Status:      domain.ProjectStatusActive,
		},
		repositories: []*domain.SpecForgeProjectRepository{
			{
				WorkspaceID:  "workspace_1",
				ProjectID:    77,
				RepositoryID: "repo_web",
				Role:         domain.ProjectRepositoryRolePrimary,
				Active:       true,
			},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 77, "workspace_1", "repo_web")
	svc := NewService(repo, profileRepo, repo, projectRepo)
	_, err := svc.UpsertProjectSkill(context.Background(), 42, 77, &UpsertProjectSkillRequest{
		RepositoryID: "repo_web",
		Name:         "Planning SOP",
		Content:      "Use evidence-backed planning.",
		Active:       boolPtr(true),
		TargetAgents: []string{"planning"},
	})
	require.NoError(t, err)

	bundle, err := svc.CreateProjectRequirement(context.Background(), 42, 77, &CreateIdeaRequest{
		Input: "Add project skill pipeline history to the planning console",
		Type:  "feature",
	})

	require.NoError(t, err)
	require.NotNil(t, bundle.Requirement)
	runs, err := svc.ListSkillRunsForRequirement(context.Background(), bundle.Requirement.ID)
	require.NoError(t, err)
	require.Len(t, runs, 4)
	require.NotNil(t, bundle.ContextSnapshot)
	require.NotNil(t, bundle.ExpertPolicy)
	require.Equal(t, bundle.ContextSnapshot.ID, *bundle.Plan.ContextSnapshotID)
	require.Equal(t, bundle.ExpertPolicy.ID, *bundle.Plan.ExpertPolicyID)
	require.Equal(t, domain.SkillRunStageProductPlan, runs[0].Stage)
	require.Equal(t, domain.SkillRunStageTechnicalPlan, runs[1].Stage)
	require.Equal(t, domain.SkillRunStagePRDAG, runs[2].Stage)
	require.Equal(t, domain.SkillRunStageSelfReview, runs[3].Stage)
	require.Contains(t, runs[0].InputSummary, "Active skills: 1")
	require.Contains(t, runs[0].EvidenceRefs, fmt.Sprintf("requirement:%d", bundle.Requirement.ID))
	require.Contains(t, runs[0].EvidenceRefs, "skill_run.stage:"+domain.SkillRunStageProductPlan)
	require.Contains(t, bundle.Plan.EvidenceRefs, fmt.Sprintf("requirement:%d", bundle.Requirement.ID))
	require.Contains(t, bundle.PRNodes[0].EvidenceRefs, "target_repository:repo_web")
	require.Contains(t, runs[2].OutputSummary, "PR-001")
	planRuns, err := svc.ListSkillRunsForPlan(context.Background(), bundle.Plan.ID)
	require.NoError(t, err)
	require.Len(t, planRuns, 4)
}

func TestCreateProjectRequirementIncludesArchitectureEvidence(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_api",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		Summary:       "API service",
	}))
	require.NoError(t, profileRepo.CreateArchitectureSnapshot(context.Background(), &domain.SpecForgeRepoArchitectureSnapshot{
		RepositoryID: "repo_api",
		CommitSHA:    "abc123",
		Modules:      []string{"api/internal/modules/planning", "api/internal/modules/execution"},
		Entrypoints:  []string{"api/cmd/server/main.go"},
		CIWorkflows:  []string{".github/workflows/api.yml"},
		Summary:      "API architecture snapshot",
		Warnings:     []string{"No worker entrypoint detected."},
		CreatedAt:    time.Now().UTC(),
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 77, WorkspaceID: "workspace_1", Name: "CodingCTO", Slug: "codingcto", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 77, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 77, "workspace_1", "repo_api")
	svc := NewService(repo, profileRepo, repo, projectRepo)

	bundle, err := svc.CreateProjectRequirement(context.Background(), 42, 77, &CreateIdeaRequest{
		Input: "Add architecture evidence to execution prompts",
		Type:  "feature",
	})

	require.NoError(t, err)
	require.NotNil(t, bundle.ProjectContext)
	require.NotNil(t, bundle.ProjectContext.RepositoryContexts[0].ArchitectureSnapshot)
	require.Equal(t, "abc123", bundle.ProjectContext.RepositoryContexts[0].ArchitectureSnapshot.CommitSHA)
	require.Contains(t, bundle.Plan.EvidenceRefs, "architecture_snapshot:repo_api:abc123")
	require.Contains(t, bundle.Plan.EvidenceRefs, "architecture_snapshot:repo_api:modules")
	require.Contains(t, bundle.Plan.EvidenceRefs, "architecture_snapshot:repo_api:entrypoints")
	require.Contains(t, bundle.Plan.EvidenceRefs, "architecture_snapshot:repo_api:ci_workflows")
	require.Contains(t, bundle.Plan.EvidenceRefs, "architecture_snapshot:repo_api:warnings")
	require.Contains(t, bundle.PRNodes[0].EvidenceRefs, "architecture_snapshot:repo_api:abc123")
	runs, err := svc.ListSkillRunsForPlan(context.Background(), bundle.Plan.ID)
	require.NoError(t, err)
	require.NotEmpty(t, runs)
	require.Contains(t, runs[0].EvidenceRefs, "architecture_snapshot:repo_api:abc123")

	prompt, err := svc.CompilePrompt(context.Background(), 42, bundle.PRNodes[0].ID, &CompilePromptRequest{})
	require.NoError(t, err)
	require.Contains(t, prompt.EvidenceRefs, "architecture_snapshot:repo_api:abc123")
	require.Contains(t, prompt.EvidenceRefs, fmt.Sprintf("project_context_snapshot:%d", bundle.ContextSnapshot.ID))
	require.Contains(t, prompt.EvidenceRefs, fmt.Sprintf("project_expert_policy:%d:v%d", bundle.ExpertPolicy.ID, bundle.ExpertPolicy.Version))
	require.Contains(t, prompt.PromptText, "Context contract: project_context_contract_v1")
	require.Contains(t, prompt.PromptText, "Pinned planning inputs")
	require.Contains(t, prompt.PromptText, "Context snapshot #")
	require.Contains(t, prompt.PromptText, "Expert policy v1")
	require.Contains(t, prompt.PromptText, "contract.primary_repository_id: repo_api")
	require.Contains(t, prompt.PromptText, "contract.repository: repo_api role=primary writable=true")
	require.Contains(t, prompt.PromptText, "contract.architecture_snapshot_commit: abc123")
	require.Contains(t, prompt.PromptText, "Architecture snapshot commit: abc123")
	require.Contains(t, prompt.PromptText, "Architecture modules: api/internal/modules/planning, api/internal/modules/execution")
	require.Contains(t, prompt.PromptText, "Architecture entrypoints: api/cmd/server/main.go")
	require.Contains(t, prompt.PromptText, "Architecture CI workflows: .github/workflows/api.yml")
	require.Contains(t, prompt.PromptText, "No worker entrypoint detected.")
}

func TestCompilePromptEscalatesMissingProjectArchitectureEvidence(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_api",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		Summary:       "API service",
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 77, WorkspaceID: "workspace_1", Name: "CodingCTO", Slug: "codingcto", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 77, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 77, "workspace_1", "repo_api")
	svc := NewService(repo, profileRepo, repo, projectRepo)

	bundle, err := svc.CreateProjectRequirement(context.Background(), 42, 77, &CreateIdeaRequest{
		Input: "Add architecture evidence to execution prompts",
		Type:  "feature",
	})
	require.NoError(t, err)
	require.True(t, bundle.ProjectContext.RepositoryContexts[0].ArchitectureStale)
	require.Contains(t, bundle.ProjectContext.RepositoryContexts[0].ArchitectureWarnings, "Architecture snapshot has not been generated yet.")

	prompt, err := svc.CompilePrompt(context.Background(), 42, bundle.PRNodes[0].ID, &CompilePromptRequest{})

	require.NoError(t, err)
	require.NotContains(t, prompt.EvidenceRefs, "architecture_snapshot:repo_api:modules")
	require.Contains(t, prompt.PromptText, "contract.missing_evidence: architecture_snapshot:repo_api, architecture_snapshot_stale:repo_api")
	require.Contains(t, prompt.PromptText, "contract.guardrail: Missing context evidence must be treated as uncertainty, not inferred as fact.")
	require.Contains(t, prompt.PromptText, "Architecture snapshot: missing")
	require.Contains(t, prompt.PromptText, "Architecture snapshot has not been generated yet.")
}

func TestCompilePromptInjectsActiveRepoSkills(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)
	_, err = svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:         "go-layering",
		Content:      "Use handlers only for HTTP binding and response mapping.",
		TargetAgents: []string{"planning"},
	})
	require.NoError(t, err)
	_, err = svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:         "execution-only",
		Content:      "This is only for implementation agents.",
		TargetAgents: []string{"codex_cli"},
	})
	require.NoError(t, err)
	inactive := false
	_, err = svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:    "inactive-guidance",
		Content: "This should not appear.",
		Active:  &inactive,
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[0].ID, &CompilePromptRequest{})

	require.NoError(t, err)
	require.Contains(t, prompt.PromptText, "Skill application protocol")
	require.Contains(t, prompt.PromptText, "translate every repository skill below into concrete constraints")
	require.Contains(t, prompt.PromptText, "skills_applied")
	require.Contains(t, prompt.PromptText, "Repository skills")
	require.Contains(t, prompt.PromptText, "- repository_skills:")
	require.NotContains(t, prompt.PromptText, "- repository_skills: none")
	require.Contains(t, prompt.PromptText, "go-layering")
	require.Contains(t, prompt.PromptText, "Use handlers only for HTTP binding and response mapping.")
	require.Contains(t, prompt.PromptText, "execution-only")
	require.Contains(t, prompt.PromptText, "This is only for implementation agents.")
	require.NotContains(t, prompt.PromptText, "This should not appear.")
}

func TestCreateProjectIdeaUsesProjectContextProfilesAndSkills(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:      "repo_api",
		DefaultBranch:     "main",
		Stack:             []string{"Go", "Gin"},
		TestCommands:      []string{"go test ./..."},
		CIProvider:        "github_actions",
		AppStructure:      []string{"api/internal/modules"},
		CodingConventions: []string{"Use service layer for business logic"},
		Summary:           "API service",
	}))
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:      "repo_web",
		DefaultBranch:     "main",
		Stack:             []string{"Next.js", "React", "TypeScript"},
		TestCommands:      []string{"pnpm test"},
		CIProvider:        "github_actions",
		AppStructure:      []string{"web/src/features"},
		CodingConventions: []string{"Keep feature folders self-contained"},
		Summary:           "Web console",
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 9, WorkspaceID: "ws_1", Name: "SpecForge", Slug: "specforge", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 9, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
			{ID: 2, ProjectID: 9, RepositoryID: "repo_web", Role: domain.ProjectRepositoryRoleDependency, Active: true},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 9, "ws_1", "repo_api")
	svc := NewService(repo, profileRepo, repo, projectRepo)
	_, err := svc.UpsertSkill(context.Background(), 42, "repo_web", &UpsertSkillRequest{
		Name:    "ui-boundaries",
		Content: "Keep project console UI minimal and task-focused.",
	})
	require.NoError(t, err)

	bundle, err := svc.CreateProjectIdea(context.Background(), 42, 9, &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
	})

	require.NoError(t, err)
	require.NotNil(t, bundle.Requirement)
	require.Equal(t, bundle.Requirement.ID, *bundle.Idea.RequirementID)
	require.Equal(t, bundle.Requirement.ID, *bundle.Plan.RequirementID)
	require.Equal(t, 1, bundle.Plan.Version)
	require.NotNil(t, bundle.Idea.ProjectID)
	require.Equal(t, uint(9), *bundle.Idea.ProjectID)
	require.Equal(t, "repo_api", bundle.Idea.RepositoryID)
	require.NotNil(t, bundle.ProjectContext)
	require.Equal(t, "repo_api", bundle.ProjectContext.PrimaryRepositoryID)
	require.Equal(t, "repo_api", bundle.ProjectContext.ExecutionRepositoryID)
	require.Equal(t, []string{"repo_web"}, bundle.ProjectContext.ReadOnlyRepositoryIDs)
	require.Contains(t, bundle.ProjectContext.ExecutionGuardrails, "Executor must modify only repo_api; other bound repositories are read-only context.")
	require.Contains(t, bundle.RepoProfile.Stack, "Go")
	require.Contains(t, bundle.RepoProfile.Stack, "Next.js")
	require.Contains(t, bundle.Plan.AffectedAreas, "api/internal/modules")
	require.Contains(t, bundle.Plan.AffectedAreas, "web/src/features")
	require.Contains(t, bundle.ProductSpec.Assumptions, "Plan generation used project context for SpecForge across 2 active repositories; execution is limited to primary repository repo_api.")
	for _, node := range bundle.PRNodes {
		require.Equal(t, "repo_api", node.RepositoryID)
	}
}

func TestCreateProjectRequirementRequiresActivePrimaryRepository(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 9, WorkspaceID: "ws_1", Name: "CodingCTO", Slug: "codingcto", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 9, RepositoryID: "repo_docs", Role: domain.ProjectRepositoryRoleDocs, Active: true},
			{ID: 2, ProjectID: 9, RepositoryID: "repo_web", Role: domain.ProjectRepositoryRoleDependency, Active: true},
		},
	}
	svc := NewService(repo, profileRepo, repo, projectRepo)

	_, err := svc.CreateProjectRequirement(context.Background(), 42, 9, &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestCreateProjectRequirementRequiresPinnedSnapshotAndExpertPolicy(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_api",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		Summary:       "API service",
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 9, WorkspaceID: "ws_1", Name: "CodingCTO", Slug: "codingcto", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 9, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
		},
	}
	svc := NewService(repo, profileRepo, repo, projectRepo)

	_, err := svc.CreateProjectRequirement(context.Background(), 42, 9, &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestGenerateRequirementPlanCreatesNextVersionAndApprovalRejectsStalePlan(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_api",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		Summary:       "API service",
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 9, WorkspaceID: "ws_1", Name: "CodingCTO", Slug: "codingcto", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 9, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 9, "ws_1", "repo_api")
	svc := NewService(repo, profileRepo, repo, projectRepo)

	v1, err := svc.CreateProjectRequirement(context.Background(), 42, 9, &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
	})
	require.NoError(t, err)
	require.NotNil(t, v1.Requirement)
	require.Equal(t, 1, v1.Plan.Version)

	v2, err := svc.GenerateRequirementPlan(context.Background(), 42, v1.Requirement.ID, &CreateIdeaRequest{
		Input: "Add team invite UI, API, and audit trail for workspace admins",
	})
	require.NoError(t, err)
	require.Equal(t, 2, v2.Plan.Version)
	require.Equal(t, v1.Requirement.ID, *v2.Plan.RequirementID)
	require.Equal(t, v1.Plan.ContextSnapshotID, v2.Plan.ContextSnapshotID)
	require.Equal(t, v1.Plan.ExpertPolicyID, v2.Plan.ExpertPolicyID)

	_, err = svc.ApprovePlan(context.Background(), 7, v1.Plan.ID, &ApprovePlanRequest{Approved: true})
	require.ErrorIs(t, err, domain.ErrConflict)

	approved, err := svc.ApprovePlan(context.Background(), 7, v2.Plan.ID, &ApprovePlanRequest{Approved: true})
	require.NoError(t, err)
	require.Equal(t, domain.PlanStatusApproved, approved.Plan.Status)
	require.NotEmpty(t, approved.Plan.ApprovedSnapshotHash)
	require.NotNil(t, approved.Plan.ApprovedSnapshotAt)
	require.NotNil(t, approved.ContextSnapshot)
	require.NotNil(t, approved.ExpertPolicy)
}

func TestCompilePromptInjectsProjectContextSkills(t *testing.T) {
	repo := &memoryRepo{}
	profileRepo := &memoryProfileRepo{}
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_api",
		DefaultBranch: "main",
		Stack:         []string{"Go", "Gin"},
		TestCommands:  []string{"go test ./..."},
		Summary:       "API service",
	}))
	require.NoError(t, profileRepo.UpsertProfile(context.Background(), &domain.SpecForgeRepoProfile{
		RepositoryID:  "repo_web",
		DefaultBranch: "main",
		Stack:         []string{"Next.js", "React"},
		TestCommands:  []string{"pnpm test"},
		Summary:       "Web console",
	}))
	projectRepo := &memoryProjectRepo{
		project: &domain.SpecForgeProject{ID: 9, WorkspaceID: "ws_1", Name: "SpecForge", Slug: "specforge", Status: domain.ProjectStatusActive},
		repositories: []*domain.SpecForgeProjectRepository{
			{ID: 1, ProjectID: 9, RepositoryID: "repo_api", Role: domain.ProjectRepositoryRolePrimary, Active: true},
			{ID: 2, ProjectID: 9, RepositoryID: "repo_web", Role: domain.ProjectRepositoryRoleDependency, Active: true},
		},
	}
	seedProjectPlanningInputs(t, projectRepo, 9, "ws_1", "repo_api")
	svc := NewService(repo, profileRepo, repo, projectRepo)
	_, err := svc.UpsertSkill(context.Background(), 42, "repo_web", &UpsertSkillRequest{
		Name:         "module-boundaries",
		Content:      "Web code talks to API over HTTP only.",
		TargetAgents: []string{"planning"},
	})
	require.NoError(t, err)
	created, err := svc.CreateProjectIdea(context.Background(), 42, 9, &CreateIdeaRequest{
		Input: "Add team invite UI and API for workspace admins",
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[0].ID, &CompilePromptRequest{})

	require.NoError(t, err)
	require.Contains(t, prompt.PromptText, "Project context")
	require.Contains(t, prompt.PromptText, "Project: SpecForge")
	require.Contains(t, prompt.PromptText, "Repository repo_api (primary)")
	require.Contains(t, prompt.PromptText, "Repository repo_web (dependency)")
	require.Contains(t, prompt.PromptText, "Primary repository: repo_api")
	require.Contains(t, prompt.PromptText, "Read-only repositories: repo_web")
	require.Contains(t, prompt.PromptText, "Expert policy v1")
	require.Contains(t, prompt.PromptText, "Goal boundary")
	require.Contains(t, prompt.PromptText, "Executor must modify only repo_api")
	require.Contains(t, prompt.PromptText, "Web console")
	require.Contains(t, prompt.PromptText, "module-boundaries")
	require.Contains(t, prompt.PromptText, "Web code talks to API over HTTP only.")
}

func TestCompilePromptInjectsFixModeInstructions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[0].ID, &CompilePromptRequest{
		Type: "fix",
	})

	require.NoError(t, err)
	require.Equal(t, "fix", prompt.Type)
	require.Contains(t, prompt.PromptText, "Execution mode instructions")
	require.Contains(t, prompt.PromptText, "targeted repair for a failed PR node")
	require.Contains(t, prompt.PromptText, "fix budget is exhausted")
	require.Contains(t, prompt.PromptText, "produce an escalation summary")
}

func TestCompilePromptInjectsReviewPatchModeInstructions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo, nil)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[0].ID, &CompilePromptRequest{
		Type: "review_patch",
	})

	require.NoError(t, err)
	require.Equal(t, "review_patch", prompt.Type)
	require.Contains(t, prompt.PromptText, "response to human PR review feedback")
	require.Contains(t, prompt.PromptText, "Address only actionable review comments")
	require.Contains(t, prompt.PromptText, "Do not add unrelated cleanup")
}

func TestReviewPRDAGReportsInvalidDependenciesAndMissingScope(t *testing.T) {
	notes := reviewPRDAG([]*domain.SpecForgePRNode{
		{
			NodeKey:            "PR-001",
			Title:              "Foundation",
			Goal:               "Add the foundation.",
			ExpectedFiles:      []string{"api/internal/modules/planning/*"},
			AcceptanceCriteria: []string{"Foundation exists."},
			TestCommands:       []string{"go test ./..."},
			BranchName:         "specforge/foundation",
		},
		{
			NodeKey:    "PR-001",
			Title:      "API",
			Goal:       "Add the API.",
			DependsOn:  []string{"PR-404", "PR-001"},
			BranchName: "specforge/foundation",
		},
	})

	require.Contains(t, notes, "PR DAG review: duplicate node key PR-001 would make dependencies ambiguous.")
	require.Contains(t, notes, "PR DAG review: duplicate branch name specforge/foundation would collide during execution.")
	require.Contains(t, notes, "PR DAG review: PR-001 has no expected file scope.")
	require.Contains(t, notes, "PR DAG review: PR-001 has no acceptance criteria.")
	require.Contains(t, notes, "PR DAG review: PR-001 has no test commands.")
	require.Contains(t, notes, "PR DAG review: PR-001 depends on unknown node PR-404.")
	require.Contains(t, notes, "PR DAG review: PR-001 depends on itself.")
}

func TestReviewPRDAGReportsCyclesAndOutOfOrderDependencies(t *testing.T) {
	notes := reviewPRDAG([]*domain.SpecForgePRNode{
		{
			NodeKey:            "PR-001",
			Order:              1,
			Title:              "Foundation",
			Goal:               "Add the foundation.",
			DependsOn:          []string{"PR-002"},
			ExpectedFiles:      []string{"api/internal/modules/planning/*"},
			AcceptanceCriteria: []string{"Foundation exists."},
			TestCommands:       []string{"go test ./..."},
			BranchName:         "specforge/foundation",
		},
		{
			NodeKey:            "PR-002",
			Order:              2,
			Title:              "API",
			Goal:               "Add the API.",
			DependsOn:          []string{"PR-001"},
			ExpectedFiles:      []string{"api/internal/modules/planning/handler.go"},
			AcceptanceCriteria: []string{"API exists."},
			TestCommands:       []string{"go test ./..."},
			BranchName:         "specforge/api",
		},
	})

	require.Contains(t, notes, "PR DAG review: PR-001 depends on PR-002, but that dependency is not ordered before it.")
	require.Contains(t, notes, "PR DAG review: dependency cycle detected involving PR-001.")
}

func boolPtr(value bool) *bool {
	return &value
}

func seedProjectPlanningInputs(t *testing.T, repo *memoryProjectRepo, projectID uint, workspaceID, primaryRepositoryID string) {
	t.Helper()
	require.NoError(t, repo.CreateProjectContextSnapshot(context.Background(), &domain.SpecForgeProjectContextSnapshot{
		WorkspaceID:         workspaceID,
		ProjectID:           projectID,
		SnapshotStatus:      domain.ProjectReadinessStatusReady,
		Summary:             "Pinned planning snapshot is ready.",
		PrimaryRepositoryID: primaryRepositoryID,
		CreatedBy:           42,
	}))
	require.NoError(t, repo.CreateProjectExpertPolicy(context.Background(), &domain.SpecForgeProjectExpertPolicy{
		WorkspaceID:  workspaceID,
		ProjectID:    projectID,
		Version:      1,
		Active:       true,
		GoalBoundary: "Keep the generated plan inside the active product request.",
		AllowedPaths: []string{"api/internal/modules", "web/src/features"},
		ReviewPolicy: domain.SpecForgeProjectExpertReviewPolicy{
			RequiredApprovals:       1,
			BlockOnChangesRequested: true,
			RequireCIGreen:          true,
		},
		MergePolicy: domain.SpecForgeProjectExpertMergePolicy{
			Strategy:              domain.ProjectMergeStrategySquash,
			RequireManualApproval: true,
		},
		CreatedBy: 42,
	}))
}

type memoryRepo struct {
	nextID        uint
	bundle        *domain.SpecForgePlanBundle
	bundles       []*domain.SpecForgePlanBundle
	prompt        *domain.SpecForgeCompiledPrompt
	skills        []*domain.SpecForgeSkill
	projectSkills []*domain.SpecForgeProjectSkill
	skillRuns     []*domain.SpecForgeSkillRun
}

type memoryProfileRepo struct {
	profile               *domain.SpecForgeRepoProfile
	profiles              map[string]*domain.SpecForgeRepoProfile
	architectureSnapshots map[string][]*domain.SpecForgeRepoArchitectureSnapshot
}

func (r *memoryProfileRepo) UpsertProfile(ctx context.Context, profile *domain.SpecForgeRepoProfile) error {
	copied := *profile
	if r.profiles == nil {
		r.profiles = map[string]*domain.SpecForgeRepoProfile{}
	}
	r.profiles[profile.RepositoryID] = &copied
	if r.profile == nil {
		r.profile = &copied
	}
	return nil
}

func (r *memoryProfileRepo) FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	if r.profiles != nil {
		if profile, ok := r.profiles[repositoryID]; ok {
			copied := *profile
			return &copied, nil
		}
	}
	if r.profile == nil || r.profile.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.profile
	return &copied, nil
}

func (r *memoryProfileRepo) CreateArchitectureSnapshot(ctx context.Context, snapshot *domain.SpecForgeRepoArchitectureSnapshot) error {
	copied := *snapshot
	if copied.CreatedAt.IsZero() {
		copied.CreatedAt = time.Now().UTC()
	}
	if r.architectureSnapshots == nil {
		r.architectureSnapshots = map[string][]*domain.SpecForgeRepoArchitectureSnapshot{}
	}
	r.architectureSnapshots[snapshot.RepositoryID] = append(r.architectureSnapshots[snapshot.RepositoryID], &copied)
	return nil
}

func (r *memoryProfileRepo) FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error) {
	snapshots := r.architectureSnapshots[repositoryID]
	if len(snapshots) == 0 {
		return nil, domain.ErrNotFound
	}
	latest := snapshots[len(snapshots)-1]
	copied := *latest
	return &copied, nil
}

func (r *memoryRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	if bundle.Requirement != nil && bundle.Requirement.ID == 0 {
		r.nextID++
		bundle.Requirement.ID = r.nextID
	}
	if bundle.Requirement != nil {
		bundle.Idea.RequirementID = &bundle.Requirement.ID
		bundle.Idea.ProjectID = &bundle.Requirement.ProjectID
		bundle.Plan.RequirementID = &bundle.Requirement.ID
	}
	r.nextID++
	bundle.Idea.ID = r.nextID
	r.nextID++
	bundle.ProductSpec.ID = r.nextID
	bundle.ProductSpec.IdeaID = bundle.Idea.ID
	r.nextID++
	bundle.Plan.ID = r.nextID
	bundle.Plan.IdeaID = bundle.Idea.ID
	bundle.Plan.ProductSpecID = bundle.ProductSpec.ID
	for _, node := range bundle.PRNodes {
		r.nextID++
		node.ID = r.nextID
		node.PlanID = bundle.Plan.ID
	}
	copied := cloneBundle(bundle)
	r.bundle = copied
	r.bundles = append(r.bundles, copied)
	return nil
}

func (r *memoryRepo) CreateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	r.nextID++
	requirement.ID = r.nextID
	return nil
}

func (r *memoryRepo) FindRequirementByID(ctx context.Context, requirementID uint) (*domain.SpecForgeRequirement, error) {
	for _, bundle := range r.bundles {
		if bundle.Requirement != nil && bundle.Requirement.ID == requirementID {
			copied := *bundle.Requirement
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) UpdateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	if r.bundle == nil || requirement == nil {
		return domain.ErrNotFound
	}
	copied := *requirement
	r.bundle.Requirement = &copied
	return nil
}

func (r *memoryRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	for _, bundle := range r.bundles {
		if bundle.Idea.ID == ideaID {
			return cloneBundle(bundle), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) FindLatestPlanBundleByRequirementID(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error) {
	var latest *domain.SpecForgePlanBundle
	for _, bundle := range r.bundles {
		if bundle.Requirement == nil || bundle.Requirement.ID != requirementID {
			continue
		}
		if latest == nil || bundle.Plan.Version > latest.Plan.Version {
			latest = bundle
		}
	}
	if latest == nil {
		return nil, domain.ErrNotFound
	}
	return cloneBundle(latest), nil
}

func (r *memoryRepo) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	for _, bundle := range r.bundles {
		if bundle.Plan.ID == planID {
			return cloneBundle(bundle), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) NextPlanVersionByRequirementID(ctx context.Context, requirementID uint) (int, error) {
	next := 1
	for _, bundle := range r.bundles {
		if bundle.Plan != nil && bundle.Plan.RequirementID != nil && *bundle.Plan.RequirementID == requirementID && bundle.Plan.Version >= next {
			next = bundle.Plan.Version + 1
		}
	}
	return next, nil
}

func (r *memoryRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	for _, bundle := range r.bundles {
		if bundle.Plan.ID == plan.ID {
			copied := *plan
			bundle.Plan = &copied
			if r.bundle != nil && r.bundle.Plan.ID == plan.ID {
				r.bundle.Plan = &copied
			}
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryRepo) bundleByPRNodeID(prNodeID uint) *domain.SpecForgePlanBundle {
	for _, bundle := range r.bundles {
		for _, node := range bundle.PRNodes {
			if node.ID == prNodeID {
				return bundle
			}
		}
	}
	return r.bundle
}

func (r *memoryRepo) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	bundle := r.bundleByPRNodeID(prNodeID)
	if bundle == nil {
		return nil, domain.ErrNotFound
	}
	for _, node := range bundle.PRNodes {
		if node.ID == prNodeID {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	for _, bundle := range r.bundles {
		for _, node := range bundle.PRNodes {
			if node.BranchName == branchName {
				copied := *node
				return &copied, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*domain.SpecForgePRNode, error) {
	for _, bundle := range r.bundles {
		for _, node := range bundle.PRNodes {
			if node.GitHubPRNumber != nil && *node.GitHubPRNumber == prNumber {
				copied := *node
				return &copied, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	for _, bundle := range r.bundles {
		for i, existing := range bundle.PRNodes {
			if existing.ID == node.ID {
				copied := *node
				bundle.PRNodes[i] = &copied
				return nil
			}
		}
	}
	return domain.ErrNotFound
}

func (r *memoryRepo) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	r.nextID++
	prompt.ID = r.nextID
	copied := *prompt
	r.prompt = &copied
	return nil
}

func (r *memoryRepo) FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeCompiledPrompt, error) {
	if r.prompt == nil || r.prompt.PRNodeID != prNodeID {
		return nil, domain.ErrNotFound
	}
	copied := *r.prompt
	return &copied, nil
}

func (r *memoryRepo) FindLatestCompiledPromptByPRNodeIDAndType(ctx context.Context, prNodeID uint, promptType string) (*domain.SpecForgeCompiledPrompt, error) {
	if r.prompt == nil || r.prompt.PRNodeID != prNodeID || r.prompt.Type != promptType {
		return nil, domain.ErrNotFound
	}
	copied := *r.prompt
	return &copied, nil
}

func (r *memoryRepo) UpsertSkill(ctx context.Context, skill *domain.SpecForgeSkill) error {
	r.nextID++
	copied := *skill
	for i, existing := range r.skills {
		if existing.RepositoryID == skill.RepositoryID && existing.Name == skill.Name {
			copied.ID = existing.ID
			r.skills[i] = &copied
			return nil
		}
	}
	copied.ID = r.nextID
	skill.ID = copied.ID
	r.skills = append(r.skills, &copied)
	return nil
}

func (r *memoryRepo) ListActiveSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	all, err := r.ListSkillsByRepositoryID(ctx, repositoryID)
	if err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeSkill, 0, len(all))
	for _, skill := range all {
		if skill.Active {
			out = append(out, skill)
		}
	}
	return out, nil
}

func (r *memoryRepo) ListSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	out := make([]*domain.SpecForgeSkill, 0, len(r.skills))
	for _, skill := range r.skills {
		if skill.RepositoryID != repositoryID {
			continue
		}
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryRepo) UpsertProjectSkill(ctx context.Context, projectSkill *domain.SpecForgeProjectSkill) error {
	r.nextID++
	copied := *projectSkill
	for i, existing := range r.projectSkills {
		if existing.ProjectID == projectSkill.ProjectID && existing.SkillID == projectSkill.SkillID {
			copied.ID = existing.ID
			copied.Skill = r.skillByID(projectSkill.SkillID)
			r.projectSkills[i] = &copied
			*projectSkill = copied
			return nil
		}
	}
	copied.ID = r.nextID
	copied.Skill = r.skillByID(projectSkill.SkillID)
	r.projectSkills = append(r.projectSkills, &copied)
	*projectSkill = copied
	return nil
}

func (r *memoryRepo) ListProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	out := make([]*domain.SpecForgeProjectSkill, 0, len(r.projectSkills))
	for _, projectSkill := range r.projectSkills {
		if projectSkill.ProjectID != projectID {
			continue
		}
		copied := *projectSkill
		copied.Skill = r.skillByID(projectSkill.SkillID)
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryRepo) ListActiveProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	all, err := r.ListProjectSkillsByProjectID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeProjectSkill, 0, len(all))
	for _, projectSkill := range all {
		if projectSkill.Active {
			out = append(out, projectSkill)
		}
	}
	return out, nil
}

func (r *memoryRepo) CreateSkillRun(ctx context.Context, run *domain.SpecForgeSkillRun) error {
	r.nextID++
	run.ID = r.nextID
	copied := *run
	r.skillRuns = append(r.skillRuns, &copied)
	return nil
}

func (r *memoryRepo) ListSkillRunsByRequirementID(ctx context.Context, requirementID uint) ([]*domain.SpecForgeSkillRun, error) {
	out := make([]*domain.SpecForgeSkillRun, 0, len(r.skillRuns))
	for _, run := range r.skillRuns {
		if run.RequirementID == nil || *run.RequirementID != requirementID {
			continue
		}
		copied := *run
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryRepo) ListSkillRunsByPlanID(ctx context.Context, planID uint) ([]*domain.SpecForgeSkillRun, error) {
	out := make([]*domain.SpecForgeSkillRun, 0, len(r.skillRuns))
	for _, run := range r.skillRuns {
		if run.PlanID == nil || *run.PlanID != planID {
			continue
		}
		copied := *run
		out = append(out, &copied)
	}
	return out, nil
}

func (r *memoryRepo) skillByID(skillID uint) *domain.SpecForgeSkill {
	for _, skill := range r.skills {
		if skill.ID == skillID {
			copied := *skill
			return &copied
		}
	}
	return nil
}

type memoryProjectRepo struct {
	project      *domain.SpecForgeProject
	repositories []*domain.SpecForgeProjectRepository
	snapshots    map[uint][]*domain.SpecForgeProjectContextSnapshot
	policies     map[uint][]*domain.SpecForgeProjectExpertPolicy
}

func (r *memoryProjectRepo) CreateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	copied := *project
	r.project = &copied
	return nil
}

func (r *memoryProjectRepo) UpdateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	if r.project == nil || r.project.ID != project.ID {
		return domain.ErrNotFound
	}
	copied := *project
	r.project = &copied
	return nil
}

func (r *memoryProjectRepo) DeleteProject(ctx context.Context, projectID uint) error {
	if r.project == nil || r.project.ID != projectID {
		return domain.ErrNotFound
	}
	r.project = nil
	r.repositories = nil
	return nil
}

func (r *memoryProjectRepo) FindProjectByID(ctx context.Context, id uint) (*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.ID != id {
		return nil, domain.ErrNotFound
	}
	copied := *r.project
	return &copied, nil
}

func (r *memoryProjectRepo) FindProjectByWorkspaceAndSlug(ctx context.Context, workspaceID, slug string) (*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.WorkspaceID != workspaceID || r.project.Slug != slug {
		return nil, domain.ErrNotFound
	}
	copied := *r.project
	return &copied, nil
}

func (r *memoryProjectRepo) ListProjectsByWorkspace(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	if r.project == nil || r.project.WorkspaceID != workspaceID {
		return []*domain.SpecForgeProject{}, nil
	}
	copied := *r.project
	return []*domain.SpecForgeProject{&copied}, nil
}

func (r *memoryProjectRepo) CreateProjectRepository(ctx context.Context, binding *domain.SpecForgeProjectRepository) error {
	copied := *binding
	r.repositories = append(r.repositories, &copied)
	return nil
}

func (r *memoryProjectRepo) DeleteProjectRepository(ctx context.Context, projectID uint, repositoryID string) error {
	for i, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.RepositoryID == repositoryID {
			r.repositories = append(r.repositories[:i], r.repositories[i+1:]...)
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryProjectRepo) FindProjectRepository(ctx context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.RepositoryID == repositoryID {
			copied := *binding
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryProjectRepo) ListProjectRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
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

func (r *memoryProjectRepo) CountActiveProjectRepositories(ctx context.Context, projectID uint) (int64, error) {
	var count int64
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.Active {
			count++
		}
	}
	return count, nil
}

func (r *memoryProjectRepo) FindActivePrimaryProjectRepository(ctx context.Context, projectID uint) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range r.repositories {
		if binding.ProjectID == projectID && binding.Active && binding.Role == domain.ProjectRepositoryRolePrimary {
			copied := *binding
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryProjectRepo) CreateProjectContextSnapshot(ctx context.Context, snapshot *domain.SpecForgeProjectContextSnapshot) error {
	if snapshot == nil {
		return domain.ErrInvalidInput
	}
	copied := *snapshot
	if copied.ID == 0 {
		copied.ID = uint(len(r.snapshots[copied.ProjectID]) + 1)
	}
	if r.snapshots == nil {
		r.snapshots = map[uint][]*domain.SpecForgeProjectContextSnapshot{}
	}
	r.snapshots[copied.ProjectID] = append(r.snapshots[copied.ProjectID], &copied)
	*snapshot = copied
	return nil
}

func (r *memoryProjectRepo) FindProjectContextSnapshotByID(ctx context.Context, id uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	for _, snapshots := range r.snapshots {
		for _, snapshot := range snapshots {
			if snapshot.ID == id {
				copied := *snapshot
				return &copied, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryProjectRepo) FindLatestProjectContextSnapshot(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	snapshots := r.snapshots[projectID]
	if len(snapshots) == 0 {
		return nil, domain.ErrNotFound
	}
	copied := *snapshots[len(snapshots)-1]
	return &copied, nil
}

func (r *memoryProjectRepo) CreateProjectExpertPolicy(ctx context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	if policy == nil {
		return domain.ErrInvalidInput
	}
	copied := *policy
	if copied.ID == 0 {
		copied.ID = uint(len(r.policies[copied.ProjectID]) + 1)
	}
	if r.policies == nil {
		r.policies = map[uint][]*domain.SpecForgeProjectExpertPolicy{}
	}
	r.policies[copied.ProjectID] = append(r.policies[copied.ProjectID], &copied)
	*policy = copied
	return nil
}

func (r *memoryProjectRepo) UpdateProjectExpertPolicy(ctx context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	if policy == nil {
		return domain.ErrInvalidInput
	}
	return nil
}

func (r *memoryProjectRepo) FindProjectExpertPolicyByID(ctx context.Context, id uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	for _, policies := range r.policies {
		for _, policy := range policies {
			if policy.ID == id {
				copied := *policy
				return &copied, nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryProjectRepo) FindActiveProjectExpertPolicyByProjectID(ctx context.Context, projectID uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	policies := r.policies[projectID]
	for index := len(policies) - 1; index >= 0; index-- {
		if policies[index].Active {
			copied := *policies[index]
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryProjectRepo) ListProjectExpertPoliciesByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectExpertPolicy, error) {
	policies := r.policies[projectID]
	out := make([]*domain.SpecForgeProjectExpertPolicy, 0, len(policies))
	for _, policy := range policies {
		copied := *policy
		out = append(out, &copied)
	}
	return out, nil
}

func cloneBundle(bundle *domain.SpecForgePlanBundle) *domain.SpecForgePlanBundle {
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
	if bundle.ContextSnapshot != nil {
		snapshot := *bundle.ContextSnapshot
		out.ContextSnapshot = &snapshot
	}
	if bundle.ExpertPolicy != nil {
		policy := *bundle.ExpertPolicy
		out.ExpertPolicy = &policy
	}
	if bundle.ProjectContext != nil {
		context := *bundle.ProjectContext
		out.ProjectContext = &context
	}
	out.PRNodes = make([]*domain.SpecForgePRNode, len(bundle.PRNodes))
	for i, node := range bundle.PRNodes {
		copied := *node
		out.PRNodes[i] = &copied
	}
	return &out
}
