package repocontext

import (
	"context"
	"strings"
	"testing"
	"time"

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
	require.Equal(t, "manual", profile.Source)
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
			"pnpm-lock.yaml",
			"web/tsconfig.json",
			"web/next.config.ts",
			"web/tailwind.config.ts",
			"prisma/schema.prisma",
			".github/workflows/ci.yml",
			"AGENTS.md",
			"CONTRIBUTING.md",
			".github/copilot-instructions.md",
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
	require.Subset(t, profile.CodingConventions, []string{
		"Follow repository instructions in AGENTS.md before planning or editing.",
		"Follow repository contribution guidelines in CONTRIBUTING.md.",
		"Follow GitHub Copilot repository instructions in .github/copilot-instructions.md.",
	})
	require.Contains(t, profile.Summary, "SpecForge inferred")
	require.Equal(t, "request_hints", profile.Source)
	require.Equal(t, uint(12), profile.CreatedBy)
}

func TestInferProfileUsesDetectedPackageManagerForScriptCommands(t *testing.T) {
	cases := []struct {
		name     string
		paths    []string
		expected []string
	}{
		{
			name:     "pnpm lockfile",
			paths:    []string{"package.json", "pnpm-lock.yaml"},
			expected: []string{"pnpm lint", "pnpm type-check", "pnpm test"},
		},
		{
			name:     "yarn lockfile",
			paths:    []string{"package.json", "yarn.lock"},
			expected: []string{"yarn lint", "yarn type-check", "yarn test"},
		},
		{
			name:     "npm lockfile",
			paths:    []string{"package.json", "package-lock.json"},
			expected: []string{"npm run lint", "npm run type-check", "npm run test"},
		},
		{
			name:     "bun lockfile",
			paths:    []string{"package.json", "bun.lockb"},
			expected: []string{"bun lint", "bun type-check", "bun test"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &memoryRepo{}
			svc := NewService(repo, nil)

			profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{
				FilePaths: tc.paths,
				PackageScripts: map[string]string{
					"lint":       "eslint .",
					"type-check": "tsc --noEmit",
					"test":       "vitest",
				},
			})

			require.NoError(t, err)
			require.Subset(t, profile.TestCommands, tc.expected)
		})
	}
}

