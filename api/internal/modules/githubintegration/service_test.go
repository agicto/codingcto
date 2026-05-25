package githubintegration

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestUpsertInstallationNormalizesPermissions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo)

	installation, err := svc.UpsertInstallation(context.Background(), 7, &UpsertInstallationRequest{
		WorkspaceID:    " workspace_123 ",
		InstallationID: 42,
		AccountLogin:   " acme ",
		Permissions: map[string]string{
			" contents ": " write ",
			"":           "read",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "workspace_123", installation.WorkspaceID)
	require.Equal(t, "acme", installation.AccountLogin)
	require.Equal(t, map[string]string{"contents": "write"}, installation.Permissions)
	require.Equal(t, uint(7), installation.CreatedBy)
}

func TestUpsertRepositoryDefaultsRepositoryIDAndBranch(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo)

	repository, err := svc.UpsertRepository(context.Background(), 9, &UpsertRepositoryRequest{
		WorkspaceID:          "workspace_123",
		GitHubInstallationID: 3,
		GitHubOwner:          "multica-ai",
		GitHubRepo:           "multica",
		IsPrivate:            true,
	})

	require.NoError(t, err)
	require.Equal(t, "github_multica-ai__multica", repository.RepositoryID)
	require.Equal(t, "main", repository.DefaultBranch)
	require.True(t, repository.IsPrivate)
	require.Equal(t, uint(9), repository.CreatedBy)
}

func TestGetRepositoryReturnsStoredRepository(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo)
	created, err := svc.UpsertRepository(context.Background(), 9, &UpsertRepositoryRequest{
		RepositoryID:         "repo_123",
		WorkspaceID:          "workspace_123",
		GitHubInstallationID: 3,
		GitHubOwner:          "agicto",
		GitHubRepo:           "codingcto",
		DefaultBranch:        "develop",
	})
	require.NoError(t, err)

	found, err := svc.GetRepository(context.Background(), "repo_123")

	require.NoError(t, err)
	require.Equal(t, created.ID, found.ID)
	require.Equal(t, "develop", found.DefaultBranch)
}

type memoryRepo struct {
	nextID       uint
	installation *domain.GitHubInstallation
	repository   *domain.Repository
}

func (r *memoryRepo) UpsertInstallation(ctx context.Context, installation *domain.GitHubInstallation) error {
	if r.installation == nil {
		r.nextID++
		installation.ID = r.nextID
	}
	copied := *installation
	r.installation = &copied
	return nil
}

func (r *memoryRepo) FindInstallationByID(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	if r.installation == nil || r.installation.ID != id {
		return nil, domain.ErrNotFound
	}
	copied := *r.installation
	return &copied, nil
}

func (r *memoryRepo) FindInstallationByGitHubID(ctx context.Context, installationID int64) (*domain.GitHubInstallation, error) {
	if r.installation == nil || r.installation.InstallationID != installationID {
		return nil, domain.ErrNotFound
	}
	copied := *r.installation
	return &copied, nil
}

func (r *memoryRepo) UpsertRepository(ctx context.Context, repository *domain.Repository) error {
	if r.repository == nil {
		r.nextID++
		repository.ID = r.nextID
	}
	copied := *repository
	r.repository = &copied
	return nil
}

func (r *memoryRepo) FindRepositoryByRepositoryID(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	if r.repository == nil || r.repository.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.repository
	return &copied, nil
}
