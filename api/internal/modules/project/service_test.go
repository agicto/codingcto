package project

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestServiceProjectRepositoryFlow(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, github)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "SpecForge",
	})
	require.NoError(t, err)
	require.Equal(t, "specforge", project.Slug)

	binding, err := svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)
	require.Equal(t, domain.ProjectRepositoryRolePrimary, binding.Role)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, project.ID, contextBundle.Project.ID)
	require.Len(t, contextBundle.Repositories, 1)
}

func TestServiceRejectsSecondPrimaryRepository(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
			"repo_2": {RepositoryID: "repo_2", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, github)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_2",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestServiceRejectsCrossWorkspaceRepository(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_2"},
		},
	}
	svc := NewService(store, github)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.ErrorIs(t, err, domain.ErrPermissionDenied)
}

type memoryProjectStore struct {
	nextProjectID uint
	nextBindingID uint
	projects      map[uint]*domain.SpecForgeProject
	bindings      map[uint]map[string]*domain.SpecForgeProjectRepository
}

func newMemoryProjectStore() *memoryProjectStore {
	return &memoryProjectStore{
		nextProjectID: 1,
		nextBindingID: 1,
		projects:      map[uint]*domain.SpecForgeProject{},
		bindings:      map[uint]map[string]*domain.SpecForgeProjectRepository{},
	}
}

func (s *memoryProjectStore) CreateProject(_ context.Context, project *domain.SpecForgeProject) error {
	project.ID = s.nextProjectID
	s.nextProjectID++
	s.projects[project.ID] = cloneProject(project)
	return nil
}

func (s *memoryProjectStore) UpdateProject(_ context.Context, project *domain.SpecForgeProject) error {
	if _, ok := s.projects[project.ID]; !ok {
		return domain.ErrNotFound
	}
	s.projects[project.ID] = cloneProject(project)
	return nil
}

func (s *memoryProjectStore) FindProjectByID(_ context.Context, id uint) (*domain.SpecForgeProject, error) {
	project, ok := s.projects[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return cloneProject(project), nil
}

func (s *memoryProjectStore) FindProjectByWorkspaceAndSlug(_ context.Context, workspaceID, slug string) (*domain.SpecForgeProject, error) {
	for _, project := range s.projects {
		if project.WorkspaceID == workspaceID && project.Slug == slug {
			return cloneProject(project), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) ListProjectsByWorkspace(_ context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	var projects []*domain.SpecForgeProject
	for _, project := range s.projects {
		if project.WorkspaceID == workspaceID {
			projects = append(projects, cloneProject(project))
		}
	}
	return projects, nil
}

func (s *memoryProjectStore) CreateProjectRepository(_ context.Context, binding *domain.SpecForgeProjectRepository) error {
	if s.bindings[binding.ProjectID] == nil {
		s.bindings[binding.ProjectID] = map[string]*domain.SpecForgeProjectRepository{}
	}
	if _, ok := s.bindings[binding.ProjectID][binding.RepositoryID]; ok {
		return domain.ErrConflict
	}
	binding.ID = s.nextBindingID
	s.nextBindingID++
	s.bindings[binding.ProjectID][binding.RepositoryID] = cloneBinding(binding)
	return nil
}

func (s *memoryProjectStore) DeleteProjectRepository(_ context.Context, projectID uint, repositoryID string) error {
	delete(s.bindings[projectID], repositoryID)
	return nil
}

func (s *memoryProjectStore) FindProjectRepository(_ context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProjectRepository, error) {
	if binding, ok := s.bindings[projectID][repositoryID]; ok {
		return cloneBinding(binding), nil
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) ListProjectRepositories(_ context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	var bindings []*domain.SpecForgeProjectRepository
	for _, binding := range s.bindings[projectID] {
		bindings = append(bindings, cloneBinding(binding))
	}
	return bindings, nil
}

func (s *memoryProjectStore) CountActiveProjectRepositories(_ context.Context, projectID uint) (int64, error) {
	var count int64
	for _, binding := range s.bindings[projectID] {
		if binding.Active {
			count++
		}
	}
	return count, nil
}

func (s *memoryProjectStore) FindActivePrimaryProjectRepository(_ context.Context, projectID uint) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range s.bindings[projectID] {
		if binding.Active && binding.Role == domain.ProjectRepositoryRolePrimary {
			return cloneBinding(binding), nil
		}
	}
	return nil, domain.ErrNotFound
}

type memoryGitHubRepositoryStore struct {
	repositories map[string]*domain.Repository
}

func (s *memoryGitHubRepositoryStore) FindRepositoryByRepositoryID(_ context.Context, repositoryID string) (*domain.Repository, error) {
	repository, ok := s.repositories[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *repository
	return &copied, nil
}

func (s *memoryGitHubRepositoryStore) UpsertInstallation(context.Context, *domain.GitHubInstallation) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindInstallationByID(context.Context, uint) (*domain.GitHubInstallation, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindInstallationByGitHubID(context.Context, int64) (*domain.GitHubInstallation, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) UpsertRepository(context.Context, *domain.Repository) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) CreateWebhookEvent(context.Context, *domain.GitHubWebhookEvent) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindWebhookEventByDeliveryID(context.Context, string) (*domain.GitHubWebhookEvent, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) ListWebhookEvents(context.Context, string, string, int) ([]*domain.GitHubWebhookEvent, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) UpdateWebhookEventStatus(context.Context, string, string) error {
	return errors.New("not implemented")
}

func cloneProject(project *domain.SpecForgeProject) *domain.SpecForgeProject {
	copied := *project
	return &copied
}

func cloneBinding(binding *domain.SpecForgeProjectRepository) *domain.SpecForgeProjectRepository {
	copied := *binding
	return &copied
}
