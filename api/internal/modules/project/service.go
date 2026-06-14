package project

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

type Service interface {
	CreateProject(ctx context.Context, userID uint, req *CreateProjectRequest) (*domain.SpecForgeProject, error)
	UpdateProject(ctx context.Context, projectID uint, req *UpdateProjectRequest) (*domain.SpecForgeProject, error)
	DeleteProject(ctx context.Context, projectID uint) error
	GetProject(ctx context.Context, projectID uint) (*domain.SpecForgeProject, error)
	ListProjects(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error)
	BindRepository(ctx context.Context, userID, projectID uint, req *BindRepositoryRequest) (*domain.SpecForgeProjectRepository, error)
	UnbindRepository(ctx context.Context, projectID uint, repositoryID string) error
	ListRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error)
	ListRepositoryOptions(ctx context.Context, projectID uint) ([]*ProjectRepositoryOption, error)
	GetProjectContext(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error)
	GetProjectReadiness(ctx context.Context, projectID uint) (*domain.SpecForgeProjectReadiness, error)
	RefreshProjectContext(ctx context.Context, userID, projectID uint) (*domain.SpecForgeProjectContextSnapshot, error)
	ListProjectDeepWiki(ctx context.Context, userID, projectID uint) ([]*ProjectRepositoryDeepWikiResponse, error)
	ReindexProjectRepositoryDeepWiki(ctx context.Context, userID, projectID uint, repositoryID string) (*ProjectRepositoryDeepWikiResponse, error)
	DeleteProjectRepositoryDeepWiki(ctx context.Context, userID, projectID uint, repositoryID string) error
	GetProjectExpertPolicy(ctx context.Context, projectID uint) (*domain.SpecForgeProjectExpertPolicy, error)
	CreateProjectExpertPolicy(ctx context.Context, userID, projectID uint, req *UpsertProjectExpertPolicyRequest) (*domain.SpecForgeProjectExpertPolicy, error)
	UpdateProjectExpertPolicy(ctx context.Context, userID, projectID, policyID uint, req *UpsertProjectExpertPolicyRequest) (*domain.SpecForgeProjectExpertPolicy, error)
	ListProjectRuntimeBindings(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRuntimeBindingStatus, error)
	CreateProjectRuntimeBinding(ctx context.Context, userID, projectID uint, req *UpsertProjectRuntimeBindingRequest) (*domain.SpecForgeProjectRuntimeBindingStatus, error)
	UpdateProjectRuntimeBinding(ctx context.Context, userID, projectID, bindingID uint, req *UpsertProjectRuntimeBindingRequest) (*domain.SpecForgeProjectRuntimeBindingStatus, error)
}

type service struct {
	repo             domain.SpecForgeProjectRepositoryStore
	workspaceRepo    domain.WorkspaceRepository
	githubRepo       domain.GitHubIntegrationRepository
	profileRepo      domain.SpecForgeRepoProfileRepository
	architectureRepo repoArchitectureStore
	skillRepo        domain.SpecForgeSkillRepository
	projectSkillRepo projectSkillStore
	githubReadiness  githubReadinessChecker
	runtimeReadiness runtimeReadinessStore
	deepwikiStore    projectDeepWikiStore
	deepwikiIndexer  projectDeepWikiIndexer
}

type repoArchitectureStore interface {
	FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error)
}

type projectSkillStore interface {
	ListActiveProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error)
}

type githubReadinessChecker interface {
	CheckRepositoryReadiness(ctx context.Context, repositoryID string) (*githubintegration.GitHubRepositoryReadinessResponse, error)
}

type githubRepositoryAccessStore interface {
	ListRepositoryAccesses(ctx context.Context, workspaceID, sourceType, organizationLogin, query string) ([]*domain.GitHubRepositoryAccess, error)
	FindRepositoryAccessByID(ctx context.Context, id uint) (*domain.GitHubRepositoryAccess, error)
}

type runtimeReadinessStore interface {
	ListRuntimes(ctx context.Context, executor, status string, limit int) ([]*domain.SpecForgeRuntime, error)
	FindRuntimeByRuntimeID(ctx context.Context, runtimeID string) (*domain.SpecForgeRuntime, error)
	CreateProjectRuntimeBinding(ctx context.Context, binding *domain.SpecForgeProjectRuntimeBinding) error
	UpdateProjectRuntimeBinding(ctx context.Context, binding *domain.SpecForgeProjectRuntimeBinding) error
	FindProjectRuntimeBindingByID(ctx context.Context, bindingID uint) (*domain.SpecForgeProjectRuntimeBinding, error)
	ListProjectRuntimeBindingsByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRuntimeBinding, error)
}

type projectDeepWikiStore interface {
	ListSources(ctx context.Context, filter domain.DeepWikiSourceFilter, page, pageSize int) ([]*domain.DeepWikiSource, int64, error)
	FindLatestIndexBySourceID(ctx context.Context, sourceID uint) (*domain.DeepWikiIndex, error)
	ListPagesByIndexID(ctx context.Context, indexID uint) ([]*domain.DeepWikiPage, error)
}

type projectDeepWikiIndexer interface {
	EnsureRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error)
	ReindexRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error)
	DeleteRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) error
}

func NewService(
	repo domain.SpecForgeProjectRepositoryStore,
	workspaceRepo domain.WorkspaceRepository,
	githubRepo domain.GitHubIntegrationRepository,
	profileRepo domain.SpecForgeRepoProfileRepository,
	skillRepo domain.SpecForgeSkillRepository,
	projectSkillRepo projectSkillStore,
	githubReadiness githubReadinessChecker,
	runtimeReadiness runtimeReadinessStore,
	deepwikiStore projectDeepWikiStore,
) *service {
	return newService(repo, workspaceRepo, githubRepo, profileRepo, skillRepo, projectSkillRepo, githubReadiness, runtimeReadiness, deepwikiStore, nil)
}

