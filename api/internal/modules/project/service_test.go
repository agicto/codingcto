package project

import (
	"context"
	"errors"
	"sort"
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
	svc := NewService(store, github, nil, nil)

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
	require.Len(t, contextBundle.RepositoryContexts, 1)
	require.Equal(t, "repo_1", contextBundle.PrimaryRepositoryID)
	require.Equal(t, "repo_1", contextBundle.ExecutionRepositoryID)
	require.Empty(t, contextBundle.ReadOnlyRepositoryIDs)
	require.Contains(t, contextBundle.ExecutionGuardrails, "MVP execution is primary-repository only.")
	require.NotNil(t, contextBundle.Readiness)
	require.True(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 1, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.SkillCount)
	require.Equal(t, "Add project or repo skills to reduce prompt ambiguity.", contextBundle.Readiness.NextAction)
}

func TestServiceProjectContextIncludesRepoProfilesAndSkills(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
			"repo_2": {RepositoryID: "repo_2", WorkspaceID: "workspace_1"},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				ID:            10,
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Stack:         []string{"Go", "Next.js"},
				TestCommands:  []string{"go test ./...", "pnpm type-check"},
				CIProvider:    "github_actions",
				Summary:       "Primary app repo.",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				ID:           30,
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				Modules:      []string{"api/internal/modules/project", "web/src/features/project"},
				CIWorkflows:  []string{".github/workflows/ci.yml"},
				CreatedAt:    nowUTC(),
			},
		},
	}
	skills := &memorySkillStore{
		skills: map[string][]*domain.SpecForgeSkill{
			"repo_1": {
				{
					ID:           20,
					RepositoryID: "repo_1",
					Name:         "module-boundaries",
					Content:      "Keep API and web contracts explicit.",
					Active:       true,
				},
				{
					ID:           21,
					RepositoryID: "repo_1",
					Name:         "inactive",
					Content:      "Do not include.",
					Active:       false,
				},
			},
		},
	}
	svc := NewService(store, github, profiles, skills)
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
		Role:         domain.ProjectRepositoryRoleDependency,
	})
	require.NoError(t, err)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Len(t, contextBundle.RepositoryContexts, 2)
	repoOneContext := projectRepoContextByRepositoryID(contextBundle, "repo_1")
	require.NotNil(t, repoOneContext)
	require.NotNil(t, repoOneContext.Profile)
	require.Equal(t, []string{"Go", "Next.js"}, repoOneContext.Profile.Stack)
	require.Len(t, repoOneContext.Skills, 1)
	require.Equal(t, "module-boundaries", repoOneContext.Skills[0].Name)
	require.NotNil(t, repoOneContext.ArchitectureSnapshot)
	require.False(t, repoOneContext.ArchitectureStale)
	require.Contains(t, repoOneContext.ArchitectureSnapshot.Modules, "api/internal/modules/project")
	repoTwoContext := projectRepoContextByRepositoryID(contextBundle, "repo_2")
	require.NotNil(t, repoTwoContext)
	require.Nil(t, repoTwoContext.Profile)
	require.Contains(t, repoTwoContext.Warnings, "Repo profile has not been generated yet.")
	require.True(t, repoTwoContext.ArchitectureStale)
	require.Contains(t, repoTwoContext.ArchitectureWarnings, "Architecture snapshot has not been generated yet.")
	require.Equal(t, "repo_1", contextBundle.PrimaryRepositoryID)
	require.Equal(t, "repo_1", contextBundle.ExecutionRepositoryID)
	require.Equal(t, []string{"repo_2"}, contextBundle.ReadOnlyRepositoryIDs)
	require.Contains(t, contextBundle.ExecutionGuardrails, "Executor must modify only repo_1; other bound repositories are read-only context.")
	require.NotNil(t, contextBundle.Readiness)
	require.True(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 2, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.SkillCount)
	require.Equal(t, 2, contextBundle.Readiness.WarningCount)
	require.Equal(t, contextBundle.ExecutionGuardrails, contextBundle.Readiness.Guardrails)
	require.Contains(t, contextBundle.Readiness.Summary, "repo_1")
	require.Equal(t, "Review repository context warnings before approving execution.", contextBundle.Readiness.NextAction)
}

