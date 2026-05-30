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
	if !domain.ExecutableSpecForgePRDAG(bundle.PRNodes) {
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
	writePromptTypeInstructions(&b, promptType)
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

func writePromptTypeInstructions(b *strings.Builder, promptType string) {
	b.WriteString("Execution mode instructions:\n")
	switch promptType {
	case "fix":
		b.WriteString("- Treat this as a targeted repair for a failed PR node, not a fresh implementation.\n")
		b.WriteString("- Inspect the latest CI, test, or runtime failure before editing; patch the smallest cause that explains the failure.\n")
		b.WriteString("- Keep the fix inside the PR node scope and preserve its non-goals.\n")
		b.WriteString("- If the same failure type has already repeated or the fix budget is exhausted, stop and produce an escalation summary instead of broadening the patch.\n")
	case "review_patch":
		b.WriteString("- Treat this as a response to human PR review feedback.\n")
		b.WriteString("- Address only actionable review comments that belong to this PR node.\n")
		b.WriteString("- Do not add unrelated cleanup or new feature scope while addressing review feedback.\n")
		b.WriteString("- Explain how the patch resolves the review request and rerun the listed verification commands.\n")
	default:
		b.WriteString("- Implement the PR node from the approved plan snapshot.\n")
		b.WriteString("- Prefer established repo patterns over new abstractions unless the node explicitly requires one.\n")
		b.WriteString("- Keep scope, tests, and PR description aligned with the node acceptance criteria.\n")
	}
	b.WriteString("\n")
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
	featureName := ideaTitle(input)
	affectedAreas := inferredAffectedAreas(profile)
	testStrategy := inferredTestStrategy(profile)

	idea := &domain.SpecForgeIdea{
		RepositoryID: repoID,
		CreatedBy:    userID,
		RawInput:     input,
		Type:         ideaType,
		Status:       domain.IdeaStatusAwaitingApproval,
	}
	spec := &domain.SpecForgeProductSpec{
		Goals: []string{
			"Deliver: " + featureName + ".",
			"Turn the submitted product idea into a reviewable implementation plan.",
			"Preserve one approval checkpoint before any autonomous execution starts.",
		},
		UserStories: []string{
			"As a product owner, I can review the intended behavior before code is written.",
			"As a technical lead, I can review the proposed PR DAG and risks before execution.",
			"As an engineer, I can verify each PR node independently.",
		},
		BusinessRules: []string{
			"Plan approval is required before execution.",
			"Each PR node must have scope, non-goals, acceptance criteria, and test commands.",
			"Single-run MVP plans must stay within one repository and at most five PR nodes.",
			"Ambiguous product decisions should use conservative defaults and remain visible in the plan.",
		},
		PermissionRules: []string{
			"Only authenticated workspace users can create ideas.",
			"Only authenticated workspace users can approve generated plans in this MVP slice.",
		},
		EdgeCases: []string{
			"Overlarge ideas should be split before execution.",
			"Plans with unclear dependencies should remain in review instead of executing.",
			"High-risk areas from the repo profile should be called out before execution starts.",
		},
		NonGoals: []string{
			"Do not implement unrelated product scope while delivering this idea.",
			"Do not change deployment or production configuration unless a PR node explicitly requires it.",
		},
		AcceptanceCriteria: []string{
			"The generated plan describes the intended behavior for: " + featureName + ".",
			"The PR DAG has clear dependencies and each node is independently reviewable.",
			"The plan can be approved once and then used to start execution.",
		},
		Assumptions: []string{
			repoContextAssumption(profile),
			"Generated PR nodes are scoped from repository profile signals and may need user adjustment before approval.",
		},
	}
	plan := &domain.SpecForgeImplementationPlan{
		TechnicalSummary: "Implement " + featureName + " using the existing repository architecture and conventions.",
		AffectedAreas:    affectedAreas,
		DataModelChanges: inferredDataModelChanges(input, profile),
		APIChanges:       inferredAPIChanges(input, profile),
		UIChanges:        inferredUIChanges(input, profile),
		TestStrategy:     testStrategy,
		SecurityRisks: []string{
			"Prompt inputs are user-provided text and must be treated as untrusted.",
			"Permission, auth, and data access behavior must follow existing repository patterns.",
		},
		MigrationRisks: inferredMigrationRisks(input, profile),
		Status:         domain.PlanStatusDraft,
	}
	nodes := featurePRNodes(slug, featureName, input, profile)

	bundle := &domain.SpecForgePlanBundle{
		Idea:        idea,
		RepoProfile: profile,
		ProductSpec: spec,
		Plan:        plan,
		PRNodes:     nodes,
	}
	bundle.ProductSpec.Assumptions = append(bundle.ProductSpec.Assumptions, reviewPRDAG(bundle.PRNodes)...)
	return bundle
}

func ideaTitle(input string) string {
	title := strings.TrimSpace(strings.Join(strings.Fields(input), " "))
	if title == "" {
		return "the requested product change"
	}
	if len(title) > 140 {
		title = strings.TrimSpace(title[:140])
	}
	return title
}

func inferredAffectedAreas(profile *domain.SpecForgeRepoProfile) []string {
	if profile != nil && len(profile.AppStructure) > 0 {
		return normalizePlanList(profile.AppStructure)
	}
	areas := []string{}
	if stackHas(profile, "go", "gin") {
		areas = append(areas, "backend modules and HTTP handlers")
	}
	if stackHas(profile, "next", "react") {
		areas = append(areas, "frontend feature folders and routes")
	}
	if len(areas) > 0 {
		return normalizePlanList(areas)
	}
	return []string{"repository modules related to the requested feature"}
}

func inferredTestStrategy(profile *domain.SpecForgeRepoProfile) []string {
	if profile != nil && len(profile.TestCommands) > 0 {
		return normalizePlanList(profile.TestCommands)
	}
	return []string{"Run the repository's relevant lint, typecheck, and test commands."}
}

func inferredDataModelChanges(input string, profile *domain.SpecForgeRepoProfile) []string {
	if ideaMentions(input, "database", "schema", "migration", "model", "table", "invite", "workspace", "member") || stackHas(profile, "prisma", "gorm", "postgres") {
		return []string{"Review whether the feature needs schema or model changes; isolate migrations in an early PR if required."}
	}
	return []string{"No data model change is assumed unless implementation discovers an existing persistence boundary that must change."}
}

func inferredAPIChanges(input string, profile *domain.SpecForgeRepoProfile) []string {
	if needsBackend(input, profile) {
		return []string{"Add or update backend endpoints/services needed for " + ideaTitle(input) + "."}
	}
	return []string{"No API change is assumed from the current repo profile and idea text."}
}

func inferredUIChanges(input string, profile *domain.SpecForgeRepoProfile) []string {
	if needsFrontend(input, profile) {
		return []string{"Add or update user-facing UI needed for " + ideaTitle(input) + "."}
	}
	return []string{"No UI change is assumed from the current repo profile and idea text."}
}

func inferredMigrationRisks(input string, profile *domain.SpecForgeRepoProfile) []string {
	if ideaMentions(input, "database", "schema", "migration", "model", "table") || stackHas(profile, "prisma", "gorm") {
		return []string{"Schema changes should be isolated, reversible where possible, and tested before dependent API/UI work."}
	}
	return []string{"No migration risk is assumed for the first plan draft."}
}

func featurePRNodes(slug, featureName, input string, profile *domain.SpecForgeRepoProfile) []*domain.SpecForgePRNode {
	nodes := []*domain.SpecForgePRNode{}
	addNode := func(nodeType, title, goal string, dependsOn, expectedFiles []string) {
		order := len(nodes) + 1
		key := fmt.Sprintf("PR-%03d", order)
		nodes = append(nodes, prNode(slug, key, order, nodeType, title, goal, dependsOn, expectedFiles, profile))
	}

	addNode(
		"foundation",
		"Define "+featureName+" scope and contracts",
		"Establish the smallest implementation boundary, reusable helpers, and contracts needed before feature work.",
		nil,
		inferredAffectedAreas(profile),
	)
	last := []string{"PR-001"}
	if needsBackend(input, profile) {
		addNode(
			"backend",
			"Implement backend support for "+featureName,
			"Add or update backend services, validation, permissions, and API behavior for the feature.",
			last,
			backendExpectedFiles(profile),
		)
		last = []string{nodes[len(nodes)-1].NodeKey}
	}
	if needsFrontend(input, profile) {
		addNode(
			"frontend",
			"Implement user experience for "+featureName,
			"Add or update the UI workflow and client-side data handling for the feature.",
			last,
			frontendExpectedFiles(profile),
		)
		last = []string{nodes[len(nodes)-1].NodeKey}
	}
	if len(nodes) == 1 {
		addNode(
			"implementation",
			"Implement "+featureName,
			"Make the scoped code changes required by the approved product and technical plan.",
			last,
			inferredAffectedAreas(profile),
		)
		last = []string{nodes[len(nodes)-1].NodeKey}
	}
	addNode(
		"verification",
		"Verify "+featureName,
		"Add or update focused tests and run the repository verification commands for the completed feature.",
		last,
		testExpectedFiles(profile),
	)
	return nodes
}

func needsBackend(input string, profile *domain.SpecForgeRepoProfile) bool {
	return stackHas(profile, "go", "gin", "api", "gorm", "prisma") ||
		ideaMentions(input, "api", "backend", "server", "database", "schema", "auth", "permission", "invite", "workspace", "webhook")
}

func needsFrontend(input string, profile *domain.SpecForgeRepoProfile) bool {
	return stackHas(profile, "next", "react", "frontend") ||
		ideaMentions(input, "ui", "page", "screen", "dashboard", "form", "button", "dialog", "settings", "console")
}

func stackHas(profile *domain.SpecForgeRepoProfile, needles ...string) bool {
	if profile == nil {
		return false
	}
	haystack := strings.ToLower(strings.Join(profile.Stack, " ") + " " + strings.Join(profile.AppStructure, " "))
	for _, needle := range needles {
		if strings.Contains(haystack, strings.ToLower(strings.TrimSpace(needle))) {
			return true
		}
	}
	return false
}

func ideaMentions(input string, needles ...string) bool {
	haystack := strings.ToLower(input)
	for _, needle := range needles {
		if strings.Contains(haystack, strings.ToLower(strings.TrimSpace(needle))) {
			return true
		}
	}
	return false
}

func backendExpectedFiles(profile *domain.SpecForgeRepoProfile) []string {
	if profile != nil && len(profile.AppStructure) > 0 {
		paths := []string{}
		for _, path := range profile.AppStructure {
			lower := strings.ToLower(path)
			if strings.Contains(lower, "api") || strings.Contains(lower, "server") || strings.Contains(lower, "internal/modules") {
				paths = append(paths, path)
			}
		}
		if len(paths) > 0 {
			return normalizePlanList(paths)
		}
	}
	return []string{"backend services, handlers, routes, and domain modules related to the feature"}
}

func frontendExpectedFiles(profile *domain.SpecForgeRepoProfile) []string {
	if profile != nil && len(profile.AppStructure) > 0 {
		paths := []string{}
		for _, path := range profile.AppStructure {
			lower := strings.ToLower(path)
			if strings.Contains(lower, "web") || strings.Contains(lower, "src/features") || strings.Contains(lower, "app/") || strings.Contains(lower, "pages/") {
				paths = append(paths, path)
			}
		}
		if len(paths) > 0 {
			return normalizePlanList(paths)
		}
	}
	return []string{"frontend routes, feature components, hooks, and service adapters related to the feature"}
}

func testExpectedFiles(profile *domain.SpecForgeRepoProfile) []string {
	if stackHas(profile, "go") && stackHas(profile, "next", "react") {
		return []string{"backend tests", "frontend tests"}
	}
	if stackHas(profile, "go") {
		return []string{"Go unit and integration tests"}
	}
	if stackHas(profile, "next", "react", "typescript") {
		return []string{"TypeScript unit tests and relevant UI verification"}
	}
	return []string{"tests and verification files related to the feature"}
}

func normalizePlanList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func repoContextAssumption(profile *domain.SpecForgeRepoProfile) string {
	if profile == nil {
		return "No repo profile was available when this plan was generated; executor prompts must rediscover local stack and commands."
	}
	return "Plan generation used the current repo profile for stack, test command, convention, and risk context."
}

func prNode(slug, key string, order int, nodeType, title, goal string, dependsOn, expectedFiles []string, profile *domain.SpecForgeRepoProfile) *domain.SpecForgePRNode {
	testCommands := []string{"Run the repository's relevant verification commands."}
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
		NonGoals:           []string{"Do not broaden scope beyond this PR node.", "Do not change unrelated deployment, billing, or auth behavior."},
		AcceptanceCriteria: []string{"The slice is independently reviewable.", "The relevant verification commands pass.", "The implementation stays within declared scope."},
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