func NewServiceWithDeepWikiIndexer(
	repo domain.SpecForgeProjectRepositoryStore,
	workspaceRepo domain.WorkspaceRepository,
	githubRepo domain.GitHubIntegrationRepository,
	profileRepo domain.SpecForgeRepoProfileRepository,
	skillRepo domain.SpecForgeSkillRepository,
	projectSkillRepo projectSkillStore,
	githubReadiness githubReadinessChecker,
	runtimeReadiness runtimeReadinessStore,
	deepwikiStore projectDeepWikiStore,
	deepwikiIndexer projectDeepWikiIndexer,
) *service {
	return newService(repo, workspaceRepo, githubRepo, profileRepo, skillRepo, projectSkillRepo, githubReadiness, runtimeReadiness, deepwikiStore, deepwikiIndexer)
}

func newService(
	repo domain.SpecForgeProjectRepositoryStore,
	workspaceRepo domain.WorkspaceRepository,
	githubRepo domain.GitHubIntegrationRepository,
	profileRepo domain.SpecForgeRepoProfileRepository,
	skillRepo domain.SpecForgeSkillRepository,
	projectSkillRepo projectSkillStore,
	githubReadiness githubReadinessChecker,
	runtimeReadiness runtimeReadinessStore,
	deepwikiStore projectDeepWikiStore,
	deepwikiIndexer projectDeepWikiIndexer,
) *service {
	var architectureRepo repoArchitectureStore
	if repo, ok := profileRepo.(repoArchitectureStore); ok {
		architectureRepo = repo
	}
	return &service{
		repo:             repo,
		workspaceRepo:    workspaceRepo,
		githubRepo:       githubRepo,
		profileRepo:      profileRepo,
		architectureRepo: architectureRepo,
		skillRepo:        skillRepo,
		projectSkillRepo: projectSkillRepo,
		githubReadiness:  githubReadiness,
		runtimeReadiness: runtimeReadiness,
		deepwikiStore:    deepwikiStore,
		deepwikiIndexer:  deepwikiIndexer,
	}
}

func (s *service) CreateProject(ctx context.Context, userID uint, req *CreateProjectRequest) (*domain.SpecForgeProject, error) {
	workspace, err := s.resolveActiveWorkspace(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	workspaceID := workspace.WorkspaceID
	slug := normalizeSlug(req.Slug)
	name := strings.TrimSpace(req.Name)
	if workspaceID == "" || slug == "" || name == "" {
		return nil, domain.ErrInvalidInput
	}

	if _, err := s.repo.FindProjectByWorkspaceAndSlug(ctx, workspaceID, slug); err == nil {
		return nil, domain.ErrConflict
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	project := &domain.SpecForgeProject{
		WorkspaceID: workspaceID,
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(req.Description),
		Status:      domain.ProjectStatusActive,
		CreatedBy:   userID,
	}
	if err := s.repo.CreateProject(ctx, project); err != nil {
		return nil, err
	}
	return project, nil
}

func (s *service) UpdateProject(ctx context.Context, projectID uint, req *UpdateProjectRequest) (*domain.SpecForgeProject, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, domain.ErrInvalidInput
		}
		project.Name = name
	}
	if req.Slug != nil {
		slug := normalizeSlug(*req.Slug)
		if slug == "" {
			return nil, domain.ErrInvalidInput
		}
		existing, err := s.repo.FindProjectByWorkspaceAndSlug(ctx, project.WorkspaceID, slug)
		if err == nil && existing.ID != project.ID {
			return nil, domain.ErrConflict
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		project.Slug = slug
	}
	if req.Description != nil {
		project.Description = strings.TrimSpace(*req.Description)
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if status != domain.ProjectStatusActive && status != domain.ProjectStatusArchived {
			return nil, domain.ErrInvalidInput
		}
		project.Status = status
	}
	if err := s.repo.UpdateProject(ctx, project); err != nil {
		return nil, err
	}
	return project, nil
}

func (s *service) DeleteProject(ctx context.Context, projectID uint) error {
	if _, err := s.repo.FindProjectByID(ctx, projectID); err != nil {
		return err
	}
	return s.repo.DeleteProject(ctx, projectID)
}

func (s *service) GetProject(ctx context.Context, projectID uint) (*domain.SpecForgeProject, error) {
	return s.repo.FindProjectByID(ctx, projectID)
}

func (s *service) ListProjects(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	workspace, err := s.resolveActiveWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	return s.repo.ListProjectsByWorkspace(ctx, workspace.WorkspaceID)
}

func (s *service) BindRepository(ctx context.Context, userID, projectID uint, req *BindRepositoryRequest) (*domain.SpecForgeProjectRepository, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if project.Status != domain.ProjectStatusActive {
		return nil, domain.ErrInvalidInput
	}

	repositoryID := strings.TrimSpace(req.RepositoryID)
	role := strings.TrimSpace(req.Role)
	if !validRepositoryRole(role) || repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}

	repository, err := s.githubRepo.FindRepositoryByRepositoryID(ctx, repositoryID)
	if err != nil {
		return nil, err
	}
	if repository.WorkspaceID != project.WorkspaceID {
		return nil, domain.ErrPermissionDenied
	}
	if err := s.validateOAuthRepositoryAccess(ctx, project.WorkspaceID, repository); err != nil {
		return nil, err
	}

	if _, err := s.repo.FindProjectRepository(ctx, projectID, repositoryID); err == nil {
		return nil, domain.ErrConflict
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	count, err := s.repo.CountActiveProjectRepositories(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if count >= domain.MaxSpecForgeProjectRepositories {
		return nil, fmt.Errorf("%w: project repository limit reached", domain.ErrInvalidInput)
	}

	if role == domain.ProjectRepositoryRolePrimary {
		if _, err := s.repo.FindActivePrimaryProjectRepository(ctx, projectID); err == nil {
			return nil, fmt.Errorf("%w: project already has a primary repository", domain.ErrConflict)
		} else if !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
	}

	binding := &domain.SpecForgeProjectRepository{
		WorkspaceID:  project.WorkspaceID,
		ProjectID:    projectID,
		RepositoryID: repositoryID,
		Role:         role,
		Active:       true,
		CreatedBy:    userID,
	}
	if err := s.repo.CreateProjectRepository(ctx, binding); err != nil {
		return nil, err
	}
	s.ensureRepositoryDeepWikiAfterBind(ctx, userID, project, binding, repository)
	return binding, nil
}

func (s *service) UnbindRepository(ctx context.Context, projectID uint, repositoryID string) error {
	binding, err := s.repo.FindProjectRepository(ctx, projectID, strings.TrimSpace(repositoryID))
	if err != nil {
		return err
	}
	if binding.Role == domain.ProjectRepositoryRolePrimary {
		bindings, err := s.repo.ListProjectRepositories(ctx, projectID)
		if err != nil {
			return err
		}
		activePrimaryCount := 0
		for _, candidate := range bindings {
			if candidate.Active && candidate.Role == domain.ProjectRepositoryRolePrimary {
				activePrimaryCount++
			}
		}
		if activePrimaryCount <= 1 {
			return fmt.Errorf("%w: cannot remove the last primary repository", domain.ErrInvalidInput)
		}
	}
	return s.repo.DeleteProjectRepository(ctx, projectID, binding.RepositoryID)
}

func (s *service) ensureRepositoryDeepWikiAfterBind(ctx context.Context, userID uint, project *domain.SpecForgeProject, binding *domain.SpecForgeProjectRepository, repository *domain.Repository) {
	if s.deepwikiIndexer == nil || project == nil || binding == nil || repository == nil || !binding.Active {
		return
	}
	if _, _, err := s.deepwikiIndexer.EnsureRepositoryWiki(ctx, userID, project.ID, repository); err != nil {
		return
	}
	_, _ = s.RefreshProjectContext(ctx, userID, project.ID)
}

func (s *service) projectRepositoryDeepWikiTarget(ctx context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProject, *domain.SpecForgeProjectRepository, *domain.Repository, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, nil, nil, err
	}
	binding, err := s.repo.FindProjectRepository(ctx, projectID, strings.TrimSpace(repositoryID))
	if err != nil {
		return nil, nil, nil, err
	}
	if !binding.Active {
		return nil, nil, nil, domain.ErrInvalidInput
	}
	repository, err := s.githubRepo.FindRepositoryByRepositoryID(ctx, binding.RepositoryID)
	if err != nil {
		return nil, nil, nil, err
	}
	if repository.WorkspaceID != project.WorkspaceID {
		return nil, nil, nil, domain.ErrPermissionDenied
	}
	return project, binding, repository, nil
}

func (s *service) ListRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	if _, err := s.repo.FindProjectByID(ctx, projectID); err != nil {
		return nil, err
	}
	return s.repo.ListProjectRepositories(ctx, projectID)
}

