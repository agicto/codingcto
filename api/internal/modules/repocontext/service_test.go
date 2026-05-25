package repocontext

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestUpsertProfileNormalizesDefaultsAndLists(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo)

	profile, err := svc.UpsertProfile(context.Background(), 12, "repo_123", &UpsertRepoProfileRequest{
		Stack:        []string{"Next.js", "Next.js", "Go", ""},
		TestCommands: []string{"pnpm test", " go test ./... "},
		RiskAreas:    []string{"auth", "database"},
		Summary:      "  compact repo summary  ",
	})

	require.NoError(t, err)
	require.Equal(t, "main", profile.DefaultBranch)
	require.Equal(t, "unknown", profile.CIProvider)
	require.Equal(t, []string{"Next.js", "Go"}, profile.Stack)
	require.Equal(t, "compact repo summary", profile.Summary)
	require.Equal(t, uint(12), profile.CreatedBy)
}

func TestGetProfileReturnsStoredProfile(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo)

	created, err := svc.UpsertProfile(context.Background(), 12, "repo_123", &UpsertRepoProfileRequest{
		DefaultBranch: "develop",
		CIProvider:    "github_actions",
	})
	require.NoError(t, err)

	found, err := svc.GetProfile(context.Background(), "repo_123")
	require.NoError(t, err)
	require.Equal(t, created.ID, found.ID)
	require.Equal(t, "develop", found.DefaultBranch)
	require.Equal(t, "github_actions", found.CIProvider)
}

type memoryRepo struct {
	nextID  uint
	profile *domain.SpecForgeRepoProfile
}

func (r *memoryRepo) UpsertProfile(ctx context.Context, profile *domain.SpecForgeRepoProfile) error {
	if r.profile == nil {
		r.nextID++
		profile.ID = r.nextID
	}
	copied := *profile
	r.profile = &copied
	return nil
}

func (r *memoryRepo) FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	if r.profile == nil || r.profile.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.profile
	return &copied, nil
}
