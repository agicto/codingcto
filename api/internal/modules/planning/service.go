package planning

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
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
	CreateProjectIdea(ctx context.Context, userID, projectID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error)
	CreateProjectRequirement(ctx context.Context, userID, projectID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error)
	GenerateRequirementPlan(ctx context.Context, userID, requirementID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error)
	GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error)
	GetPlanForRequirement(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error)
	ApprovePlan(ctx context.Context, userID, planID uint, req *ApprovePlanRequest) (*domain.SpecForgePlanBundle, error)
	UpsertSkill(ctx context.Context, userID uint, repoID string, req *UpsertSkillRequest) (*domain.SpecForgeSkill, error)
	ListSkills(ctx context.Context, repoID string) ([]*domain.SpecForgeSkill, error)
	CompilePrompt(ctx context.Context, userID, prNodeID uint, req *CompilePromptRequest) (*domain.SpecForgeCompiledPrompt, error)
}

type service struct {
	repo        domain.SpecForgePlanningRepository
	profileRepo domain.SpecForgeRepoProfileRepository
	skillRepo   domain.SpecForgeSkillRepository
	projectRepo domain.SpecForgeProjectRepositoryStore
}

func NewService(repo domain.SpecForgePlanningRepository, profileRepo domain.SpecForgeRepoProfileRepository, skillRepo domain.SpecForgeSkillRepository, projectRepo domain.SpecForgeProjectRepositoryStore) *service {
	return &service{repo: repo, profileRepo: profileRepo, skillRepo: skillRepo, projectRepo: projectRepo}
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
	bundle.Plan.Version = 1
	if err := s.repo.CreatePlanBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create plan bundle: %w", err)
	}
	return bundle, nil
}

func (s *service) CreateProjectIdea(ctx context.Context, userID, projectID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error) {
	return s.CreateProjectRequirement(ctx, userID, projectID, req)
}

func (s *service) CreateProjectRequirement(ctx context.Context, userID, projectID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error) {
	if userID == 0 || projectID == 0 || req == nil || strings.TrimSpace(req.Input) == "" {
		return nil, domain.ErrInvalidInput
	}

	projectContext, err := s.projectContextFor(ctx, projectID)
	if err != nil {
		return nil, err
	}
	primaryRepoID := primaryRepositoryID(projectContext)
	if primaryRepoID == "" {
		return nil, domain.ErrInvalidInput
	}

	ideaType := strings.TrimSpace(req.Type)
	if ideaType == "" {
		ideaType = "feature"
	}

	requirement := &domain.SpecForgeRequirement{
		WorkspaceID: projectContext.Project.WorkspaceID,
		ProjectID:   projectID,
		CreatedBy:   userID,
		RawInput:    strings.TrimSpace(req.Input),
		Type:        ideaType,
		Status:      domain.RequirementStatusAwaitingApproval,
	}
	profile := synthesizedProjectProfile(projectContext, primaryRepoID)
	bundle := compileInitialPlan(userID, primaryRepoID, requirement.RawInput, ideaType, profile)
	bundle.Requirement = requirement
	bundle.Idea.ProjectID = &projectID
	bundle.ProjectContext = projectContext
	bundle.Plan.Version = 1
	bundle.ProductSpec.Assumptions = append(bundle.ProductSpec.Assumptions, projectContextAssumption(projectContext))
	if err := s.repo.CreatePlanBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("create project requirement plan bundle: %w", err)
	}
	return bundle, nil
}

