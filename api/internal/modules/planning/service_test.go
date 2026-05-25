package planning

import (
	"context"
	"testing"

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
	svc := NewService(repo, profileRepo)

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
	require.Empty(t, bundle.PRNodes[0].DependsOn)
	require.Contains(t, bundle.PRNodes[1].DependsOn, "PR-001")
}

func TestApprovePlanRecordsApproverAndRejectsSecondApproval(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, &memoryProfileRepo{})

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
	}}
	svc := NewService(repo, profileRepo)

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
	require.Contains(t, prompt.PromptText, "Use service layer for business logic")
	require.Contains(t, prompt.PromptText, "Acceptance criteria")
	require.NotNil(t, repo.prompt)
}

type memoryRepo struct {
	nextID uint
	bundle *domain.SpecForgePlanBundle
	prompt *domain.SpecForgeCompiledPrompt
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