func TestServiceProjectContextReadinessRequiresPrimaryRepository(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, github, nil, nil)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRoleDependency,
	})
	require.NoError(t, err)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Empty(t, contextBundle.PrimaryRepositoryID)
	require.NotNil(t, contextBundle.Readiness)
	require.False(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 1, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.SkillCount)
	require.Equal(t, 0, contextBundle.Readiness.WarningCount)
	require.Contains(t, contextBundle.Readiness.Guardrails, "Project must bind one active primary repository before planning or execution.")
	require.Equal(t, "Bind one active primary repository before generating a plan.", contextBundle.Readiness.NextAction)
}

func TestServiceRejectsSecondPrimaryRepository(t *testing.T) {
	store := newMemoryProjectStore()
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
			"repo_2": {RepositoryID: "repo_2", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, github, nil, nil)
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
	svc := NewService(store, github, nil, nil)
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
	sort.Slice(bindings, func(i, j int) bool {
		if bindings[i].Role == bindings[j].Role {
			return bindings[i].ID < bindings[j].ID
		}
		return bindings[i].Role < bindings[j].Role
	})
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
func (s *memoryGitHubRepositoryStore) UpsertSettings(context.Context, *domain.GitHubSettings) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindSettingsByWorkspaceID(context.Context, string) (*domain.GitHubSettings, error) {
	return nil, errors.New("not implemented")
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

func projectRepoContextByRepositoryID(bundle *domain.SpecForgeProjectContext, repositoryID string) *domain.SpecForgeProjectRepositoryContext {
	for _, context := range bundle.RepositoryContexts {
		if context.Repository.RepositoryID == repositoryID {
			return context
		}
	}
	return nil
}

type memoryRepoProfileStore struct {
	profiles  map[string]*domain.SpecForgeRepoProfile
	snapshots map[string]*domain.SpecForgeRepoArchitectureSnapshot
}

func (s *memoryRepoProfileStore) UpsertProfile(_ context.Context, profile *domain.SpecForgeRepoProfile) error {
	if s.profiles == nil {
		s.profiles = map[string]*domain.SpecForgeRepoProfile{}
	}
	copied := *profile
	s.profiles[profile.RepositoryID] = &copied
	return nil
}

func (s *memoryRepoProfileStore) FindProfileByRepositoryID(_ context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	profile, ok := s.profiles[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *profile
	return &copied, nil
}

func (s *memoryRepoProfileStore) FindLatestArchitectureSnapshotByRepositoryID(_ context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error) {
	snapshot, ok := s.snapshots[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *snapshot
	return &copied, nil
}

type memorySkillStore struct {
	skills map[string][]*domain.SpecForgeSkill
}

func (s *memorySkillStore) UpsertSkill(_ context.Context, skill *domain.SpecForgeSkill) error {
	if s.skills == nil {
		s.skills = map[string][]*domain.SpecForgeSkill{}
	}
	copied := *skill
	s.skills[skill.RepositoryID] = append(s.skills[skill.RepositoryID], &copied)
	return nil
}

func (s *memorySkillStore) ListActiveSkillsByRepositoryID(_ context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	all, err := s.ListSkillsByRepositoryID(context.Background(), repositoryID)
	if err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeSkill, 0, len(all))
	for _, skill := range all {
		if skill.Active {
			out = append(out, skill)
		}
	}
	return out, nil
}

func (s *memorySkillStore) ListSkillsByRepositoryID(_ context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	out := make([]*domain.SpecForgeSkill, 0, len(s.skills[repositoryID]))
	for _, skill := range s.skills[repositoryID] {
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}