func (s *service) ListRepositoryOptions(ctx context.Context, projectID uint) ([]*ProjectRepositoryOption, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	store, ok := s.githubRepo.(githubRepositoryAccessStore)
	if !ok || store == nil {
		return []*ProjectRepositoryOption{}, nil
	}
	accesses, err := store.ListRepositoryAccesses(ctx, project.WorkspaceID, "", "", "")
	if err != nil {
		return nil, fmt.Errorf("list github repository access options: %w", err)
	}
	bindings, err := s.repo.ListProjectRepositories(ctx, projectID)
	if err != nil {
		return nil, err
	}
	bound := map[string]*domain.SpecForgeProjectRepository{}
	for _, binding := range bindings {
		if binding == nil {
			continue
		}
		bound[strings.TrimSpace(binding.RepositoryID)] = binding
	}
	options := make([]*ProjectRepositoryOption, 0, len(accesses))
	for _, access := range accesses {
		if access == nil {
			continue
		}
		repositoryID := projectGitHubRepositoryID(access.OwnerLogin, access.RepoName)
		if repositoryID == "" {
			continue
		}
		binding := bound[repositoryID]
		writable := repositoryAccessWritable(access)
		option := &ProjectRepositoryOption{
			RepositoryID: repositoryID,
			Access:       access,
			AlreadyBound: binding != nil && binding.Active,
			Writable:     writable,
			Selectable:   binding == nil || !binding.Active,
		}
		if binding != nil {
			option.BoundRole = binding.Role
		}
		switch {
		case access.Archived || access.Disabled:
			option.Selectable = false
			option.DisabledReason = "Repository is archived or disabled."
		case option.AlreadyBound:
			option.DisabledReason = "Repository is already bound to this project."
		}
		options = append(options, option)
	}
	return options, nil
}

