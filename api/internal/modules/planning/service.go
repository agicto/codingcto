package planning

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateIdea(ctx context.Context, userID uint, repoID string, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error)
	GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error)
	ApprovePlan(ctx context.Context, userID, planID uint, req *ApprovePlanRequest) (*domain.SpecForgePlanBundle, error)
	UpsertSkill(ctx context.Context, userID uint, repoID string, req *UpsertSkillRequest) (*domain.SpecForgeSkill, error)
	ListSkills(ctx context.Context, repoID string) ([]*domain.SpecForgeSkill, error)
	CompilePrompt(ctx context.Context, userID, prNodeID uint, req *CompilePromptRequest) (*domain.SpecForgeCompiledPrompt, error)
}

type service struct {
	repo        domain.SpecForgePlanningRepository
	profileRepo domain.SpecForgeRepoProfileRepository
	skillRepo   domain.SpecForgeSkillRepository
}

func NewService(repo domain.SpecForgePlanningRepository, profileRepo domain.SpecForgeRepoProfileRepository, skillRepo domain.SpecForgeSkillRepository) *service {
	return &service{repo: repo, profileRepo: profileRepo, skillRepo: skillRepo}
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

func (s *service) UpsertSkill(ctx context.Context, userID uint, repoID string, req *UpsertSkillRequest) (*domain.SpecForgeSkill, error) {
	if userID == 0 || req == nil || strings.TrimSpace(repoID) == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Content) == "" || s.skillRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	skill := &domain.SpecForgeSkill{
		RepositoryID: strings.TrimSpace(repoID),
		Name:         strings.TrimSpace(sanitizeSkillText(req.Name)),
		Description:  strings.TrimSpace(sanitizeSkillText(req.Description)),
		Content:      strings.TrimSpace(sanitizeSkillText(req.Content)),
		Active:       active,
		CreatedBy:    userID,
	}
	if skill.Name == "" || skill.Content == "" {
		return nil, domain.ErrInvalidInput
	}
	if err := s.skillRepo.UpsertSkill(ctx, skill); err != nil {
		return nil, fmt.Errorf("upsert repo skill: %w", err)
	}
	return skill, nil
}

