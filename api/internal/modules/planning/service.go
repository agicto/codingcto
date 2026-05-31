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
	GetLatestPlanForProject(ctx context.Context, projectID uint) (*domain.SpecForgePlanBundle, error)
	GetPlanForIdea(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error)
	GetPlanForRequirement(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error)
	ApprovePlan(ctx context.Context, userID, planID uint, req *ApprovePlanRequest) (*domain.SpecForgePlanBundle, error)
	UpsertSkill(ctx context.Context, userID uint, repoID string, req *UpsertSkillRequest) (*domain.SpecForgeSkill, error)
	ListSkills(ctx context.Context, repoID string) ([]*domain.SpecForgeSkill, error)
	UpsertProjectSkill(ctx context.Context, userID, projectID uint, req *UpsertProjectSkillRequest) (*domain.SpecForgeProjectSkill, error)
	ListProjectSkills(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error)
	ListSkillRunsForRequirement(ctx context.Context, requirementID uint) ([]*domain.SpecForgeSkillRun, error)
	ListSkillRunsForPlan(ctx context.Context, planID uint) ([]*domain.SpecForgeSkillRun, error)
	CompilePrompt(ctx context.Context, userID, prNodeID uint, req *CompilePromptRequest) (*domain.SpecForgeCompiledPrompt, error)
}

type service struct {
	repo             domain.SpecForgePlanningRepository
	profileRepo      domain.SpecForgeRepoProfileRepository
	architectureRepo repoArchitectureStore
	skillRepo        domain.SpecForgeSkillRepository
	pipelineRepo     domain.SpecForgeSkillPipelineRepository
	projectRepo      domain.SpecForgeProjectRepositoryStore
}

type repoArchitectureStore interface {
	FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error)
}

type projectPlanHistoryStore interface {
	FindLatestPlanBundleByProjectID(ctx context.Context, projectID uint) (*domain.SpecForgePlanBundle, error)
}

