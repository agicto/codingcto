package repocontext

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestUpsertProfileNormalizesDefaultsAndLists(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

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
	svc := NewService(repo, nil)

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

func TestInferProfileDetectsStackCommandsAndRisks(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

	profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{
		DefaultBranch: "develop",
		FilePaths: []string{
			"go.mod",
			"web/package.json",
			"web/tsconfig.json",
			"web/next.config.ts",
			"web/tailwind.config.ts",
			"prisma/schema.prisma",
			".github/workflows/ci.yml",
			"api/internal/modules/auth/service.go",
			"web/src/features/billing/page.tsx",
		},
		PackageScripts: map[string]string{
			"lint":       "next lint",
			"type-check": "tsc --noEmit",
			"test":       "vitest",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "develop", profile.DefaultBranch)
	require.Equal(t, "github_actions", profile.CIProvider)
	require.Subset(t, profile.Stack, []string{"Go", "Node.js", "Next.js", "TypeScript", "Tailwind", "Prisma"})
	require.Subset(t, profile.TestCommands, []string{"go test ./...", "go vet ./...", "pnpm lint", "pnpm type-check", "pnpm test"})
	require.Subset(t, profile.RiskAreas, []string{"database migrations", "auth", "billing"})
	require.Contains(t, profile.Summary, "SpecForge inferred")
	require.Equal(t, uint(12), profile.CreatedBy)
}

func TestInferProfileUsesRepositoryTreeWhenFileHintsAreAbsent(t *testing.T) {
	repo := &memoryRepo{}
	treeSource := &fakeTreeSource{
		snapshot: &RepositoryTreeSnapshot{
			Ref: "main",
			Paths: []string{
				"go.mod",
				"web/package.json",
				"web/next.config.ts",
				".github/workflows/ci.yml",
				"api/internal/modules/user/service.go",
			},
		},
	}
	svc := NewService(repo, treeSource)

	profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{})

	require.NoError(t, err)
	require.Equal(t, "repo_123", treeSource.repositoryID)
	require.Empty(t, treeSource.ref)
	require.True(t, treeSource.recursive)
	require.Equal(t, "main", profile.DefaultBranch)
	require.Equal(t, "github_actions", profile.CIProvider)
	require.Subset(t, profile.Stack, []string{"Go", "Node.js", "Next.js"})
	require.Contains(t, profile.AppStructure, "api/internal/modules")
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

type fakeTreeSource struct {
	repositoryID string
	ref          string
	recursive    bool
	snapshot     *RepositoryTreeSnapshot
	err          error
}

func (s *fakeTreeSource) ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*RepositoryTreeSnapshot, error) {
	s.repositoryID = repositoryID
	s.ref = ref
	s.recursive = recursive
	return s.snapshot, s.err
}
