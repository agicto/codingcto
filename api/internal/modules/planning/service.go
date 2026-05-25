package planning

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
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
	CompilePrompt(ctx context.Context, userID, prNodeID uint, req *CompilePromptRequest) (*domain.SpecForgeCompiledPrompt, error)
}

type service struct {
	repo        domain.SpecForgePlanningRepository
	profileRepo domain.SpecForgeRepoProfileRepository
}

func NewService(repo domain.SpecForgePlanningRepository, profileRepo domain.SpecForgeRepoProfileRepository) *service {
	return &service{repo: repo, profileRepo: profileRepo}
}

func (s *service) CreateIdea(ctx context.Context, userID uint, repoID string, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error) {
	if userID == 0 || req == nil || strings.TrimSpace(repoID) == "" || strings.TrimSpace(req.Input) == "" {
		return nil, domain.ErrInvalidInput
	}

	ideaType := strings.TrimSpace(req.Type)
	if ideaType == "" {
		ideaType = "feature"
	}

	profile, err := s.repoProfileFor(ctx, repoID)
	if err != nil {
		return nil, err
	}

	bundle := compileInitialPlan(userID, repoID, strings.TrimSpace(req.Input), ideaType, profile)
	if err := s.repo.CreatePlanBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create plan bundle: %w", err)
	}
	return bundle, nil
}

func (s *service) GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	if ideaID == 0 {
		return nil, domain.ErrInvalidInput
	}
	bundle, err := s.repo.FindPlanBundleByIdeaID(ctx, ideaID)
	if err != nil {
		return nil, err
	}
	return s.withRepoProfile(ctx, bundle)
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
	bundle, err = s.repo.FindPlanBundleByPlanID(ctx, planID)
	if err != nil {
		return nil, err
	}
	return s.withRepoProfile(ctx, bundle)
}

func (s *service) CompilePrompt(ctx context.Context, userID, prNodeID uint, req *CompilePromptRequest) (*domain.SpecForgeCompiledPrompt, error) {
	if userID == 0 || prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}

	promptType := "implementation"
	if req != nil && strings.TrimSpace(req.Type) != "" {
		promptType = strings.TrimSpace(req.Type)
	}

	node, err := s.repo.FindPRNodeByID(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	bundle, err := s.repo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return nil, err
	}
	bundle, err = s.withRepoProfile(ctx, bundle)
	if err != nil {
		return nil, err
	}

	text := compilePromptText(promptType, bundle, node)
	hash := sha256.Sum256([]byte(text))
	prompt := &domain.SpecForgeCompiledPrompt{
		PRNodeID:   node.ID,
		PlanID:     node.PlanID,
		Type:       promptType,
		Version:    "prompt_v1",
		PromptText: text,
		PromptHash: hex.EncodeToString(hash[:]),
		CreatedBy:  userID,
	}
	if err := s.repo.CreateCompiledPrompt(ctx, prompt); err != nil {
		return nil, fmt.Errorf("create compiled prompt: %w", err)
	}
	return prompt, nil
}

func (s *service) withRepoProfile(ctx context.Context, bundle *domain.SpecForgePlanBundle) (*domain.SpecForgePlanBundle, error) {
	if bundle == nil || bundle.Idea == nil {
		return bundle, nil
	}
	profile, err := s.repoProfileFor(ctx, bundle.Idea.RepositoryID)
	if err != nil {
		return nil, err
	}
	bundle.RepoProfile = profile
	return bundle, nil
}

func (s *service) repoProfileFor(ctx context.Context, repoID string) (*domain.SpecForgeRepoProfile, error) {
	if s.profileRepo == nil || strings.TrimSpace(repoID) == "" {
		return nil, nil
	}
	profile, err := s.profileRepo.FindProfileByRepositoryID(ctx, strings.TrimSpace(repoID))
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load repo profile: %w", err)
	}
	return profile, nil
}