func (s *service) GetProjectContext(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error) {
	context, err := s.projectContextBundle(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if context == nil {
		return nil, domain.ErrNotFound
	}
	latestSnapshot, err := s.repo.FindLatestProjectContextSnapshot(ctx, projectID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("load latest project context snapshot: %w", err)
	}
	context.LatestSnapshot = latestSnapshot
	return context, nil
}

func (s *service) GetProjectReadiness(ctx context.Context, projectID uint) (*domain.SpecForgeProjectReadiness, error) {
	contextBundle, err := s.GetProjectContext(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if contextBundle == nil || contextBundle.Project == nil {
		return nil, domain.ErrNotFound
	}

	baseReadiness := contextBundle.Readiness
	if baseReadiness == nil {
		baseReadiness = &domain.SpecForgeProjectContextReadiness{}
	}
	skillCount := baseReadiness.SkillCount
	if s.projectSkillRepo != nil {
		projectSkills, err := s.projectSkillRepo.ListActiveProjectSkillsByProjectID(ctx, projectID)
		if err != nil {
			return nil, fmt.Errorf("load active project skills: %w", err)
		}
		skillCount += len(projectSkills)
	}

	checks := make([]domain.SpecForgeProjectReadinessCheck, 0, 6)
	warnings := collectProjectContextWarnings(contextBundle)
	guardrails := append([]string(nil), baseReadiness.Guardrails...)

	hasPrimary := strings.TrimSpace(contextBundle.PrimaryRepositoryID) != ""
	primaryDetail := fmt.Sprintf("%d active repositories bound.", baseReadiness.ActiveRepositoryCount)
	if hasPrimary {
		primaryDetail = "Primary execution repository: " + strings.TrimSpace(contextBundle.PrimaryRepositoryID)
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "primary_repository",
		Label:    "Primary repository",
		Status:   readinessCheckStatus(hasPrimary, false),
		Detail:   primaryDetail,
		Required: true,
	})

	githubReady := false
	githubCheckStatus := domain.ProjectReadinessStatusAttention
	githubDetail := "Bind a primary repository before checking GitHub delivery readiness."
	if hasPrimary {
		githubCheckStatus = domain.ProjectReadinessStatusBlocked
		githubDetail = "GitHub delivery readiness has not been checked yet."
		if s.githubReadiness != nil {
			result, err := s.githubReadiness.CheckRepositoryReadiness(ctx, contextBundle.PrimaryRepositoryID)
			if err != nil {
				githubDetail = "GitHub readiness check failed: " + strings.TrimSpace(err.Error())
				warnings = appendCompactProjectStrings(warnings, githubDetail)
			} else {
				githubReady = result.Ready
				githubCheckStatus = readinessCheckStatus(result.Ready, false)
				githubDetail = projectGitHubReadinessDetail(result)
			}
		}
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "github_delivery",
		Label:    "GitHub delivery",
		Status:   githubCheckStatus,
		Detail:   githubDetail,
		Required: true,
	})

	contextReady := hasPrimary && baseReadiness.WarningCount == 0
	contextDetail := "Repository profiles and architecture snapshots are ready."
	if !hasPrimary {
		contextDetail = "Context review starts after a primary repository is bound."
	} else if baseReadiness.WarningCount > 0 {
		contextDetail = fmt.Sprintf("%d context warnings need review before execution.", baseReadiness.WarningCount)
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "context_materials",
		Label:    "Context materials",
		Status:   readinessCheckStatus(contextReady, !hasPrimary),
		Detail:   contextDetail,
		Required: false,
	})

	runtimeCount := 0
	runtimeReady := false
	runtimeDetail := "No project runtime binding is configured yet."
	if s.runtimeReadiness != nil {
		runtimes, err := s.runtimeReadiness.ListRuntimes(ctx, "", domain.RuntimeStatusOnline, 20)
		if err != nil {
			runtimeDetail = "Runtime readiness check failed: " + strings.TrimSpace(err.Error())
			warnings = appendCompactProjectStrings(warnings, runtimeDetail)
		} else {
			runtimeCount = len(runtimes)
		}
		bindingStatuses, err := s.listProjectRuntimeBindingStatuses(ctx, projectID, contextBundle.PrimaryRepositoryID)
		if err != nil {
			return nil, fmt.Errorf("load project runtime bindings: %w", err)
		}
		eligibleCount := 0
		for _, bindingStatus := range bindingStatuses {
			if bindingStatus == nil {
				continue
			}
			if bindingStatus.Eligible {
				eligibleCount++
			}
			for _, warning := range bindingStatus.Warnings {
				warnings = appendCompactProjectStrings(warnings, warning)
			}
		}
		runtimeReady = eligibleCount > 0
		switch {
		case !hasPrimary:
			runtimeDetail = "Primary repository must be bound before a runtime can be attached."
		case len(bindingStatuses) == 0 && runtimeCount > 0:
			runtimeDetail = "Online runtimes exist, but this project still needs an explicit runtime binding."
		case len(bindingStatuses) == 0:
			runtimeDetail = "No project runtime binding targets the primary repository yet."
		case runtimeReady:
			runtimeDetail = fmt.Sprintf("%d runtime binding(s) are eligible for local execution.", eligibleCount)
		case len(bindingStatuses[0].Warnings) > 0:
			runtimeDetail = bindingStatuses[0].Warnings[0]
		default:
			runtimeDetail = "Configured runtime bindings are not eligible for local execution yet."
		}
		if runtimeReady && runtimeCount > 0 {
			runtimeDetail = fmt.Sprintf("%s (%d online runtime(s) detected).", runtimeDetail, runtimeCount)
		} else if runtimeCount > 0 && len(bindingStatuses) == 0 {
			runtimeDetail = fmt.Sprintf("%s (%d online runtime(s) detected).", runtimeDetail, runtimeCount)
		} else if runtimeCount == 0 && len(bindingStatuses) == 0 {
			runtimeDetail = "No online runtimes detected yet."
		}
		if runtimeReady && runtimeCount == 0 {
			runtimeDetail = "Runtime binding exists, but no online runtime heartbeat is available."
			runtimeReady = false
			warnings = appendCompactProjectStrings(warnings, runtimeDetail)
		}
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "runtime_dispatch",
		Label:    "Local runtime",
		Status:   readinessCheckStatus(runtimeReady, false),
		Detail:   runtimeDetail,
		Required: false,
	})

	skillReady := skillCount > 0
	skillDetail := "No active project or repository skills are configured yet."
	if skillReady {
		skillDetail = fmt.Sprintf("%d active project or repository skills are available for planning.", skillCount)
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "skill_contract",
		Label:    "Skill contract",
		Status:   readinessCheckStatus(skillReady, false),
		Detail:   skillDetail,
		Required: false,
	})

	expertPolicyReady := false
	expertPolicyDetail := "No active expert policy is configured yet."
	if policy, err := s.repo.FindActiveProjectExpertPolicyByProjectID(ctx, projectID); err != nil {
		if !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("load active expert policy: %w", err)
		}
	} else if policy != nil {
		expertPolicyReady = true
		expertPolicyDetail = fmt.Sprintf("Active expert policy v%d is ready for planning and review.", policy.Version)
	}
	checks = append(checks, domain.SpecForgeProjectReadinessCheck{
		Key:      "expert_policy",
		Label:    "Expert policy",
		Status:   readinessCheckStatus(expertPolicyReady, false),
		Detail:   expertPolicyDetail,
		Required: true,
	})

	status, nextStep, nextAction, summary := projectReadinessDecision(hasPrimary, githubReady, contextReady, runtimeReady, skillReady, expertPolicyReady)
	return &domain.SpecForgeProjectReadiness{
		ProjectID:               contextBundle.Project.ID,
		ReadinessStatus:         status,
		NextStep:                nextStep,
		NextAction:              nextAction,
		Summary:                 summary,
		PrimaryRepositoryID:     strings.TrimSpace(contextBundle.PrimaryRepositoryID),
		HasPrimaryRepository:    hasPrimary,
		ActiveRepositoryCount:   baseReadiness.ActiveRepositoryCount,
		ReadOnlyRepositoryCount: baseReadiness.ReadOnlyRepositoryCount,
		SkillCount:              skillCount,
		WarningCount:            baseReadiness.WarningCount,
		RuntimeCount:            runtimeCount,
		Checks:                  checks,
		Warnings:                warnings,
		Guardrails:              guardrails,
	}, nil
}