func (s *service) ListSkills(ctx context.Context, repoID string) ([]*domain.SpecForgeSkill, error) {
	if strings.TrimSpace(repoID) == "" || s.skillRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	return s.skillRepo.ListSkillsByRepositoryID(ctx, strings.TrimSpace(repoID))
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
	skills, err := s.activeSkillsFor(ctx, bundle)
	if err != nil {
		return nil, err
	}

	text := compilePromptText(promptType, bundle, node, skills)
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

func (s *service) activeSkillsFor(ctx context.Context, bundle *domain.SpecForgePlanBundle) ([]*domain.SpecForgeSkill, error) {
	if s.skillRepo == nil || bundle == nil || bundle.Idea == nil || strings.TrimSpace(bundle.Idea.RepositoryID) == "" {
		return []*domain.SpecForgeSkill{}, nil
	}
	skills, err := s.skillRepo.ListActiveSkillsByRepositoryID(ctx, bundle.Idea.RepositoryID)
	if err != nil {
		return nil, fmt.Errorf("load active repo skills: %w", err)
	}
	return skills, nil
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

func compilePromptText(promptType string, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) string {
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
	writeSkills(&b, skills)
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

func writeSkills(b *strings.Builder, skills []*domain.SpecForgeSkill) {
	b.WriteString("Repository skills:\n")
	if len(skills) == 0 {
		b.WriteString("- None\n\n")
		return
	}
	for _, skill := range skills {
		if skill == nil || strings.TrimSpace(skill.Name) == "" || strings.TrimSpace(skill.Content) == "" {
			continue
		}
		b.WriteString("## " + strings.TrimSpace(skill.Name) + "\n")
		if strings.TrimSpace(skill.Description) != "" {
			b.WriteString(strings.TrimSpace(skill.Description) + "\n")
		}
		b.WriteString(strings.TrimSpace(skill.Content) + "\n\n")
	}
}

func writeRepoProfile(b *strings.Builder, profile *domain.SpecForgeRepoProfile) {
	b.WriteString("Repository context:\n")
	if profile == nil {
		b.WriteString("- No repo profile is available yet. Follow local code patterns discovered during implementation.\n\n")
		return
	}
	b.WriteString("- Default branch: " + profile.DefaultBranch + "\n")
	b.WriteString("- CI provider: " + profile.CIProvider + "\n")
	if strings.TrimSpace(profile.Source) != "" {
		b.WriteString("- Profile source: " + strings.TrimSpace(profile.Source) + "\n")
	}
	if !profile.LastIndexedAt.IsZero() {
		b.WriteString("- Last indexed at: " + profile.LastIndexedAt.Format(time.RFC3339) + "\n")
	}
	if strings.TrimSpace(profile.Summary) != "" {
		b.WriteString("- Summary: " + strings.TrimSpace(profile.Summary) + "\n")
	}
	writeList(b, "Stack", profile.Stack)
	writeList(b, "Repository test commands", profile.TestCommands)
	writeList(b, "App structure", profile.AppStructure)
	writeList(b, "Coding conventions", profile.CodingConventions)
	writeList(b, "Risk areas", profile.RiskAreas)
	writeList(b, "Repo profile warnings", profile.Warnings)
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

func sanitizeSkillText(value string) string {
	return strings.ToValidUTF8(strings.ReplaceAll(value, "\x00", ""), "")
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

	bundle := &domain.SpecForgePlanBundle{
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
	bundle.ProductSpec.Assumptions = append(bundle.ProductSpec.Assumptions, reviewPRDAG(bundle.PRNodes)...)
	return bundle
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

func reviewPRDAG(nodes []*domain.SpecForgePRNode) []string {
	const maxMVPPRNodes = 5

	notes := make([]string, 0)
	if len(nodes) == 0 {
		return []string{"PR DAG review: no PR nodes were generated; the plan cannot execute until it is split into reviewable work."}
	}
	if len(nodes) > maxMVPPRNodes {
		notes = append(notes, fmt.Sprintf("PR DAG review: generated %d PR nodes, above the MVP limit of %d; split the idea into milestones before execution.", len(nodes), maxMVPPRNodes))
	}

	keys := make(map[string]int, len(nodes))
	nodesByKey := make(map[string]*domain.SpecForgePRNode, len(nodes))
	branches := make(map[string]int, len(nodes))
	for _, node := range nodes {
		if node == nil {
			notes = append(notes, "PR DAG review: a nil PR node was generated.")
			continue
		}
		key := strings.TrimSpace(node.NodeKey)
		if key == "" {
			notes = append(notes, "PR DAG review: a PR node is missing its stable node key.")
		} else {
			keys[key]++
			if keys[key] == 1 {
				nodesByKey[key] = node
			}
			if keys[key] > 1 {
				notes = append(notes, "PR DAG review: duplicate node key "+key+" would make dependencies ambiguous.")
			}
		}
		branch := strings.TrimSpace(node.BranchName)
		if branch == "" {
			notes = append(notes, "PR DAG review: "+nodeLabel(node)+" is missing a branch name.")
		} else {
			branches[branch]++
			if branches[branch] > 1 {
				notes = append(notes, "PR DAG review: duplicate branch name "+branch+" would collide during execution.")
			}
		}
	}

	for _, node := range nodes {
		if node == nil {
			continue
		}
		label := nodeLabel(node)
		if strings.TrimSpace(node.Title) == "" || strings.TrimSpace(node.Goal) == "" {
			notes = append(notes, "PR DAG review: "+label+" must have both title and goal before execution.")
		}
		if len(node.ExpectedFiles) == 0 {
			notes = append(notes, "PR DAG review: "+label+" has no expected file scope.")
		}
		if len(node.AcceptanceCriteria) == 0 {
			notes = append(notes, "PR DAG review: "+label+" has no acceptance criteria.")
		}
		if len(node.TestCommands) == 0 {
			notes = append(notes, "PR DAG review: "+label+" has no test commands.")
		}
		for _, dependency := range node.DependsOn {
			dependency = strings.TrimSpace(dependency)
			if dependency == "" {
				notes = append(notes, "PR DAG review: "+label+" has an empty dependency entry.")
				continue
			}
			if dependency == node.NodeKey {
				notes = append(notes, "PR DAG review: "+label+" depends on itself.")
				continue
			}
			if keys[dependency] == 0 {
				notes = append(notes, "PR DAG review: "+label+" depends on unknown node "+dependency+".")
				continue
			}
			if dependencyNode := nodesByKey[dependency]; dependencyNode != nil && dependencyNode.Order >= node.Order {
				notes = append(notes, "PR DAG review: "+label+" depends on "+dependency+", but that dependency is not ordered before it.")
			}
		}
	}
	if cycleKey := firstPRDAGCycle(nodesByKey); cycleKey != "" {
		notes = append(notes, "PR DAG review: dependency cycle detected involving "+cycleKey+".")
	}

	if len(notes) == 0 {
		return []string{fmt.Sprintf("PR DAG review: validation passed for %d reviewable PR nodes; dependencies resolve within the generated plan.", len(nodes))}
	}
	return notes
}

func nodeLabel(node *domain.SpecForgePRNode) string {
	if node == nil {
		return "unknown node"
	}
	if strings.TrimSpace(node.NodeKey) != "" {
		return strings.TrimSpace(node.NodeKey)
	}
	if strings.TrimSpace(node.Title) != "" {
		return strings.TrimSpace(node.Title)
	}
	return "unnamed node"
}

func firstPRDAGCycle(nodesByKey map[string]*domain.SpecForgePRNode) string {
	const (
		visiting = 1
		visited  = 2
	)
	states := make(map[string]int, len(nodesByKey))
	var visit func(string) string
	visit = func(key string) string {
		switch states[key] {
		case visiting:
			return key
		case visited:
			return ""
		}
		node := nodesByKey[key]
		if node == nil {
			return ""
		}
		states[key] = visiting
		for _, dependency := range node.DependsOn {
			dependency = strings.TrimSpace(dependency)
			if dependency == "" || nodesByKey[dependency] == nil {
				continue
			}
			if cycleKey := visit(dependency); cycleKey != "" {
				return cycleKey
			}
		}
		states[key] = visited
		return ""
	}

	keys := make([]string, 0, len(nodesByKey))
	for key := range nodesByKey {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		if cycleKey := visit(key); cycleKey != "" {
			return cycleKey
		}
	}
	return ""
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
