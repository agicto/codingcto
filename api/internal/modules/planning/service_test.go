package planning

import (
	"context"
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
	svc := NewService(repo, profileRepo, repo)

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
	svc := NewService(repo, profileRepo, repo)

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

func TestApprovePlanRecordsApproverAndRejectsSecondApproval(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo)

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
	svc := NewService(repo, profileRepo, repo)

	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)

	prompt, err := svc.CompilePrompt(context.Background(), 42, created.PRNodes[1].ID, &CompilePromptRequest{})
	require.NoError(t, err)
	require.Equal(t, created.PRNodes[1].ID, prompt.PRNodeID)
	require.Equal(t, created.Plan.ID, prompt.PlanID)
	require.Equal(t, "implementation", prompt.Type)
	require.Equal(t, "prompt_v1", prompt.Version)
	require.Len(t, prompt.PromptHash, 64)
	require.Contains(t, prompt.PromptText, created.PRNodes[1].Title)
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
	svc := NewService(repo, &memoryProfileRepo{}, repo)
	active := true

	skill, err := svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:        "service-layer",
		Description: "API route guidance",
		Content:     "API handlers must delegate business logic to services.",
		Active:      &active,
	})

	require.NoError(t, err)
	require.Equal(t, "repo_123", skill.RepositoryID)
	require.Equal(t, uint(42), skill.CreatedBy)
	require.True(t, skill.Active)

	skills, err := svc.ListSkills(context.Background(), "repo_123")
	require.NoError(t, err)
	require.Len(t, skills, 1)
	require.Equal(t, "service-layer", skills[0].Name)
	require.Equal(t, "API handlers must delegate business logic to services.", skills[0].Content)
}

func TestCompilePromptInjectsActiveRepoSkills(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo)
	created, err := svc.CreateIdea(context.Background(), 42, "repo_123", &CreateIdeaRequest{
		Input: "Add team invite feature for workspace admins",
	})
	require.NoError(t, err)
	_, err = svc.UpsertSkill(context.Background(), 42, "repo_123", &UpsertSkillRequest{
		Name:    "go-layering",
		Content: "Use handlers only for HTTP binding and response mapping.",
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
	require.Contains(t, prompt.PromptText, "Repository skills")
	require.Contains(t, prompt.PromptText, "go-layering")
	require.Contains(t, prompt.PromptText, "Use handlers only for HTTP binding and response mapping.")
	require.NotContains(t, prompt.PromptText, "This should not appear.")
}

func TestCompilePromptInjectsFixModeInstructions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{}, repo)
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
	svc := NewService(repo, &memoryProfileRepo{}, repo)
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

type memoryRepo struct {
	nextID uint
	bundle *domain.SpecForgePlanBundle
	prompt *domain.SpecForgeCompiledPrompt
	skills []*domain.SpecForgeSkill
}

type memoryProfileRepo struct {
	profile *domain.SpecForgeRepoProfile
}

func (r *memoryProfileRepo) UpsertProfile(ctx context.Context, profile *domain.SpecForgeRepoProfile) error {
	copied := *profile
	r.profile = &copied
	return nil
}

func (r *memoryProfileRepo) FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	if r.profile == nil || r.profile.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.profile
	return &copied, nil
}

func (r *memoryRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
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
	r.bundle = cloneBundle(bundle)
	return nil
}

func (r *memoryRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Idea.ID != ideaID {
		return nil, domain.ErrNotFound
	}
	return cloneBundle(r.bundle), nil
}

func (r *memoryRepo) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil || r.bundle.Plan.ID != planID {
		return nil, domain.ErrNotFound
	}
	return cloneBundle(r.bundle), nil
}

func (r *memoryRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	r.bundle.Plan = plan
	return nil
}

func (r *memoryRepo) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	for _, node := range r.bundle.PRNodes {
		if node.ID == prNodeID {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	for _, node := range r.bundle.PRNodes {
		if node.BranchName == branchName {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*domain.SpecForgePRNode, error) {
	for _, node := range r.bundle.PRNodes {
		if node.GitHubPRNumber != nil && *node.GitHubPRNumber == prNumber {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	for i, existing := range r.bundle.PRNodes {
		if existing.ID == node.ID {
			copied := *node
			r.bundle.PRNodes[i] = &copied
			return nil
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

func cloneBundle(bundle *domain.SpecForgePlanBundle) *domain.SpecForgePlanBundle {
	out := *bundle
	idea := *bundle.Idea
	spec := *bundle.ProductSpec
	plan := *bundle.Plan
	out.Idea = &idea
	out.ProductSpec = &spec
	out.Plan = &plan
	out.PRNodes = make([]*domain.SpecForgePRNode, len(bundle.PRNodes))
	for i, node := range bundle.PRNodes {
		copied := *node
		out.PRNodes[i] = &copied
	}
	return &out
}