func (s *service) GenerateRequirementPlan(ctx context.Context, userID, requirementID uint, req *CreateIdeaRequest) (*domain.SpecForgePlanBundle, error) {
	if userID == 0 || requirementID == 0 {
		return nil, domain.ErrInvalidInput
	}
	requirement, err := s.repo.FindRequirementByID(ctx, requirementID)
	if err != nil {
		return nil, err
	}
	if requirement.Status == domain.RequirementStatusExecuting {
		return nil, domain.ErrConflict
	}
	projectContext, err := s.projectContextFor(ctx, requirement.ProjectID)
	if err != nil {
		return nil, err
	}
	primaryRepoID := primaryRepositoryID(projectContext)
	if primaryRepoID == "" {
		return nil, domain.ErrInvalidInput
	}
	input := strings.TrimSpace(requirement.RawInput)
	ideaType := strings.TrimSpace(requirement.Type)
	if req != nil {
		if strings.TrimSpace(req.Input) != "" {
			input = strings.TrimSpace(req.Input)
		}
		if strings.TrimSpace(req.Type) != "" {
			ideaType = strings.TrimSpace(req.Type)
		}
	}
	if input == "" {
		return nil, domain.ErrInvalidInput
	}
	if ideaType == "" {
		ideaType = "feature"
	}
	version, err := s.repo.NextPlanVersionByRequirementID(ctx, requirementID)
	if err != nil {
		return nil, err
	}
	profile := synthesizedProjectProfile(projectContext, primaryRepoID)
	bundle := compileInitialPlan(userID, primaryRepoID, input, ideaType, profile)
	bundle.Requirement = requirement
	bundle.Idea.RequirementID = &requirement.ID
	bundle.Idea.ProjectID = &requirement.ProjectID
	bundle.ProjectContext = projectContext
	bundle.Plan.RequirementID = &requirement.ID
	bundle.Plan.Version = version
	bundle.ProductSpec.Assumptions = append(bundle.ProductSpec.Assumptions, projectContextAssumption(projectContext))
	if err := s.repo.CreatePlanBundle(ctx, bundle); err != nil {
		return nil, fmt.Errorf("generate requirement plan: %w", err)
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

func (s *service) GetPlanForRequirement(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error) {
	if requirementID == 0 {
		return nil, domain.ErrInvalidInput
	}
	bundle, err := s.repo.FindLatestPlanBundleByRequirementID(ctx, requirementID)
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
	if bundle.Plan.RequirementID != nil {
		latest, err := s.repo.FindLatestPlanBundleByRequirementID(ctx, *bundle.Plan.RequirementID)
		if err != nil {
			return nil, err
		}
		if latest == nil || latest.Plan == nil || latest.Plan.ID != bundle.Plan.ID || latest.Plan.Status != domain.PlanStatusDraft {
			return nil, domain.ErrConflict
		}
	}
	if !domain.ExecutableSpecForgePRDAG(bundle.PRNodes) {
		return nil, domain.ErrConflict
	}

	now := time.Now()
	bundle.Plan.Status = domain.PlanStatusApproved
	bundle.Plan.ApprovedBy = &userID
	bundle.Plan.ApprovedAt = &now
	bundle.Plan.ApprovedSnapshotAt = &now
	bundle.Plan.ApprovedSnapshotHash = approvedPlanSnapshotHash(bundle)
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
	if bundle != nil && bundle.ProjectContext != nil {
		return activeProjectSkills(bundle.ProjectContext), nil
	}
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
	if bundle.Idea.ProjectID != nil && *bundle.Idea.ProjectID != 0 {
		projectContext, err := s.projectContextFor(ctx, *bundle.Idea.ProjectID)
		if err != nil {
			return nil, err
		}
		bundle.ProjectContext = projectContext
		bundle.RepoProfile = synthesizedProjectProfile(projectContext, bundle.Idea.RepositoryID)
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

func (s *service) projectContextFor(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error) {
	if s.projectRepo == nil || projectID == 0 {
		return nil, domain.ErrInvalidInput
	}
	project, err := s.projectRepo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	repositories, err := s.projectRepo.ListProjectRepositories(ctx, projectID)
	if err != nil {
		return nil, err
	}
	contexts := make([]*domain.SpecForgeProjectRepositoryContext, 0, len(repositories))
	for _, repository := range repositories {
		if repository == nil || !repository.Active {
			continue
		}
		context := &domain.SpecForgeProjectRepositoryContext{
			Repository: repository,
			Skills:     []*domain.SpecForgeSkill{},
		}
		if s.profileRepo != nil {
			profile, err := s.profileRepo.FindProfileByRepositoryID(ctx, repository.RepositoryID)
			if err != nil {
				if !errors.Is(err, domain.ErrNotFound) {
					return nil, fmt.Errorf("load project repo profile: %w", err)
				}
				context.Warnings = append(context.Warnings, "Repo profile has not been generated yet.")
			} else {
				context.Profile = profile
			}
		}
		if s.skillRepo != nil {
			skills, err := s.skillRepo.ListActiveSkillsByRepositoryID(ctx, repository.RepositoryID)
			if err != nil {
				return nil, fmt.Errorf("load project repo skills: %w", err)
			}
			context.Skills = skills
		}
		contexts = append(contexts, context)
	}
	return &domain.SpecForgeProjectContext{
		Project:            project,
		Repositories:       repositories,
		RepositoryContexts: contexts,
	}, nil
}

func compilePromptText(promptType string, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) string {
	var b strings.Builder
	b.WriteString("You are implementing a SpecForge PR node.\n\n")
	b.WriteString("Prompt type: " + promptType + "\n")
	b.WriteString("PR node: " + node.NodeKey + " - " + node.Title + "\n")
	if strings.TrimSpace(node.RepositoryID) != "" {
		b.WriteString("Target repository: " + strings.TrimSpace(node.RepositoryID) + "\n")
	}
	b.WriteString("Goal:\n" + node.Goal + "\n\n")
	writePromptTypeInstructions(&b, promptType)
	b.WriteString("Product context:\n")
	for _, goal := range bundle.ProductSpec.Goals {
		b.WriteString("- " + goal + "\n")
	}
	b.WriteString("\nTechnical plan:\n" + bundle.Plan.TechnicalSummary + "\n\n")
	writeProjectContext(&b, bundle.ProjectContext)
	writeRepoProfile(&b, bundle.RepoProfile)
	writeSkills(&b, skills)
	writeList(&b, "Expected files", node.ExpectedFiles)
	writeList(&b, "Dependencies", node.DependsOn)
	writeList(&b, "Non-goals", node.NonGoals)
	writeList(&b, "Acceptance criteria", node.AcceptanceCriteria)
	writeList(&b, "Test commands", node.TestCommands)
	b.WriteString("\nAfter implementation:\n")
	b.WriteString("- Keep the diff within this PR node scope.\n")
	b.WriteString("- Modify only the target repository for this PR node.\n")
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

func writeProjectContext(b *strings.Builder, context *domain.SpecForgeProjectContext) {
	if context == nil || context.Project == nil {
		return
	}
	b.WriteString("Project context:\n")
	b.WriteString("- Project: " + context.Project.Name + "\n")
	if strings.TrimSpace(context.Project.Description) != "" {
		b.WriteString("- Description: " + strings.TrimSpace(context.Project.Description) + "\n")
	}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil {
			continue
		}
		b.WriteString("- Repository " + repoContext.Repository.RepositoryID + " (" + repoContext.Repository.Role + ")\n")
		if repoContext.Profile != nil {
			if strings.TrimSpace(repoContext.Profile.Summary) != "" {
				b.WriteString("  - Summary: " + strings.TrimSpace(repoContext.Profile.Summary) + "\n")
			}
			if len(repoContext.Profile.Stack) > 0 {
				b.WriteString("  - Stack: " + strings.Join(normalizePlanList(repoContext.Profile.Stack), ", ") + "\n")
			}
			if len(repoContext.Profile.TestCommands) > 0 {
				b.WriteString("  - Tests: " + strings.Join(normalizePlanList(repoContext.Profile.TestCommands), ", ") + "\n")
			}
		}
		for _, warning := range repoContext.Warnings {
			if strings.TrimSpace(warning) != "" {
				b.WriteString("  - Warning: " + strings.TrimSpace(warning) + "\n")
			}
		}
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

func primaryRepositoryID(context *domain.SpecForgeProjectContext) string {
	if context == nil {
		return ""
	}
	fallback := ""
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil || !repoContext.Repository.Active {
			continue
		}
		repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
		if repositoryID == "" {
			continue
		}
		if fallback == "" {
			fallback = repositoryID
		}
		if repoContext.Repository.Role == domain.ProjectRepositoryRolePrimary {
			return repositoryID
		}
	}
	for _, repository := range context.Repositories {
		if repository == nil || !repository.Active || strings.TrimSpace(repository.RepositoryID) == "" {
			continue
		}
		if fallback == "" {
			fallback = strings.TrimSpace(repository.RepositoryID)
		}
		if repository.Role == domain.ProjectRepositoryRolePrimary {
			return strings.TrimSpace(repository.RepositoryID)
		}
	}
	return fallback
}

func synthesizedProjectProfile(context *domain.SpecForgeProjectContext, primaryRepoID string) *domain.SpecForgeRepoProfile {
	if context == nil {
		return nil
	}
	profile := &domain.SpecForgeRepoProfile{
		RepositoryID:  strings.TrimSpace(primaryRepoID),
		DefaultBranch: "main",
		CIProvider:    "project_context",
		Source:        "project_context",
		Summary:       "Project context synthesized from bound repositories.",
	}
	if context.Project != nil {
		profile.Summary = "Project " + context.Project.Name + " synthesized from bound repositories."
	}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil {
			continue
		}
		repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
		role := strings.TrimSpace(repoContext.Repository.Role)
		if repoContext.Profile == nil {
			profile.Warnings = append(profile.Warnings, "Repository "+repositoryID+" has no repo profile yet.")
			continue
		}
		if repositoryID == primaryRepoID {
			profile.DefaultBranch = repoContext.Profile.DefaultBranch
		}
		prefix := repositoryID
		if role != "" {
			prefix += " (" + role + ")"
		}
		if strings.TrimSpace(repoContext.Profile.Summary) != "" {
			profile.AppStructure = append(profile.AppStructure, prefix+": "+strings.TrimSpace(repoContext.Profile.Summary))
		}
		profile.Stack = append(profile.Stack, repoContext.Profile.Stack...)
		profile.TestCommands = append(profile.TestCommands, repoContext.Profile.TestCommands...)
		profile.AppStructure = append(profile.AppStructure, repoContext.Profile.AppStructure...)
		profile.CodingConventions = append(profile.CodingConventions, repoContext.Profile.CodingConventions...)
		profile.RiskAreas = append(profile.RiskAreas, repoContext.Profile.RiskAreas...)
		profile.Warnings = append(profile.Warnings, repoContext.Profile.Warnings...)
	}
	profile.Stack = normalizePlanList(profile.Stack)
	profile.TestCommands = normalizePlanList(profile.TestCommands)
	profile.AppStructure = normalizePlanList(profile.AppStructure)
	profile.CodingConventions = normalizePlanList(profile.CodingConventions)
	profile.RiskAreas = normalizePlanList(profile.RiskAreas)
	profile.Warnings = normalizePlanList(profile.Warnings)
	return profile
}

func activeProjectSkills(context *domain.SpecForgeProjectContext) []*domain.SpecForgeSkill {
	if context == nil {
		return []*domain.SpecForgeSkill{}
	}
	skills := []*domain.SpecForgeSkill{}
	seen := map[string]struct{}{}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil {
			continue
		}
		for _, skill := range repoContext.Skills {
			if skill == nil || !skill.Active {
				continue
			}
			key := skill.RepositoryID + "\x00" + skill.Name
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			skills = append(skills, skill)
		}
	}
	return skills
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
	complexity := assessIdeaComplexity(input, profile)

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
	if complexity.RequiresMilestoneSplit {
		spec.Assumptions = append(spec.Assumptions, complexity.Assumption)
		spec.EdgeCases = append(spec.EdgeCases, complexity.EdgeCase)
		spec.NonGoals = append(spec.NonGoals, "Do not execute all high-risk surfaces in one MVP run; approve a milestone slice first.")
	}
	plan := &domain.SpecForgeImplementationPlan{
		Version:          1,
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
	if complexity.RequiresMilestoneSplit {
		plan.SecurityRisks = append(plan.SecurityRisks, complexity.SecurityRisk)
		plan.MigrationRisks = append(plan.MigrationRisks, complexity.MigrationRisk)
	}
	nodes := featurePRNodes(slug, featureName, input, profile)
	assignPRNodeRepository(nodes, repoID)

	bundle := &domain.SpecForgePlanBundle{
		Idea:        idea,
		RepoProfile: profile,
		ProductSpec: spec,
		Plan:        plan,
		PRNodes:     nodes,
	}
	bundle.ProductSpec.Assumptions = append(bundle.ProductSpec.Assumptions, reviewPRDAG(bundle.PRNodes, complexity)...)
	return bundle
}

func assignPRNodeRepository(nodes []*domain.SpecForgePRNode, repositoryID string) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return
	}
	for _, node := range nodes {
		if node != nil && strings.TrimSpace(node.RepositoryID) == "" {
			node.RepositoryID = repositoryID
		}
	}
}

func approvedPlanSnapshotHash(bundle *domain.SpecForgePlanBundle) string {
	if bundle == nil {
		return ""
	}
	snapshot := struct {
		RequirementID *uint                               `json:"requirement_id,omitempty"`
		Idea          *domain.SpecForgeIdea               `json:"idea"`
		ProductSpec   *domain.SpecForgeProductSpec        `json:"product_spec"`
		Plan          *domain.SpecForgeImplementationPlan `json:"implementation_plan"`
		PRNodes       []*domain.SpecForgePRNode           `json:"pr_nodes"`
	}{
		Idea:        bundle.Idea,
		ProductSpec: bundle.ProductSpec,
		Plan:        bundle.Plan,
		PRNodes:     bundle.PRNodes,
	}
	if bundle.Requirement != nil {
		snapshot.RequirementID = &bundle.Requirement.ID
	} else if bundle.Idea != nil {
		snapshot.RequirementID = bundle.Idea.RequirementID
	}
	data, err := json.Marshal(snapshot)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

type ideaComplexity struct {
	Signals                []string
	RequiresMilestoneSplit bool
	Assumption             string
	EdgeCase               string
	SecurityRisk           string
	MigrationRisk          string
}

func assessIdeaComplexity(input string, profile *domain.SpecForgeRepoProfile) ideaComplexity {
	signals := normalizePlanList(ideaComplexitySignals(input, profile))
	complexity := ideaComplexity{Signals: signals}
	if len(signals) < 5 {
		return complexity
	}
	complexity.RequiresMilestoneSplit = true
	joined := strings.Join(signals, ", ")
	complexity.Assumption = "Complexity guardrail: this idea spans " + joined + "; keep the first execution milestone to at most five PRs and one high-risk surface."
	complexity.EdgeCase = "If the approved scope still requires all detected surfaces, split execution into separate milestones before starting autonomous implementation."
	complexity.SecurityRisk = "Complexity guardrail: combined changes across " + joined + " increase review and regression risk; isolate security-sensitive changes before UI or notification work."
	complexity.MigrationRisk = "Complexity guardrail: if persistence or migration work is required, land it in a foundation milestone before dependent API, UI, notification, or audit work."
	return complexity
}

func ideaComplexitySignals(input string, profile *domain.SpecForgeRepoProfile) []string {
	signals := []string{}
	if ideaMentions(input, "database", "schema", "migration", "model", "table") || stackHas(profile, "prisma", "gorm", "postgres") {
		signals = append(signals, "data model or migration")
	}
	if needsBackend(input, profile) {
		signals = append(signals, "backend API")
	}
	if needsFrontend(input, profile) {
		signals = append(signals, "frontend UI")
	}
	if ideaMentions(input, "email", "mail", "notification", "sendgrid", "resend") {
		signals = append(signals, "email or notification")
	}
	if ideaMentions(input, "auth", "permission", "role", "rbac", "admin", "owner") || profileHasRisk(profile, "auth") {
		signals = append(signals, "auth or permission")
	}
	if ideaMentions(input, "audit", "log", "history", "compliance") {
		signals = append(signals, "audit or compliance")
	}
	if ideaMentions(input, "billing", "stripe", "plan", "subscription", "payment") || profileHasRisk(profile, "billing") {
		signals = append(signals, "billing")
	}
	if ideaMentions(input, "webhook", "integration", "slack", "linear", "jira", "github app") {
		signals = append(signals, "external integration")
	}
	return signals
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

func profileHasRisk(profile *domain.SpecForgeRepoProfile, needles ...string) bool {
	if profile == nil {
		return false
	}
	haystack := strings.ToLower(strings.Join(profile.RiskAreas, " "))
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

func projectContextAssumption(context *domain.SpecForgeProjectContext) string {
	if context == nil || context.Project == nil {
		return "No project context was available when this plan was generated."
	}
	count := 0
	for _, repoContext := range context.RepositoryContexts {
		if repoContext != nil && repoContext.Repository != nil && repoContext.Repository.Active {
			count++
		}
	}
	return fmt.Sprintf("Plan generation used project context for %s across %d active repositories.", context.Project.Name, count)
}

func prNode(slug, key string, order int, nodeType, title, goal string, dependsOn, expectedFiles []string, profile *domain.SpecForgeRepoProfile) *domain.SpecForgePRNode {
	testCommands := []string{"Run the repository's relevant verification commands."}
	repositoryID := ""
	if profile != nil && len(profile.TestCommands) > 0 {
		testCommands = append([]string(nil), profile.TestCommands...)
	}
	if profile != nil {
		repositoryID = strings.TrimSpace(profile.RepositoryID)
	}
	return &domain.SpecForgePRNode{
		RepositoryID:       repositoryID,
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

func reviewPRDAG(nodes []*domain.SpecForgePRNode, complexity ...ideaComplexity) []string {
	const maxMVPPRNodes = 5

	notes := make([]string, 0)
	if len(nodes) == 0 {
		return []string{"PR DAG review: no PR nodes were generated; the plan cannot execute until it is split into reviewable work."}
	}
	if len(nodes) > maxMVPPRNodes {
		notes = append(notes, fmt.Sprintf("PR DAG review: generated %d PR nodes, above the MVP limit of %d; split the idea into milestones before execution.", len(nodes), maxMVPPRNodes))
	}
	if len(complexity) > 0 && complexity[0].RequiresMilestoneSplit {
		notes = append(notes, "PR DAG review: complexity guardrail recommends a milestone split before execution because the idea spans "+strings.Join(complexity[0].Signals, ", ")+".")
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
		if strings.TrimSpace(node.RepositoryID) == "" {
			notes = append(notes, "PR DAG review: "+label+" is missing a target repository.")
		}
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
		return []string{fmt.Sprintf("PR DAG review: validation passed for %d reviewable %s; dependencies resolve within the generated plan.", len(nodes), pluralize("PR node", len(nodes)))}
	}
	return notes
}

func pluralize(label string, count int) string {
	if count == 1 {
		return label
	}
	return label + "s"
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