func TestInferProfileUsesRepositoryTreeWhenFileHintsAreAbsent(t *testing.T) {
	repo := &memoryRepo{}
	treeSource := &fakeTreeSource{
		snapshot: &RepositoryTreeSnapshot{
			Ref:       "main",
			Truncated: true,
			Paths: []string{
				"go.mod",
				"AGENTS.md",
				"web/package.json",
				"web/next.config.ts",
				".github/workflows/ci.yml",
				"api/internal/modules/user/service.go",
			},
		},
		files: map[string]*RepositoryFileSnapshot{
			"web/package.json": {
				Path:    "web/package.json",
				Content: `{"scripts":{"lint":"eslint .","type-check":"tsc --noEmit","test":"vitest"}}`,
			},
			"AGENTS.md": {
				Path: "AGENTS.md",
				Content: `# Instructions
Use DDD module boundaries.
Do not expose API keys or secrets in prompts.
Run the narrowest relevant tests.`,
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
	require.Subset(t, profile.TestCommands, []string{"pnpm lint", "pnpm type-check", "pnpm test"})
	require.Contains(t, profile.AppStructure, "api/internal/modules")
	require.Contains(t, profile.CodingConventions, "Instruction excerpt from AGENTS.md: # Instructions Use DDD module boundaries. Run the narrowest relevant tests.")
	require.Equal(t, "github_tree", profile.Source)
	require.Contains(t, profile.Warnings, "GitHub tree response was truncated; inferred profile may miss files.")
	require.NotContains(t, strings.Join(profile.CodingConventions, " "), "API keys")
	require.NotContains(t, strings.Join(profile.CodingConventions, " "), "secrets")
}

func TestReindexArchitectureCreatesSnapshotAndUpdatesProfile(t *testing.T) {
	repo := &memoryRepo{}
	treeSource := &fakeTreeSource{
		snapshot: &RepositoryTreeSnapshot{
			Ref:       "abc123",
			Truncated: true,
			Paths: []string{
				"go.mod",
				"cmd/server/main.go",
				"api/internal/modules/user/service.go",
				"web/src/features/specforge/components/workbench.tsx",
				"web/package.json",
				"web/next.config.ts",
				".github/workflows/ci.yml",
				".env",
			},
		},
		files: map[string]*RepositoryFileSnapshot{
			"web/package.json": {
				Path:    "web/package.json",
				Content: `{"scripts":{"lint":"eslint .","type-check":"tsc --noEmit","test":"vitest"}}`,
			},
		},
	}
	svc := NewService(repo, treeSource)

	status, err := svc.ReindexArchitecture(context.Background(), 12, "repo_123", &ReindexRepoArchitectureRequest{
		DefaultBranch: "main",
	})

	require.NoError(t, err)
	require.False(t, status.Stale)
	require.NotNil(t, status.Snapshot)
	require.Equal(t, "repo_123", status.Snapshot.RepositoryID)
	require.Equal(t, "abc123", status.Snapshot.CommitSHA)
	require.Contains(t, status.Snapshot.Stack, "Go")
	require.Contains(t, status.Snapshot.Modules, "api/internal/modules/user")
	require.Contains(t, status.Snapshot.Modules, "web/src/features/specforge")
	require.Contains(t, status.Snapshot.Entrypoints, "cmd/server/main.go")
	require.Contains(t, status.Snapshot.CIWorkflows, ".github/workflows/ci.yml")
	require.Contains(t, status.Snapshot.Warnings, "GitHub tree response was truncated; architecture snapshot may miss files.")
	require.Contains(t, status.Snapshot.Warnings, "SpecForge filtered 1 sensitive repository paths from the architecture snapshot.")
	require.NotContains(t, strings.Join(status.Snapshot.Modules, " "), ".env")
	require.NotNil(t, repo.profile)
	require.Equal(t, "architecture_snapshot", repo.profile.Source)
	require.Equal(t, "abc123", repo.profile.DefaultBranch)
	require.NotNil(t, repo.snapshot)
}

func TestGetArchitectureStatusReportsMissingAndStaleSnapshots(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

	missing, err := svc.GetArchitectureStatus(context.Background(), "repo_123")
	require.NoError(t, err)
	require.True(t, missing.Stale)
	require.Contains(t, missing.StaleReasons, "No architecture snapshot has been generated yet.")

	repo.snapshot = &domain.SpecForgeRepoArchitectureSnapshot{
		ID:           1,
		RepositoryID: "repo_123",
		CommitSHA:    "abc123",
		CreatedAt:    time.Now().Add(-25 * time.Hour),
	}
	stale, err := svc.GetArchitectureStatus(context.Background(), "repo_123")
	require.NoError(t, err)
	require.True(t, stale.Stale)
	require.Contains(t, stale.StaleReasons, "Architecture snapshot is older than 24 hours.")
}

func TestInferProfileReadsOnlySafeInstructionFiles(t *testing.T) {
	repo := &memoryRepo{}
	treeSource := &fakeTreeSource{
		snapshot: &RepositoryTreeSnapshot{
			Ref: "main",
			Paths: []string{
				"AGENTS.md",
				"api/AGENTS.md",
				".github/copilot-instructions.md",
				"docs/random.md",
				"secrets/AGENTS.md",
			},
		},
		files: map[string]*RepositoryFileSnapshot{
			"AGENTS.md": {
				Path:    "AGENTS.md",
				Content: "Root rule.",
			},
			"api/AGENTS.md": {
				Path:    "api/AGENTS.md",
				Content: "API rule.",
			},
			".github/copilot-instructions.md": {
				Path:    ".github/copilot-instructions.md",
				Content: "Copilot rule.",
			},
			"docs/random.md": {
				Path:    "docs/random.md",
				Content: "Should not be read.",
			},
			"secrets/AGENTS.md": {
				Path:    "secrets/AGENTS.md",
				Content: "Should not be read.",
			},
		},
	}
	svc := NewService(repo, treeSource)

	profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{})

	require.NoError(t, err)
	require.ElementsMatch(t, []string{"AGENTS.md", "api/AGENTS.md", ".github/copilot-instructions.md"}, treeSource.readPaths)
	require.Contains(t, profile.CodingConventions, "Instruction excerpt from AGENTS.md: Root rule.")
	require.Contains(t, profile.CodingConventions, "Instruction excerpt from api/AGENTS.md: API rule.")
	require.Contains(t, profile.CodingConventions, "Instruction excerpt from .github/copilot-instructions.md: Copilot rule.")
	require.Contains(t, profile.Warnings, "SpecForge filtered 1 sensitive repository paths from the inferred profile.")
}

func TestInferProfileFiltersSensitiveRepositoryPaths(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

	profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{
		FilePaths: []string{
			"go.mod",
			".env",
			"web/.env.production",
			"config/private.key",
			"deploy/service-account-token.json",
			"api/internal/modules/user/service.go",
		},
	})

	require.NoError(t, err)
	require.Contains(t, profile.Stack, "Go")
	require.Contains(t, profile.AppStructure, "api/internal/modules")
	require.Contains(t, profile.Warnings, "SpecForge filtered 4 sensitive repository paths from the inferred profile.")
	require.NotContains(t, profile.Summary, ".env")
	require.NotContains(t, profile.Summary, "private.key")
}

func TestInferProfileDoesNotReadSensitivePackageJSONPaths(t *testing.T) {
	repo := &memoryRepo{}
	treeSource := &fakeTreeSource{
		snapshot: &RepositoryTreeSnapshot{
			Ref: "main",
			Paths: []string{
				"web/package.json",
				"secrets/package.json",
			},
		},
		files: map[string]*RepositoryFileSnapshot{
			"web/package.json": {
				Path:    "web/package.json",
				Content: `{"scripts":{"test":"vitest"}}`,
			},
			"secrets/package.json": {
				Path:    "secrets/package.json",
				Content: `{"scripts":{"test":"should-not-read"}}`,
			},
		},
	}
	svc := NewService(repo, treeSource)

	profile, err := svc.InferProfile(context.Background(), 12, "repo_123", &InferRepoProfileRequest{})

	require.NoError(t, err)
	require.Equal(t, "web/package.json", treeSource.readPaths[0])
	require.Len(t, treeSource.readPaths, 1)
	require.Contains(t, profile.TestCommands, "pnpm test")
	require.Contains(t, profile.Warnings, "SpecForge filtered 1 sensitive repository paths from the inferred profile.")
}

type memoryRepo struct {
	nextID   uint
	profile  *domain.SpecForgeRepoProfile
	snapshot *domain.SpecForgeRepoArchitectureSnapshot
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

func (r *memoryRepo) CreateArchitectureSnapshot(ctx context.Context, snapshot *domain.SpecForgeRepoArchitectureSnapshot) error {
	r.nextID++
	snapshot.ID = r.nextID
	if snapshot.CreatedAt.IsZero() {
		snapshot.CreatedAt = time.Now()
	}
	if snapshot.UpdatedAt.IsZero() {
		snapshot.UpdatedAt = snapshot.CreatedAt
	}
	copied := *snapshot
	r.snapshot = &copied
	return nil
}

func (r *memoryRepo) FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error) {
	if r.snapshot == nil || r.snapshot.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.snapshot
	return &copied, nil
}

type fakeTreeSource struct {
	repositoryID string
	ref          string
	recursive    bool
	snapshot     *RepositoryTreeSnapshot
	files        map[string]*RepositoryFileSnapshot
	readPath     string
	readPaths    []string
	readRef      string
	err          error
}

func (s *fakeTreeSource) ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*RepositoryTreeSnapshot, error) {
	s.repositoryID = repositoryID
	s.ref = ref
	s.recursive = recursive
	return s.snapshot, s.err
}

func (s *fakeTreeSource) ReadRepositoryFile(ctx context.Context, repositoryID, path, ref string) (*RepositoryFileSnapshot, error) {
	s.repositoryID = repositoryID
	s.readPath = path
	s.readPaths = append(s.readPaths, path)
	s.readRef = ref
	return s.files[path], s.err
}