func compilePromptText(promptType string, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode) string {
	var b strings.Builder
	b.WriteString("You are implementing a SpecForge PR node.\n\n")
	b.WriteString("Prompt type: " + promptType + "\n")
	b.WriteString("PR node: " + node.NodeKey + " - " + node.Title + "\n")
	b.WriteString("Goal:\n" + node.Goal + "\n\n")
	b.WriteString("Product context:\n")
	for _, goal := range bundle.ProductSpec.Goals {
		b.WriteString("- " + goal + "\n")
	}
	b.WriteString("\nTechnical plan:\n" + bundle.Plan.TechnicalSummary + "\n\n")
	writeRepoProfile(&b, bundle.RepoProfile)
	writeList(&b, "Expected files", node.ExpectedFiles)
	writeList(&b, "Dependencies", node.DependsOn)
	writeList(&b, "Non-goals", node.NonGoals)
	writeList(&b, "Acceptance criteria", node.AcceptanceCriteria)
	writeList(&b, "Test commands", node.TestCommands)
	b.WriteString("\nAfter implementation:\n")
	b.WriteString("- Keep the diff within this PR node scope.\n")
	b.WriteString("- Run the listed test commands.\n")
	b.WriteString("- Prepare a PR description with summary, scope, non-goals, tests, risks, and dependencies.\n")
	return b.String()
}

func writeRepoProfile(b *strings.Builder, profile *domain.SpecForgeRepoProfile) {
	b.WriteString("Repository context:\n")
	if profile == nil {
		b.WriteString("- No repo profile is available yet. Follow local code patterns discovered during implementation.\n\n")
		return
	}
	b.WriteString("- Default branch: " + profile.DefaultBranch + "\n")
	b.WriteString("- CI provider: " + profile.CIProvider + "\n")
	if strings.TrimSpace(profile.Summary) != "" {
		b.WriteString("- Summary: " + strings.TrimSpace(profile.Summary) + "\n")
	}
	writeList(b, "Stack", profile.Stack)
	writeList(b, "Repository test commands", profile.TestCommands)
	writeList(b, "App structure", profile.AppStructure)
	writeList(b, "Coding conventions", profile.CodingConventions)
	writeList(b, "Risk areas", profile.RiskAreas)
}

func writeList(b *strings.Builder, title string, values []string) {
	b.WriteString(title + ":\n")
	if len(values) == 0 {
		b.WriteString("- None\n\n")
		return
	}
	for _, value := range values {
		b.WriteString("- " + value + "\n")
	}
	b.WriteString("\n")
}

func compileInitialPlan(userID uint, repoID, input, ideaType string, profile *domain.SpecForgeRepoProfile) *domain.SpecForgePlanBundle {
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
			repoContextAssumption(profile),
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
		RepoProfile: profile,
		ProductSpec: spec,
		Plan:        plan,
		PRNodes: []*domain.SpecForgePRNode{
			prNode(slug, "PR-001", 1, "foundation", "Add SpecForge planning data model", "Create the persisted planning aggregate and migration.", nil, []string{"api/internal/modules/planning/*", "api/database/migrations/*"}, profile),
			prNode(slug, "PR-002", 2, "api", "Add idea and plan review APIs", "Expose idea creation, plan retrieval, and plan approval endpoints.", []string{"PR-001"}, []string{"api/internal/modules/planning/handler.go", "api/internal/modules/planning/routes.go"}, profile),
			prNode(slug, "PR-003", 3, "verification", "Add planning service tests", "Cover idea creation, plan retrieval, and single approval behavior.", []string{"PR-001", "PR-002"}, []string{"api/internal/modules/planning/service_test.go"}, profile),
		},
	}
}

func repoContextAssumption(profile *domain.SpecForgeRepoProfile) string {
	if profile == nil {
		return "No repo profile was available when this plan was generated; executor prompts must rediscover local stack and commands."
	}
	return "Plan generation used the current repo profile for stack, test command, convention, and risk context."
}

func prNode(slug, key string, order int, nodeType, title, goal string, dependsOn, expectedFiles []string, profile *domain.SpecForgeRepoProfile) *domain.SpecForgePRNode {
	testCommands := []string{"go test ./internal/modules/planning/...", "go test ./..."}
	if profile != nil && len(profile.TestCommands) > 0 {
		testCommands = append([]string(nil), profile.TestCommands...)
	}
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
		TestCommands:       testCommands,
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