func (s *service) RefreshProjectContext(ctx context.Context, userID, projectID uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	contextBundle, err := s.projectContextBundle(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if contextBundle == nil || contextBundle.Project == nil {
		return nil, domain.ErrNotFound
	}

	snapshot, err := s.buildProjectContextSnapshot(ctx, userID, contextBundle)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateProjectContextSnapshot(ctx, snapshot); err != nil {
		return nil, fmt.Errorf("create project context snapshot: %w", err)
	}
	return snapshot, nil
}

func (s *service) ListProjectDeepWiki(ctx context.Context, userID, projectID uint) ([]*ProjectRepositoryDeepWikiResponse, error) {
	if userID == 0 {
		return nil, domain.ErrInvalidInput
	}
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	bindings, err := s.repo.ListProjectRepositories(ctx, projectID)
	if err != nil {
		return nil, err
	}
	out := make([]*ProjectRepositoryDeepWikiResponse, 0, len(bindings))
	for _, binding := range bindings {
		if binding == nil || !binding.Active {
			continue
		}
		item := &ProjectRepositoryDeepWikiResponse{
			ProjectID:    project.ID,
			WorkspaceID:  project.WorkspaceID,
			RepositoryID: binding.RepositoryID,
			Role:         binding.Role,
		}
		repository, err := s.githubRepo.FindRepositoryByRepositoryID(ctx, binding.RepositoryID)
		if err != nil {
			item.Error = err.Error()
			out = append(out, item)
			continue
		}
		if repository.WorkspaceID != project.WorkspaceID {
			item.Error = domain.ErrPermissionDenied.Error()
			out = append(out, item)
			continue
		}
		source, index, err := s.projectRepositoryDeepWikiState(ctx, project, repository)
		item.Source = projectDeepWikiSourceResponse(source)
		item.Index = projectDeepWikiIndexResponse(index)
		if err != nil {
			item.Error = err.Error()
		}
		if index != nil && s.deepwikiStore != nil {
			pages, err := s.deepwikiStore.ListPagesByIndexID(ctx, index.ID)
			if err == nil {
				item.Pages = projectDeepWikiPageSummaries(pages)
			} else if item.Error == "" {
				item.Error = err.Error()
			}
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *service) projectRepositoryDeepWikiState(ctx context.Context, project *domain.SpecForgeProject, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error) {
	if s.deepwikiStore == nil || project == nil || repository == nil {
		return nil, nil, nil
	}
	sources, _, err := s.deepwikiStore.ListSources(ctx, domain.DeepWikiSourceFilter{
		WorkspaceID:  strings.TrimSpace(project.WorkspaceID),
		RepositoryID: strings.TrimSpace(repository.RepositoryID),
		SourceType:   domain.DeepWikiSourceTypeGitHubRepository,
	}, 1, 1)
	if err != nil {
		return nil, nil, err
	}
	if len(sources) == 0 {
		return nil, nil, nil
	}
	source := sources[0]
	index, err := s.deepwikiStore.FindLatestIndexBySourceID(ctx, source.ID)
	if errors.Is(err, domain.ErrNotFound) {
		return source, nil, nil
	}
	if err != nil {
		return source, nil, err
	}
	return source, index, nil
}

func (s *service) ReindexProjectRepositoryDeepWiki(ctx context.Context, userID, projectID uint, repositoryID string) (*ProjectRepositoryDeepWikiResponse, error) {
	project, binding, repository, err := s.projectRepositoryDeepWikiTarget(ctx, projectID, repositoryID)
	if err != nil {
		return nil, err
	}
	if s.deepwikiIndexer == nil {
		return nil, domain.ErrInvalidInput
	}
	source, index, indexErr := s.deepwikiIndexer.ReindexRepositoryWiki(ctx, userID, project.ID, repository)
	item := &ProjectRepositoryDeepWikiResponse{
		ProjectID:    project.ID,
		WorkspaceID:  project.WorkspaceID,
		RepositoryID: binding.RepositoryID,
		Role:         binding.Role,
		Source:       projectDeepWikiSourceResponse(source),
		Index:        projectDeepWikiIndexResponse(index),
	}
	if index != nil && s.deepwikiStore != nil {
		pages, err := s.deepwikiStore.ListPagesByIndexID(ctx, index.ID)
		if err == nil {
			item.Pages = projectDeepWikiPageSummaries(pages)
		} else {
			item.Error = err.Error()
		}
	}
	if indexErr != nil {
		item.Error = indexErr.Error()
		return item, nil
	}
	if _, err := s.RefreshProjectContext(ctx, userID, project.ID); err != nil && item.Error == "" {
		item.Error = err.Error()
	}
	return item, nil
}

func (s *service) DeleteProjectRepositoryDeepWiki(ctx context.Context, userID, projectID uint, repositoryID string) error {
	project, _, repository, err := s.projectRepositoryDeepWikiTarget(ctx, projectID, repositoryID)
	if err != nil {
		return err
	}
	if s.deepwikiIndexer == nil {
		return domain.ErrInvalidInput
	}
	if err := s.deepwikiIndexer.DeleteRepositoryWiki(ctx, userID, project.ID, repository); err != nil {
		return err
	}
	if _, err := s.RefreshProjectContext(ctx, userID, project.ID); err != nil && !errors.Is(err, domain.ErrNotFound) {
		return err
	}
	return nil
}

func (s *service) GetProjectExpertPolicy(ctx context.Context, projectID uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	if _, err := s.repo.FindProjectByID(ctx, projectID); err != nil {
		return nil, err
	}
	policy, err := s.repo.FindActiveProjectExpertPolicyByProjectID(ctx, projectID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("load active project expert policy: %w", err)
	}
	return policy, nil
}

func (s *service) CreateProjectExpertPolicy(ctx context.Context, userID, projectID uint, req *UpsertProjectExpertPolicyRequest) (*domain.SpecForgeProjectExpertPolicy, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	if existing, err := s.repo.FindActiveProjectExpertPolicyByProjectID(ctx, projectID); err == nil && existing != nil {
		return nil, domain.ErrConflict
	} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("load active project expert policy: %w", err)
	}
	policy, err := buildProjectExpertPolicy(project, userID, 1, req)
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateProjectExpertPolicy(ctx, policy); err != nil {
		return nil, fmt.Errorf("create project expert policy: %w", err)
	}
	return policy, nil
}

func (s *service) UpdateProjectExpertPolicy(ctx context.Context, userID, projectID, policyID uint, req *UpsertProjectExpertPolicyRequest) (*domain.SpecForgeProjectExpertPolicy, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	current, err := s.repo.FindProjectExpertPolicyByID(ctx, policyID)
	if err != nil {
		return nil, err
	}
	if current.ProjectID != projectID {
		return nil, domain.ErrPermissionDenied
	}
	policies, err := s.repo.ListProjectExpertPoliciesByProjectID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project expert policies: %w", err)
	}
	maxVersion := 0
	for _, policy := range policies {
		if policy == nil {
			continue
		}
		if policy.Active {
			policy.Active = false
			if err := s.repo.UpdateProjectExpertPolicy(ctx, policy); err != nil {
				return nil, fmt.Errorf("deactivate active expert policy: %w", err)
			}
		}
		if policy.Version > maxVersion {
			maxVersion = policy.Version
		}
	}
	next, err := buildProjectExpertPolicy(project, userID, maxVersion+1, req)
	if err != nil {
		return nil, err
	}
	next.Active = true
	if err := s.repo.CreateProjectExpertPolicy(ctx, next); err != nil {
		return nil, fmt.Errorf("create next project expert policy version: %w", err)
	}
	return next, nil
}

func (s *service) ListProjectRuntimeBindings(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRuntimeBindingStatus, error) {
	if _, err := s.repo.FindProjectByID(ctx, projectID); err != nil {
		return nil, err
	}
	primaryRepositoryID, err := s.projectPrimaryRepositoryID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return s.listProjectRuntimeBindingStatuses(ctx, projectID, primaryRepositoryID)
}

func (s *service) CreateProjectRuntimeBinding(ctx context.Context, userID, projectID uint, req *UpsertProjectRuntimeBindingRequest) (*domain.SpecForgeProjectRuntimeBindingStatus, error) {
	if req == nil || s.runtimeReadiness == nil {
		return nil, domain.ErrInvalidInput
	}
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	repository, err := s.repo.FindProjectRepository(ctx, projectID, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	if !repository.Active {
		return nil, domain.ErrInvalidInput
	}
	existingBindings, err := s.runtimeReadiness.ListProjectRuntimeBindingsByProjectID(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("list project runtime bindings: %w", err)
	}
	for _, existing := range existingBindings {
		if existing != nil && existing.Active {
			return nil, domain.ErrConflict
		}
	}
	runtime, err := s.runtimeReadiness.FindRuntimeByRuntimeID(ctx, req.RuntimeID)
	if err != nil {
		return nil, err
	}
	binding, err := buildProjectRuntimeBinding(project, userID, runtime, repository.RepositoryID, req)
	if err != nil {
		return nil, err
	}
	if err := s.runtimeReadiness.CreateProjectRuntimeBinding(ctx, binding); err != nil {
		return nil, fmt.Errorf("create project runtime binding: %w", err)
	}
	primaryRepositoryID, err := s.projectPrimaryRepositoryID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return buildProjectRuntimeBindingStatus(nowUTC(), primaryRepositoryID, binding, runtime), nil
}

func (s *service) UpdateProjectRuntimeBinding(ctx context.Context, userID, projectID, bindingID uint, req *UpsertProjectRuntimeBindingRequest) (*domain.SpecForgeProjectRuntimeBindingStatus, error) {
	if req == nil || s.runtimeReadiness == nil {
		return nil, domain.ErrInvalidInput
	}
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	current, err := s.runtimeReadiness.FindProjectRuntimeBindingByID(ctx, bindingID)
	if err != nil {
		return nil, err
	}
	if current.ProjectID != projectID {
		return nil, domain.ErrPermissionDenied
	}
	repository, err := s.repo.FindProjectRepository(ctx, projectID, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	if !repository.Active {
		return nil, domain.ErrInvalidInput
	}
	runtime, err := s.runtimeReadiness.FindRuntimeByRuntimeID(ctx, req.RuntimeID)
	if err != nil {
		return nil, err
	}
	next, err := buildProjectRuntimeBinding(project, userID, runtime, repository.RepositoryID, req)
	if err != nil {
		return nil, err
	}
	next.ID = current.ID
	next.Active = current.Active
	next.CreatedBy = current.CreatedBy
	next.CreatedAt = current.CreatedAt
	if err := s.runtimeReadiness.UpdateProjectRuntimeBinding(ctx, next); err != nil {
		return nil, fmt.Errorf("update project runtime binding: %w", err)
	}
	primaryRepositoryID, err := s.projectPrimaryRepositoryID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	return buildProjectRuntimeBindingStatus(nowUTC(), primaryRepositoryID, next, runtime), nil
}

func (s *service) projectPrimaryRepositoryID(ctx context.Context, projectID uint) (string, error) {
	repositories, err := s.repo.ListProjectRepositories(ctx, projectID)
	if err != nil {
		return "", err
	}
	for _, repository := range repositories {
		if repository == nil || !repository.Active || repository.Role != domain.ProjectRepositoryRolePrimary {
			continue
		}
		return strings.TrimSpace(repository.RepositoryID), nil
	}
	return "", nil
}

func (s *service) listProjectRuntimeBindingStatuses(ctx context.Context, projectID uint, primaryRepositoryID string) ([]*domain.SpecForgeProjectRuntimeBindingStatus, error) {
	if s.runtimeReadiness == nil {
		return []*domain.SpecForgeProjectRuntimeBindingStatus{}, nil
	}
	bindings, err := s.runtimeReadiness.ListProjectRuntimeBindingsByProjectID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	statuses := make([]*domain.SpecForgeProjectRuntimeBindingStatus, 0, len(bindings))
	for _, binding := range bindings {
		if binding == nil {
			continue
		}
		runtime, err := s.runtimeReadiness.FindRuntimeByRuntimeID(ctx, binding.RuntimeID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
		if errors.Is(err, domain.ErrNotFound) {
			runtime = nil
		}
		statuses = append(statuses, buildProjectRuntimeBindingStatus(nowUTC(), primaryRepositoryID, binding, runtime))
	}
	return statuses, nil
}

func (s *service) projectContextBundle(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error) {
	project, err := s.repo.FindProjectByID(ctx, projectID)
	if err != nil {
		return nil, err
	}
	repositories, err := s.repo.ListProjectRepositories(ctx, projectID)
	if err != nil {
		return nil, err
	}
	repositoryContexts, err := s.repositoryContexts(ctx, repositories)
	if err != nil {
		return nil, err
	}
	context := &domain.SpecForgeProjectContext{
		Project:            project,
		Repositories:       repositories,
		RepositoryContexts: repositoryContexts,
	}
	domain.ApplySpecForgeProjectContextGuardrails(context)
	return context, nil
}

func (s *service) repositoryContexts(ctx context.Context, repositories []*domain.SpecForgeProjectRepository) ([]*domain.SpecForgeProjectRepositoryContext, error) {
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
				stale, reasons := domain.SpecForgeRepoArchitectureSnapshotStaleness(snapshot, nowUTC())
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
	return contexts, nil
}

func collectProjectContextWarnings(context *domain.SpecForgeProjectContext) []string {
	if context == nil {
		return nil
	}
	warnings := []string{}
	for _, repositoryContext := range context.RepositoryContexts {
		if repositoryContext == nil || repositoryContext.Repository == nil {
			continue
		}
		repositoryID := strings.TrimSpace(repositoryContext.Repository.RepositoryID)
		for _, warning := range repositoryContext.Warnings {
			warnings = appendCompactProjectStrings(warnings, projectReadinessWarning(repositoryID, warning))
		}
		for _, warning := range repositoryContext.ArchitectureWarnings {
			warnings = appendCompactProjectStrings(warnings, projectReadinessWarning(repositoryID, warning))
		}
		if repositoryContext.Profile != nil {
			for _, warning := range repositoryContext.Profile.Warnings {
				warnings = appendCompactProjectStrings(warnings, projectReadinessWarning(repositoryID, warning))
			}
		}
	}
	return warnings
}

func projectReadinessWarning(repositoryID, warning string) string {
	repositoryID = strings.TrimSpace(repositoryID)
	warning = strings.Join(strings.Fields(strings.TrimSpace(warning)), " ")
	if repositoryID == "" || warning == "" {
		return warning
	}
	return repositoryID + ": " + warning
}

func appendCompactProjectStrings(values []string, next string) []string {
	next = strings.Join(strings.Fields(strings.TrimSpace(next)), " ")
	if next == "" {
		return values
	}
	for _, value := range values {
		if value == next {
			return values
		}
	}
	return append(values, next)
}

func readinessCheckStatus(ready bool, waiting bool) string {
	if waiting {
		return domain.ProjectReadinessStatusAttention
	}
	if ready {
		return domain.ProjectReadinessStatusReady
	}
	return domain.ProjectReadinessStatusBlocked
}

func projectGitHubReadinessDetail(result *githubintegration.GitHubRepositoryReadinessResponse) string {
	if result == nil {
		return "GitHub delivery readiness could not be determined."
	}
	if result.Ready {
		return "GitHub account connection, token access, and repository permissions are ready."
	}
	blocking := []string{}
	for _, check := range result.Checks {
		if !check.Required || strings.EqualFold(check.Status, "ok") {
			continue
		}
		detail := strings.TrimSpace(check.Detail)
		if detail == "" {
			detail = strings.TrimSpace(check.Message)
		}
		blocking = append(blocking, detail)
	}
	if len(blocking) == 0 {
		return "GitHub delivery is still blocked; review account connection and repository permissions."
	}
	if len(blocking) == 1 {
		return blocking[0]
	}
	return fmt.Sprintf("%s (+%d more GitHub blockers)", blocking[0], len(blocking)-1)
}

func projectReadinessDecision(hasPrimary, githubReady, contextReady, runtimeReady, skillReady, expertPolicyReady bool) (status, nextStep, nextAction, summary string) {
	switch {
	case !hasPrimary:
		return domain.ProjectReadinessStatusBlocked,
			domain.ProjectReadinessStepBindRepository,
			"Bind one active primary repository before CodingCTO can plan or deliver code.",
			"No writable primary repository is bound yet."
	case !githubReady:
		return domain.ProjectReadinessStatusBlocked,
			domain.ProjectReadinessStepConfigureGitHub,
			"Complete GitHub setup for the primary repository before asking CodingCTO to deliver PRs.",
			"Primary repository is bound, but GitHub delivery is still blocked."
	case !contextReady:
		return domain.ProjectReadinessStatusAttention,
			domain.ProjectReadinessStepReviewContext,
			"Review repository context warnings and regenerate missing materials before approving execution.",
			"Repository binding is ready, but context evidence still needs review."
	case !runtimeReady:
		return domain.ProjectReadinessStatusAttention,
			domain.ProjectReadinessStepConnectRuntime,
			"Connect or refresh an online local runtime before dispatching execution tasks.",
			"Planning can proceed, but no online runtime is available for delivery."
	case !skillReady:
		return domain.ProjectReadinessStatusAttention,
			domain.ProjectReadinessStepAddSkills,
			"Add project or repository skills so planners and executors do not have to rediscover local conventions.",
			"Project can plan, but prompt guidance is still thin."
	case !expertPolicyReady:
		return domain.ProjectReadinessStatusAttention,
			domain.ProjectReadinessStepConfigureExpertPolicy,
			"Persist an expert policy before generating requirements, reviews, and merge decisions.",
			"Project setup is missing the active expert scope and merge policy contract."
	default:
		return domain.ProjectReadinessStatusReady,
			domain.ProjectReadinessStepCreateRequirement,
			"Create a requirement and generate a project plan.",
			"Project setup is ready enough to turn a change request into a plan."
	}
}

func normalizeSlug(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func validRepositoryRole(role string) bool {
	switch role {
	case domain.ProjectRepositoryRolePrimary,
		domain.ProjectRepositoryRoleDependency,
		domain.ProjectRepositoryRoleDocs,
		domain.ProjectRepositoryRoleInfra:
		return true
	default:
		return false
	}
}

func (s *service) validateOAuthRepositoryAccess(ctx context.Context, workspaceID string, repository *domain.Repository) error {
	if repository == nil || !projectRepositoryUsesOAuth(repository) {
		return nil
	}
	store, ok := s.githubRepo.(githubRepositoryAccessStore)
	if !ok || store == nil {
		return fmt.Errorf("%w: github oauth repository access store is unavailable", domain.ErrInvalidInput)
	}
	if repository.GitHubRepositoryAccessID == 0 {
		return fmt.Errorf("%w: repository is missing oauth access record", domain.ErrInvalidInput)
	}
	access, err := store.FindRepositoryAccessByID(ctx, repository.GitHubRepositoryAccessID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(access.WorkspaceID) != strings.TrimSpace(workspaceID) {
		return domain.ErrPermissionDenied
	}
	if access.Archived || access.Disabled {
		return fmt.Errorf("%w: repository access is archived or disabled", domain.ErrInvalidInput)
	}
	if !strings.EqualFold(projectGitHubRepositoryID(access.OwnerLogin, access.RepoName), strings.TrimSpace(repository.RepositoryID)) {
		return fmt.Errorf("%w: repository access identity mismatch", domain.ErrInvalidInput)
	}
	return nil
}

func projectRepositoryUsesOAuth(repository *domain.Repository) bool {
	if repository == nil {
		return false
	}
	return repository.AccessSource == domain.RepositoryAccessSourceOAuthUser ||
		repository.GitHubConnectionID > 0 ||
		repository.GitHubRepositoryAccessID > 0
}

func projectGitHubRepositoryID(owner, repo string) string {
	owner = strings.TrimSpace(owner)
	repo = strings.TrimSpace(repo)
	if owner == "" || repo == "" {
		return ""
	}
	return fmt.Sprintf("github_%s__%s", owner, repo)
}

func repositoryAccessWritable(access *domain.GitHubRepositoryAccess) bool {
	if access == nil {
		return false
	}
	return access.Permissions["push"] || access.Permissions["maintain"] || access.Permissions["admin"]
}

func (s *service) resolveActiveWorkspace(ctx context.Context, workspaceID string) (*domain.Workspace, error) {
	workspaceID = domain.NormalizeWorkspaceID(workspaceID)
	if workspaceID == "" || s.workspaceRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	workspace, err := s.workspaceRepo.FindWorkspaceByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if workspace.Status != domain.WorkspaceStatusActive {
		return nil, domain.ErrInvalidInput
	}
	return workspace, nil
}
