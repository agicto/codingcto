package project

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateProject(ctx context.Context, userID uint, req *CreateProjectRequest) (*domain.SpecForgeProject, error)
	UpdateProject(ctx context.Context, projectID uint, req *UpdateProjectRequest) (*domain.SpecForgeProject, error)
	GetProject(ctx context.Context, projectID uint) (*domain.SpecForgeProject, error)
	ListProjects(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error)
	BindRepository(ctx context.Context, userID, projectID uint, req *BindRepositoryRequest) (*domain.SpecForgeProjectRepository, error)
	UnbindRepository(ctx context.Context, projectID uint, repositoryID string) error
	ListRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error)
	GetProjectContext(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error)
}

type service struct {
	repo             domain.SpecForgeProjectRepositoryStore
	workspaceRepo    domain.WorkspaceRepository
	githubRepo       domain.GitHubIntegrationRepository
	profileRepo      domain.SpecForgeRepoProfileRepository
	architectureRepo repoArchitectureStore
	skillRepo        domain.SpecForgeSkillRepository
}

type repoArchitectureStore interface {
	FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error)
}

func NewService(
	repo domain.SpecForgeProjectRepositoryStore,
	workspaceRepo domain.WorkspaceRepository,
	githubRepo domain.GitHubIntegrationRepository,
	profileRepo domain.SpecForgeRepoProfileRepository,
	skillRepo domain.SpecForgeSkillRepository,
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

func (s *service) ListRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	if _, err := s.repo.FindProjectByID(ctx, projectID); err != nil {
		return nil, err
	}
	return s.repo.ListProjectRepositories(ctx, projectID)
}

func (s *service) GetProjectContext(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContext, error) {
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