func NewService(repo domain.SpecForgePlanningRepository, profileRepo domain.SpecForgeRepoProfileRepository, skillRepo domain.SpecForgeSkillRepository, projectRepo domain.SpecForgeProjectRepositoryStore) *service {
	var pipelineRepo domain.SpecForgeSkillPipelineRepository
	if repo, ok := skillRepo.(domain.SpecForgeSkillPipelineRepository); ok {
		pipelineRepo = repo
	}
	var architectureRepo repoArchitectureStore
	if repo, ok := profileRepo.(repoArchitectureStore); ok {
		architectureRepo = repo
	}
	return &service{repo: repo, profileRepo: profileRepo, architectureRepo: architectureRepo, skillRepo: skillRepo, pipelineRepo: pipelineRepo, projectRepo: projectRepo}
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
	if err := s.persistBundleEvidenceRefs(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.recordPlanSkillRuns(ctx, userID, bundle); err != nil {
		return nil, err
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
	if err := s.persistBundleEvidenceRefs(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.recordPlanSkillRuns(ctx, userID, bundle); err != nil {
		return nil, err
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
	if err := s.persistBundleEvidenceRefs(ctx, bundle); err != nil {
		return nil, err
	}
	if err := s.recordPlanSkillRuns(ctx, userID, bundle); err != nil {
		return nil, err
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

func (s *service) GetLatestPlanForProject(ctx context.Context, projectID uint) (*domain.SpecForgePlanBundle, error) {
	if projectID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if s.projectRepo != nil {
		if _, err := s.projectRepo.FindProjectByID(ctx, projectID); err != nil {
			return nil, err
		}
	}
	historyRepo, ok := s.repo.(projectPlanHistoryStore)
	if !ok {
		return nil, domain.ErrInvalidInput
	}
	bundle, err := historyRepo.FindLatestPlanBundleByProjectID(ctx, projectID)
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

func (s *service) UpsertProjectSkill(ctx context.Context, userID, projectID uint, req *UpsertProjectSkillRequest) (*domain.SpecForgeProjectSkill, error) {
	if userID == 0 || projectID == 0 || req == nil || s.skillRepo == nil || s.pipelineRepo == nil || s.projectRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	project, err := s.projectRepo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	repositoryID := strings.TrimSpace(req.RepositoryID)
	if _, err := s.projectRepo.FindProjectRepository(ctx, projectID, repositoryID); err != nil {
		return nil, err
	}
	skill, err := s.UpsertSkill(ctx, userID, req.RepositoryID, &UpsertSkillRequest{
		Name:        req.Name,
		Description: req.Description,
		Content:     req.Content,
		Active:      req.Active,
	})
	if err != nil {
		return nil, err
	}
	active := true
	if req.Active != nil {
		active = *req.Active
	}
	projectSkill := &domain.SpecForgeProjectSkill{
		WorkspaceID:  project.WorkspaceID,
		ProjectID:    projectID,
		RepositoryID: skill.RepositoryID,
		SkillID:      skill.ID,
		Active:       active,
		SortOrder:    req.SortOrder,
		CreatedBy:    userID,
	}
	if err := s.pipelineRepo.UpsertProjectSkill(ctx, projectSkill); err != nil {
		return nil, fmt.Errorf("upsert project skill: %w", err)
	}
	return projectSkill, nil
}

func (s *service) ListProjectSkills(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	if projectID == 0 || s.pipelineRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	return s.pipelineRepo.ListProjectSkillsByProjectID(ctx, projectID)
}

func (s *service) ListSkillRunsForRequirement(ctx context.Context, requirementID uint) ([]*domain.SpecForgeSkillRun, error) {
	if requirementID == 0 || s.pipelineRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	return s.pipelineRepo.ListSkillRunsByRequirementID(ctx, requirementID)
}

func (s *service) ListSkillRunsForPlan(ctx context.Context, planID uint) ([]*domain.SpecForgeSkillRun, error) {
	if planID == 0 || s.pipelineRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	return s.pipelineRepo.ListSkillRunsByPlanID(ctx, planID)
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
		PRNodeID:     node.ID,
		PlanID:       node.PlanID,
		Type:         promptType,
		Version:      "prompt_v2",
		PromptText:   text,
		PromptHash:   hex.EncodeToString(hash[:]),
		EvidenceRefs: evidenceRefsFor(bundle, node, skills),
		CreatedBy:    userID,
	}
	if err := s.repo.CreateCompiledPrompt(ctx, prompt); err != nil {
		return nil, fmt.Errorf("create compiled prompt: %w", err)
	}
	return prompt, nil
}

func (s *service) activeSkillsFor(ctx context.Context, bundle *domain.SpecForgePlanBundle) ([]*domain.SpecForgeSkill, error) {
	if bundle != nil && bundle.ProjectContext != nil {
		if s.pipelineRepo != nil && bundle.ProjectContext.Project != nil {
			projectSkills, err := s.pipelineRepo.ListActiveProjectSkillsByProjectID(ctx, bundle.ProjectContext.Project.ID)
			if err != nil {
				return nil, fmt.Errorf("load active project skills: %w", err)
			}
			if len(projectSkills) > 0 {
				return skillsFromProjectSkills(projectSkills), nil
			}
		}
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

func (s *service) recordPlanSkillRuns(ctx context.Context, userID uint, bundle *domain.SpecForgePlanBundle) error {
	if s.pipelineRepo == nil || bundle == nil || bundle.Plan == nil {
		return nil
	}
	skills, err := s.activeSkillsFor(ctx, bundle)
	if err != nil {
		return err
	}
	now := time.Now()
	requirementID := bundle.Plan.RequirementID
	planID := &bundle.Plan.ID
	var projectID *uint
	if bundle.Requirement != nil && bundle.Requirement.ProjectID != 0 {
		id := bundle.Requirement.ProjectID
		projectID = &id
	} else if bundle.Idea != nil && bundle.Idea.ProjectID != nil {
		projectID = bundle.Idea.ProjectID
	}
	for _, run := range plannedSkillRuns(userID, requirementID, planID, projectID, bundle, skills, now) {
		if err := s.pipelineRepo.CreateSkillRun(ctx, run); err != nil {
			return fmt.Errorf("create skill run: %w", err)
		}
	}
	return nil
}

func (s *service) persistBundleEvidenceRefs(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	if bundle == nil || bundle.Plan == nil {
		return nil
	}
	skills, err := s.activeSkillsFor(ctx, bundle)
	if err != nil {
		return err
	}
	bundle.Plan.EvidenceRefs = evidenceRefsFor(bundle, nil, skills)
	if err := s.repo.UpdatePlan(ctx, bundle.Plan); err != nil {
		return fmt.Errorf("update plan evidence refs: %w", err)
	}
	for _, node := range bundle.PRNodes {
		if node == nil {
			continue
		}
		node.EvidenceRefs = evidenceRefsFor(bundle, node, skills)
		if err := s.repo.UpdatePRNode(ctx, node); err != nil {
			return fmt.Errorf("update pr node evidence refs: %w", err)
		}
	}
	return nil
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
		if s.architectureRepo != nil {
			snapshot, err := s.architectureRepo.FindLatestArchitectureSnapshotByRepositoryID(ctx, repository.RepositoryID)
			if err != nil {
				if !errors.Is(err, domain.ErrNotFound) {
					return nil, fmt.Errorf("load project repo architecture snapshot: %w", err)
				}
				context.ArchitectureStale = true
				context.ArchitectureWarnings = append(context.ArchitectureWarnings, "Architecture snapshot has not been generated yet.")
			} else {
				context.ArchitectureSnapshot = snapshot
				stale, reasons := domain.SpecForgeRepoArchitectureSnapshotStaleness(snapshot, time.Now().UTC())
				context.ArchitectureStale = stale
				context.ArchitectureWarnings = append(context.ArchitectureWarnings, reasons...)
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
	context := &domain.SpecForgeProjectContext{
		Project:            project,
		Repositories:       repositories,
		RepositoryContexts: contexts,
	}
	domain.ApplySpecForgeProjectContextGuardrails(context)
	return context, nil
}

func compilePromptText(promptType string, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) string {
	var b strings.Builder
	b.WriteString("You are implementing a CodingCTO PR node.\n\n")
	b.WriteString("Prompt type: " + promptType + "\n")
	b.WriteString("PR node: " + node.NodeKey + " - " + node.Title + "\n")
	if strings.TrimSpace(node.RepositoryID) != "" {
		b.WriteString("Target repository: " + strings.TrimSpace(node.RepositoryID) + "\n")
	}
	b.WriteString("Goal:\n" + node.Goal + "\n\n")
	writePromptContract(&b, promptType, bundle, node, skills)
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

func writePromptContract(b *strings.Builder, promptType string, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) {
	b.WriteString("Grounded prompt contract:\n")
	b.WriteString("- Treat the evidence refs below as the only approved product and engineering source of truth for this task.\n")
	b.WriteString("- Do not invent requirements, APIs, data models, routes, commands, or dependencies that are not supported by the evidence refs.\n")
	b.WriteString("- If evidence is missing or contradictory, stop and produce a concise escalation summary instead of broadening scope.\n")
	if promptType == domain.PromptTypeFix || promptType == domain.PromptTypeReviewPatch {
		b.WriteString("- Preserve the original PR node scope; patches may narrow scope but must not expand it.\n")
	}
	b.WriteString("\n")
	writeEvidenceRefs(b, bundle, node, skills)
	writeScopeGuardrails(b, bundle, node)
	writeDAGGuardrails(b, bundle, node)
	writeVerificationContract(b, bundle, node)
}

func writeEvidenceRefs(b *strings.Builder, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) {
	b.WriteString("Evidence refs:\n")
	if bundle != nil && bundle.Idea != nil {
		b.WriteString("- idea.raw_input: " + compactPromptLine(bundle.Idea.RawInput) + "\n")
		b.WriteString("- idea.repository_id: " + strings.TrimSpace(bundle.Idea.RepositoryID) + "\n")
		if bundle.Requirement != nil {
			b.WriteString("- requirement.id: " + fmt.Sprint(bundle.Requirement.ID) + "\n")
		}
	}
	if bundle != nil && bundle.ProductSpec != nil {
		writeEvidenceListRef(b, "product_spec.goals", bundle.ProductSpec.Goals)
		writeEvidenceListRef(b, "product_spec.business_rules", bundle.ProductSpec.BusinessRules)
		writeEvidenceListRef(b, "product_spec.permission_rules", bundle.ProductSpec.PermissionRules)
		writeEvidenceListRef(b, "product_spec.acceptance_criteria", bundle.ProductSpec.AcceptanceCriteria)
		writeEvidenceListRef(b, "product_spec.non_goals", bundle.ProductSpec.NonGoals)
	}
	if bundle != nil && bundle.Plan != nil {
		b.WriteString("- technical_plan.summary: " + compactPromptLine(bundle.Plan.TechnicalSummary) + "\n")
		writeEvidenceListRef(b, "technical_plan.affected_areas", bundle.Plan.AffectedAreas)
		writeEvidenceListRef(b, "technical_plan.test_strategy", bundle.Plan.TestStrategy)
		writeEvidenceListRef(b, "technical_plan.security_risks", bundle.Plan.SecurityRisks)
		writeEvidenceListRef(b, "technical_plan.migration_risks", bundle.Plan.MigrationRisks)
	}
	if node != nil {
		b.WriteString("- pr_node.id: " + fmt.Sprint(node.ID) + "\n")
		b.WriteString("- pr_node.key: " + strings.TrimSpace(node.NodeKey) + "\n")
		b.WriteString("- pr_node.repository_id: " + strings.TrimSpace(node.RepositoryID) + "\n")
		writeEvidenceListRef(b, "pr_node.expected_files", node.ExpectedFiles)
		writeEvidenceListRef(b, "pr_node.non_goals", node.NonGoals)
		writeEvidenceListRef(b, "pr_node.acceptance_criteria", node.AcceptanceCriteria)
		writeEvidenceListRef(b, "pr_node.test_commands", node.TestCommands)
	}
	if bundle != nil && bundle.RepoProfile != nil {
		profile := bundle.RepoProfile
		b.WriteString("- repo_profile.source: " + strings.TrimSpace(profile.Source) + "\n")
		b.WriteString("- repo_profile.summary: " + compactPromptLine(profile.Summary) + "\n")
		if !profile.LastIndexedAt.IsZero() {
			b.WriteString("- repo_profile.last_indexed_at: " + profile.LastIndexedAt.Format(time.RFC3339) + "\n")
		}
		writeEvidenceListRef(b, "repo_profile.stack", profile.Stack)
		writeEvidenceListRef(b, "repo_profile.test_commands", profile.TestCommands)
		writeEvidenceListRef(b, "repo_profile.risk_areas", profile.RiskAreas)
		writeEvidenceListRef(b, "repo_profile.warnings", profile.Warnings)
	}
	if bundle != nil && bundle.ProjectContext != nil {
		writeProjectEvidenceRefs(b, bundle.ProjectContext)
	}
	writeSkillEvidenceRefs(b, skills)
	b.WriteString("\n")
}

func writeEvidenceListRef(b *strings.Builder, name string, values []string) {
	values = normalizePlanList(values)
	if len(values) == 0 {
		b.WriteString("- " + name + ": none\n")
		return
	}
	b.WriteString("- " + name + ":\n")
	for _, value := range values {
		b.WriteString("  - " + compactPromptLine(value) + "\n")
	}
}

func writeProjectEvidenceRefs(b *strings.Builder, context *domain.SpecForgeProjectContext) {
	if context == nil || context.Project == nil {
		return
	}
	b.WriteString("- project.id: " + fmt.Sprint(context.Project.ID) + "\n")
	b.WriteString("- project.name: " + strings.TrimSpace(context.Project.Name) + "\n")
	if strings.TrimSpace(context.PrimaryRepositoryID) != "" {
		b.WriteString("- project.primary_repository_id: " + strings.TrimSpace(context.PrimaryRepositoryID) + "\n")
	}
	writeEvidenceListRef(b, "project.read_only_repository_ids", context.ReadOnlyRepositoryIDs)
	writeEvidenceListRef(b, "project.execution_guardrails", context.ExecutionGuardrails)
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil {
			continue
		}
		b.WriteString("- project.repository: " + strings.TrimSpace(repoContext.Repository.RepositoryID) + " role=" + strings.TrimSpace(repoContext.Repository.Role) + "\n")
		if repoContext.Profile != nil {
			b.WriteString("  - profile.summary: " + compactPromptLine(repoContext.Profile.Summary) + "\n")
			stack := normalizePlanList(repoContext.Profile.Stack)
			if len(stack) == 0 {
				b.WriteString("  - profile.stack: none\n")
			} else {
				b.WriteString("  - profile.stack: " + strings.Join(stack, ", ") + "\n")
			}
		}
		writeArchitectureEvidenceRefLines(b, repoContext, "  - ")
	}
}

func writeArchitectureEvidenceRefLines(b *strings.Builder, repoContext *domain.SpecForgeProjectRepositoryContext, prefix string) {
	if repoContext == nil || repoContext.Repository == nil {
		return
	}
	repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
	if repositoryID == "" {
		return
	}
	snapshot := repoContext.ArchitectureSnapshot
	if snapshot == nil {
		b.WriteString(prefix + "architecture_snapshot: missing\n")
		writeEvidenceListRefWithPrefix(b, prefix, "architecture_warnings", repoContext.ArchitectureWarnings)
		return
	}
	b.WriteString(prefix + "architecture_snapshot.commit: " + compactPromptLine(snapshot.CommitSHA) + "\n")
	b.WriteString(prefix + "architecture_snapshot.summary: " + compactPromptLine(snapshot.Summary) + "\n")
	if repoContext.ArchitectureStale {
		b.WriteString(prefix + "architecture_snapshot.stale: true\n")
	}
	writeEvidenceListRefWithPrefix(b, prefix, "architecture_snapshot.modules", snapshot.Modules)
	writeEvidenceListRefWithPrefix(b, prefix, "architecture_snapshot.entrypoints", snapshot.Entrypoints)
	writeEvidenceListRefWithPrefix(b, prefix, "architecture_snapshot.ci_workflows", snapshot.CIWorkflows)
	writeEvidenceListRefWithPrefix(b, prefix, "architecture_snapshot.warnings", append(snapshot.Warnings, repoContext.ArchitectureWarnings...))
}

func writeEvidenceListRefWithPrefix(b *strings.Builder, prefix, name string, values []string) {
	values = normalizePlanList(values)
	if len(values) == 0 {
		b.WriteString(prefix + name + ": none\n")
		return
	}
	b.WriteString(prefix + name + ": " + strings.Join(values, ", ") + "\n")
}

func writeSkillEvidenceRefs(b *strings.Builder, skills []*domain.SpecForgeSkill) {
	if len(skills) == 0 {
		b.WriteString("- repository_skills: none\n")
		return
	}
	b.WriteString("- repository_skills:\n")
	for _, skill := range skills {
		if skill == nil || strings.TrimSpace(skill.Name) == "" {
			continue
		}
		b.WriteString("  - " + strings.TrimSpace(skill.Name))
		if strings.TrimSpace(skill.Description) != "" {
			b.WriteString(": " + compactPromptLine(skill.Description))
		}
		b.WriteString("\n")
	}
}

func writeScopeGuardrails(b *strings.Builder, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode) {
	b.WriteString("Scope guardrails:\n")
	if node == nil {
		b.WriteString("- No PR node was provided; stop and escalate.\n\n")
		return
	}
	if strings.TrimSpace(node.RepositoryID) != "" {
		b.WriteString("- Write scope is limited to target repository " + strings.TrimSpace(node.RepositoryID) + ".\n")
	}
	writeGuardrailList(b, "Allowed file scope", node.ExpectedFiles, "No expected file scope was provided; stop before editing and request a narrower plan.")
	writeGuardrailList(b, "Forbidden scope", node.NonGoals, "No explicit non-goals were provided; infer the narrowest safe scope from the PR node goal and acceptance criteria.")
	if bundle != nil && bundle.ProjectContext != nil && len(bundle.ProjectContext.ReadOnlyRepositoryIDs) > 0 {
		b.WriteString("- Read-only repositories may be inspected for context but must not be modified: " + strings.Join(normalizePlanList(bundle.ProjectContext.ReadOnlyRepositoryIDs), ", ") + ".\n")
	}
	b.WriteString("- Do not edit secrets, generated dependency locks, unrelated docs, formatting-only files, or broad shared infrastructure unless listed in expected files.\n")
	b.WriteString("- Keep the implementation smaller than the planned PR boundary; create an escalation if the diff needs database + API + UI + integration changes in one node.\n\n")
}

func writeGuardrailList(b *strings.Builder, label string, values []string, fallback string) {
	values = normalizePlanList(values)
	if len(values) == 0 {
		b.WriteString("- " + label + ": " + fallback + "\n")
		return
	}
	b.WriteString("- " + label + ":\n")
	for _, value := range values {
		b.WriteString("  - " + compactPromptLine(value) + "\n")
	}
}

func writeDAGGuardrails(b *strings.Builder, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode) {
	b.WriteString("PR DAG guardrails:\n")
	notes := reviewPRDAG(nil)
	if bundle != nil {
		notes = reviewPRDAG(bundle.PRNodes)
	}
	for _, note := range notes {
		b.WriteString("- " + compactPromptLine(note) + "\n")
	}
	if node != nil && len(normalizePlanList(node.DependsOn)) > 0 {
		b.WriteString("- Dependency evidence required before implementation: " + strings.Join(normalizePlanList(node.DependsOn), ", ") + ".\n")
	} else {
		b.WriteString("- This node has no declared PR dependencies.\n")
	}
	b.WriteString("- Do not implement downstream node work just because this node unblocks it.\n\n")
}

func writeVerificationContract(b *strings.Builder, bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode) {
	b.WriteString("Verification contract:\n")
	if node == nil {
		b.WriteString("- No PR node was provided; stop and escalate.\n\n")
		return
	}
	writeGuardrailList(b, "Required local commands", node.TestCommands, "No explicit test commands were provided; inspect repo profile and run the smallest relevant validation.")
	if bundle != nil && bundle.RepoProfile != nil && len(bundle.RepoProfile.TestCommands) > 0 {
		b.WriteString("- Repo profile test commands are available as supporting evidence: " + strings.Join(normalizePlanList(bundle.RepoProfile.TestCommands), ", ") + ".\n")
	}
	b.WriteString("- PR description must include summary, scope, non-goals, evidence refs used, tests run, and remaining risk.\n")
	b.WriteString("- If a required command cannot run, record the exact blocker and do not mark the PR ready for review.\n\n")
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

func compactPromptLine(value string) string {
	value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
	if len(value) <= 240 {
		return value
	}
	return strings.TrimSpace(value[:237]) + "..."
}

func writeProjectContext(b *strings.Builder, context *domain.SpecForgeProjectContext) {
	if context == nil || context.Project == nil {
		return
	}
	b.WriteString("Project context:\n")
	b.WriteString("- Project: " + context.Project.Name + "\n")
	if strings.TrimSpace(context.PrimaryRepositoryID) != "" {
		b.WriteString("- Primary repository: " + strings.TrimSpace(context.PrimaryRepositoryID) + "\n")
	}
	if len(context.ReadOnlyRepositoryIDs) > 0 {
		b.WriteString("- Read-only repositories: " + strings.Join(normalizePlanList(context.ReadOnlyRepositoryIDs), ", ") + "\n")
	}
	for _, guardrail := range context.ExecutionGuardrails {
		if strings.TrimSpace(guardrail) != "" {
			b.WriteString("- Guardrail: " + strings.TrimSpace(guardrail) + "\n")
		}
	}
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
		writeArchitectureContext(b, repoContext)
	}
	b.WriteString("\n")
}

func writeArchitectureContext(b *strings.Builder, repoContext *domain.SpecForgeProjectRepositoryContext) {
	if repoContext == nil || repoContext.Repository == nil {
		return
	}
	if repoContext.ArchitectureSnapshot == nil {
		if len(repoContext.ArchitectureWarnings) == 0 {
			return
		}
		b.WriteString("  - Architecture snapshot: missing\n")
		for _, warning := range repoContext.ArchitectureWarnings {
			if strings.TrimSpace(warning) != "" {
				b.WriteString("  - Architecture warning: " + compactPromptLine(warning) + "\n")
			}
		}
		return
	}
	snapshot := repoContext.ArchitectureSnapshot
	b.WriteString("  - Architecture snapshot commit: " + compactPromptLine(snapshot.CommitSHA) + "\n")
	if strings.TrimSpace(snapshot.Summary) != "" {
		b.WriteString("  - Architecture summary: " + compactPromptLine(snapshot.Summary) + "\n")
	}
	writeIndentedList(b, "Architecture modules", snapshot.Modules)
	writeIndentedList(b, "Architecture entrypoints", snapshot.Entrypoints)
	writeIndentedList(b, "Architecture CI workflows", snapshot.CIWorkflows)
	for _, warning := range normalizePlanList(append(snapshot.Warnings, repoContext.ArchitectureWarnings...)) {
		b.WriteString("  - Architecture warning: " + compactPromptLine(warning) + "\n")
	}
}

func writeIndentedList(b *strings.Builder, label string, values []string) {
	values = normalizePlanList(values)
	if len(values) == 0 {
		return
	}
	b.WriteString("  - " + label + ": " + strings.Join(values, ", ") + "\n")
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
	if strings.TrimSpace(context.PrimaryRepositoryID) != "" {
		return strings.TrimSpace(context.PrimaryRepositoryID)
	}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil || !repoContext.Repository.Active {
			continue
		}
		repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
		if repositoryID == "" {
			continue
		}
		if repoContext.Repository.Role == domain.ProjectRepositoryRolePrimary {
			return repositoryID
		}
	}
	for _, repository := range context.Repositories {
		if repository == nil || !repository.Active || strings.TrimSpace(repository.RepositoryID) == "" {
			continue
		}
		if repository.Role == domain.ProjectRepositoryRolePrimary {
			return strings.TrimSpace(repository.RepositoryID)
		}
	}
	return ""
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

func skillsFromProjectSkills(projectSkills []*domain.SpecForgeProjectSkill) []*domain.SpecForgeSkill {
	skills := make([]*domain.SpecForgeSkill, 0, len(projectSkills))
	seen := map[uint]struct{}{}
	for _, projectSkill := range projectSkills {
		if projectSkill == nil || !projectSkill.Active || projectSkill.Skill == nil || !projectSkill.Skill.Active {
			continue
		}
		if _, ok := seen[projectSkill.Skill.ID]; ok {
			continue
		}
		seen[projectSkill.Skill.ID] = struct{}{}
		skills = append(skills, projectSkill.Skill)
	}
	return skills
}

func plannedSkillRuns(userID uint, requirementID, planID, projectID *uint, bundle *domain.SpecForgePlanBundle, skills []*domain.SpecForgeSkill, now time.Time) []*domain.SpecForgeSkillRun {
	stages := []struct {
		stage  string
		output string
	}{
		{stage: domain.SkillRunStageProductPlan, output: skillRunProductOutput(bundle)},
		{stage: domain.SkillRunStageTechnicalPlan, output: skillRunTechnicalOutput(bundle)},
		{stage: domain.SkillRunStagePRDAG, output: skillRunPRDAGOutput(bundle)},
		{stage: domain.SkillRunStageSelfReview, output: strings.Join(reviewPRDAG(bundle.PRNodes), "\n")},
	}
	inputSummary := skillRunInputSummary(bundle, skills)
	outputJSON := skillRunOutputJSON(bundle, skills)
	runs := make([]*domain.SpecForgeSkillRun, 0, len(stages))
	for _, stage := range stages {
		started := now
		completed := now
		runs = append(runs, &domain.SpecForgeSkillRun{
			RequirementID: requirementID,
			PlanID:        planID,
			ProjectID:     projectID,
			Stage:         stage.stage,
			Status:        domain.SkillRunStatusCompleted,
			InputSummary:  inputSummary,
			OutputSummary: strings.TrimSpace(stage.output),
			OutputJSON:    outputJSON,
			EvidenceRefs:  skillRunEvidenceRefs(stage.stage, bundle, skills),
			StartedAt:     &started,
			CompletedAt:   &completed,
			CreatedBy:     userID,
		})
	}
	return runs
}

func skillRunEvidenceRefs(stage string, bundle *domain.SpecForgePlanBundle, skills []*domain.SpecForgeSkill) []string {
	refs := evidenceRefsFor(bundle, nil, skills)
	stage = strings.TrimSpace(stage)
	if stage != "" {
		refs = append(refs, "skill_run.stage:"+stage)
	}
	return normalizePlanList(refs)
}

func evidenceRefsFor(bundle *domain.SpecForgePlanBundle, node *domain.SpecForgePRNode, skills []*domain.SpecForgeSkill) []string {
	refs := []string{}
	if bundle != nil {
		if bundle.Requirement != nil && bundle.Requirement.ID != 0 {
			refs = append(refs, fmt.Sprintf("requirement:%d", bundle.Requirement.ID))
			if bundle.Requirement.ProjectID != 0 {
				refs = append(refs, fmt.Sprintf("project:%d", bundle.Requirement.ProjectID))
			}
		}
		if bundle.Idea != nil {
			if bundle.Idea.ID != 0 {
				refs = append(refs, fmt.Sprintf("idea:%d", bundle.Idea.ID))
			}
			if strings.TrimSpace(bundle.Idea.RepositoryID) != "" {
				refs = append(refs, "repository:"+strings.TrimSpace(bundle.Idea.RepositoryID))
			}
			if bundle.Idea.ProjectID != nil && *bundle.Idea.ProjectID != 0 {
				refs = append(refs, fmt.Sprintf("project:%d", *bundle.Idea.ProjectID))
			}
		}
		if bundle.ProductSpec != nil && bundle.ProductSpec.ID != 0 {
			refs = append(refs,
				fmt.Sprintf("product_spec:%d:goals", bundle.ProductSpec.ID),
				fmt.Sprintf("product_spec:%d:acceptance_criteria", bundle.ProductSpec.ID),
			)
		}
		if bundle.Plan != nil && bundle.Plan.ID != 0 {
			version := bundle.Plan.Version
			if version <= 0 {
				version = 1
			}
			refs = append(refs,
				fmt.Sprintf("implementation_plan:%d:v%d", bundle.Plan.ID, version),
				fmt.Sprintf("implementation_plan:%d:test_strategy", bundle.Plan.ID),
			)
		}
		if bundle.RepoProfile != nil && strings.TrimSpace(bundle.RepoProfile.RepositoryID) != "" {
			refs = append(refs, "repo_profile:"+strings.TrimSpace(bundle.RepoProfile.RepositoryID))
			if strings.TrimSpace(bundle.RepoProfile.Source) != "" {
				refs = append(refs, "repo_profile_source:"+strings.TrimSpace(bundle.RepoProfile.Source))
			}
		}
		if bundle.ProjectContext != nil {
			refs = append(refs, projectContextEvidenceRefs(bundle.ProjectContext)...)
		}
	}
	if node != nil {
		if node.ID != 0 {
			refs = append(refs, fmt.Sprintf("pr_node:%d", node.ID))
		}
		if strings.TrimSpace(node.NodeKey) != "" {
			refs = append(refs, "pr_node_key:"+strings.TrimSpace(node.NodeKey))
		}
		if strings.TrimSpace(node.RepositoryID) != "" {
			refs = append(refs, "target_repository:"+strings.TrimSpace(node.RepositoryID))
		}
	}
	for _, skill := range skills {
		if skill == nil || skill.ID == 0 {
			continue
		}
		refs = append(refs, fmt.Sprintf("skill:%d", skill.ID))
	}
	return normalizePlanList(refs)
}

func projectContextEvidenceRefs(context *domain.SpecForgeProjectContext) []string {
	if context == nil {
		return []string{}
	}
	refs := []string{}
	if context.Project != nil && context.Project.ID != 0 {
		refs = append(refs, fmt.Sprintf("project:%d", context.Project.ID))
	}
	if strings.TrimSpace(context.PrimaryRepositoryID) != "" {
		refs = append(refs, "project_primary_repository:"+strings.TrimSpace(context.PrimaryRepositoryID))
	}
	for _, repositoryID := range normalizePlanList(context.ReadOnlyRepositoryIDs) {
		refs = append(refs, "project_read_only_repository:"+repositoryID)
	}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil {
			continue
		}
		repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
		if repositoryID == "" {
			continue
		}
		refs = append(refs, "project_repository:"+repositoryID+":role:"+strings.TrimSpace(repoContext.Repository.Role))
		if repoContext.Profile != nil {
			refs = append(refs, "repo_profile:"+repositoryID)
		}
		refs = append(refs, architectureEvidenceRefsFor(repoContext)...)
	}
	return refs
}

func architectureEvidenceRefsFor(repoContext *domain.SpecForgeProjectRepositoryContext) []string {
	if repoContext == nil || repoContext.Repository == nil || repoContext.ArchitectureSnapshot == nil {
		return nil
	}
	repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
	if repositoryID == "" {
		return nil
	}
	snapshot := repoContext.ArchitectureSnapshot
	refs := []string{}
	if strings.TrimSpace(snapshot.CommitSHA) != "" {
		refs = append(refs, "architecture_snapshot:"+repositoryID+":"+strings.TrimSpace(snapshot.CommitSHA))
	}
	if len(normalizePlanList(snapshot.Modules)) > 0 {
		refs = append(refs, "architecture_snapshot:"+repositoryID+":modules")
	}
	if len(normalizePlanList(snapshot.Entrypoints)) > 0 {
		refs = append(refs, "architecture_snapshot:"+repositoryID+":entrypoints")
	}
	if len(normalizePlanList(snapshot.CIWorkflows)) > 0 {
		refs = append(refs, "architecture_snapshot:"+repositoryID+":ci_workflows")
	}
	if len(normalizePlanList(append(snapshot.Warnings, repoContext.ArchitectureWarnings...))) > 0 {
		refs = append(refs, "architecture_snapshot:"+repositoryID+":warnings")
	}
	return refs
}

func skillRunInputSummary(bundle *domain.SpecForgePlanBundle, skills []*domain.SpecForgeSkill) string {
	parts := []string{}
	if bundle != nil && bundle.Idea != nil {
		parts = append(parts, "Idea: "+strings.TrimSpace(bundle.Idea.RawInput))
		parts = append(parts, "Repository: "+strings.TrimSpace(bundle.Idea.RepositoryID))
	}
	if bundle != nil && bundle.Requirement != nil {
		parts = append(parts, fmt.Sprintf("Requirement: %d", bundle.Requirement.ID))
	}
	if bundle != nil && bundle.ProjectContext != nil && bundle.ProjectContext.Project != nil {
		parts = append(parts, "Project: "+bundle.ProjectContext.Project.Name)
	}
	parts = append(parts, fmt.Sprintf("Active skills: %d", len(skills)))
	return strings.Join(normalizePlanList(parts), "\n")
}

func skillRunProductOutput(bundle *domain.SpecForgePlanBundle) string {
	if bundle == nil || bundle.ProductSpec == nil {
		return ""
	}
	return strings.Join(normalizePlanList(append([]string{}, bundle.ProductSpec.Goals...)), "\n")
}

func skillRunTechnicalOutput(bundle *domain.SpecForgePlanBundle) string {
	if bundle == nil || bundle.Plan == nil {
		return ""
	}
	values := []string{bundle.Plan.TechnicalSummary}
	values = append(values, bundle.Plan.AffectedAreas...)
	values = append(values, bundle.Plan.TestStrategy...)
	return strings.Join(normalizePlanList(values), "\n")
}

func skillRunPRDAGOutput(bundle *domain.SpecForgePlanBundle) string {
	if bundle == nil {
		return ""
	}
	values := []string{}
	for _, node := range bundle.PRNodes {
		if node == nil {
			continue
		}
		values = append(values, fmt.Sprintf("%s: %s", node.NodeKey, node.Title))
	}
	return strings.Join(normalizePlanList(values), "\n")
}

func skillRunOutputJSON(bundle *domain.SpecForgePlanBundle, skills []*domain.SpecForgeSkill) string {
	payload := struct {
		SkillNames []string `json:"skill_names"`
		PRNodes    []string `json:"pr_nodes"`
	}{
		SkillNames: []string{},
		PRNodes:    []string{},
	}
	for _, skill := range skills {
		if skill != nil && strings.TrimSpace(skill.Name) != "" {
			payload.SkillNames = append(payload.SkillNames, strings.TrimSpace(skill.Name))
		}
	}
	if bundle != nil {
		for _, node := range bundle.PRNodes {
			if node != nil {
				payload.PRNodes = append(payload.PRNodes, node.NodeKey)
			}
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(encoded)
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
	primaryRepoID := primaryRepositoryID(context)
	if primaryRepoID == "" {
		return fmt.Sprintf("Plan generation used project context for %s across %d active repositories, but no active primary repository was available.", context.Project.Name, count)
	}
	return fmt.Sprintf("Plan generation used project context for %s across %d active repositories; execution is limited to primary repository %s.", context.Project.Name, count, primaryRepoID)
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
