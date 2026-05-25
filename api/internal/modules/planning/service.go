package planning

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateIdea(ctx context.Context, userID uint, repoID string, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error)
	GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error)
	ApprovePlan(ctx context.Context, userID, planID uint, req *ApprovePlanRequest) (*domain.SpecForgePlanBundle, error)
}

type service struct {
	repo domain.SpecForgePlanningRepository
}

func NewService(repo domain.SpecForgePlanningRepository) *service {
	return &service{repo: repo}
}

func (s *service) CreateIdea(ctx context.Context, userID uint, repoID string, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error) {
	if userID == 0 || req == nil || strings.TrimSpace(repoID) == "" || strings.TrimSpace(req.Input) == "" {
		return nil, domain.ErrInvalidInput
	}

	ideaType := strings.TrimSpace(req.Type)
	if ideaType == "" {
		ideaType = "feature"
	}

	bundle := compileInitialPlan(userID, repoID, strings.TrimSpace(req.Input), ideaType)
	if err := s.repo.CreatePlanBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create plan bundle: %w", err)
	}
	return bundle, nil
}

func (s *service) GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	if ideaID == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindPlanBundleByIdeaID(ctx, ideaID)
}

func (s *service) ApprovePlan(ctx context.Context, userID, planID uint, req *ApprovePlanRequest) (*domain.SpecForgePlanBundle, error) {
	if userID == 0 || planID == 0 || req == nil || !req.Approved {
		return nil, domain.ErrInvalidInput
	}

	bundle, err := s.repo.FindPlanBundleByPlanID(ctx, planID)
	if err != nil {
		return nil, err
	}
	if bundle.Plan.Status == domain.PlanStatusApproved {
		return nil, domain.ErrConflict
	}

	now := time.Now()
	bundle.Plan.Status = domain.PlanStatusApproved
	bundle.Plan.ApprovedBy = &userID
	bundle.Plan.ApprovedAt = &now
	bundle.Plan.DecisionOverrides = decisionOverridesToStrings(req.DecisionOverrides)
	if err := s.repo.UpdatePlan(ctx, bundle.Plan); err != nil {
		return nil, fmt.Errorf("approve plan: %w", err)
	}
	return s.repo.FindPlanBundleByPlanID(ctx, planID)
}

func compileInitialPlan(userID uint, repoID, input, ideaType string) *domain.SpecForgePlanBundle {
	slug := slugify(input)
	if slug == "" {
		slug = "feature"
	}

	idea := &domain.SpecForgeIdea{
		RepositoryID: repoID,
		CreatedBy:    userID,
		RawInput:     input,
		Type:         ideaType,
		Status:       domain.IdeaStatusAwaitingApproval,
	}
	spec := &domain.SpecForgeProductSpec{
		Goals: []string{
			"Turn the submitted product idea into a reviewable implementation plan.",
			"Preserve one approval checkpoint before any autonomous execution starts.",
		},
		UserStories: []string{
			"As a technical lead, I can review the product understanding before code is written.",
			"As a technical lead, I can review the proposed PR DAG and risks before execution.",
		},
		BusinessRules: []string{
			"Plan approval is required before execution.",
			"Each PR node must have scope, non-goals, acceptance criteria, and test commands.",
			"Single-run MVP plans must stay within one repository and at most five PR nodes.",
		},
		PermissionRules: []string{
			"Only authenticated workspace users can create ideas.",
			"Only authenticated workspace users can approve generated plans in this MVP slice.",
		},
		EdgeCases: []string{
			"Overlarge ideas should be split before execution.",
			"Plans with unclear dependencies should remain in review instead of executing.",
		},
		NonGoals: []string{
			"No code execution is performed by this planning slice.",
			"No GitHub branches or pull requests are created by this planning slice.",
		},
		AcceptanceCriteria: []string{
			"Creating an idea returns product plan, technical plan, and PR DAG nodes.",
			"The plan can be fetched by idea ID.",
			"The plan can be approved once and records the approver and approval time.",
		},
		Assumptions: []string{
			"Repo context indexing will be attached in a later slice.",
			"Executor-specific prompts will be compiled from PR nodes in a later slice.",
		},
	}
	plan := &domain.SpecForgeImplementationPlan{
		TechnicalSummary: "Establish the SpecForge planning aggregate: idea intake, generated product spec, technical plan, PR DAG, and approval state.",
		AffectedAreas: []string{
			"api/internal/modules/planning",
			"api/internal/domain",
			"api/database/migrations",
		},
		DataModelChanges: []string{
			"Add persisted ideas, product specs, implementation plans, and PR nodes.",
		},
		APIChanges: []string{
			"POST /v1/repositories/:repo_id/ideas",
			"GET /v1/ideas/:id/plan",
			"POST /v1/plans/:id/approve",
		},
		UIChanges: []string{
			"No UI changes in this backend foundation slice.",
		},
		TestStrategy: []string{
			"go test ./internal/modules/planning/...",
			"go test ./...",
		},
		SecurityRisks: []string{
			"Prompt inputs are user-provided text and must be treated as untrusted.",
			"Future repo indexing must filter secrets before prompt compilation.",
		},
		MigrationRisks: []string{
			"New tables only; no existing table mutation.",
		},
		Status: domain.PlanStatusDraft,
	}

	return &domain.SpecForgePlanBundle{
		Idea:        idea,
		ProductSpec: spec,
		Plan:        plan,
		PRNodes: []*domain.SpecForgePRNode{
			prNode(slug, "PR-001", 1, "foundation", "Add SpecForge planning data model", "Create the persisted planning aggregate and migration.", nil, []string{"api/internal/modules/planning/*", "api/database/migrations/*"}),
			prNode(slug, "PR-002", 2, "api", "Add idea and plan review APIs", "Expose idea creation, plan retrieval, and plan approval endpoints.", []string{"PR-001"}, []string{"api/internal/modules/planning/handler.go", "api/internal/modules/planning/routes.go"}),
			prNode(slug, "PR-003", 3, "verification", "Add planning service tests", "Cover idea creation, plan retrieval, and single approval behavior.", []string{"PR-001", "PR-002"}, []string{"api/internal/modules/planning/service_test.go"}),
		},
	}
}

func prNode(slug, key string, order int, nodeType, title, goal string, dependsOn, expectedFiles []string) *domain.SpecForgePRNode {
	return &domain.SpecForgePRNode{
		NodeKey:            key,
		Order:              order,
		Title:              title,
		Type:               nodeType,
		Goal:               goal,
		DependsOn:          dependsOn,
		EstimatedRisk:      "medium",
		ExpectedFiles:      expectedFiles,
		NonGoals:           []string{"Do not execute coding agents in this PR.", "Do not create GitHub pull requests in this PR."},
		AcceptanceCriteria: []string{"The slice is independently reviewable.", "The relevant Go tests pass.", "The implementation stays within declared scope."},
		TestCommands:       []string{"go test ./internal/modules/planning/...", "go test ./..."},
		BranchName:         fmt.Sprintf("specforge/%s-%02d-%s", slug, order, nodeType),
		Status:             domain.PRNodeStatusPlanned,
	}
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if len(value) > 36 {
		value = strings.Trim(value[:36], "-")
	}
	return value
}
