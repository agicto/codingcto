package execution

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestLocalGitWorktreeManagerRefreshesMirrorAndCreatesTaskWorktree(t *testing.T) {
	root := t.TempDir()
	mirrorDir := filepath.Join(root, "mirrors", "repo-123.git")
	require.NoError(t, os.MkdirAll(mirrorDir, 0o755))
	runner := &captureRunner{result: CommandResult{ExitCode: 0}}
	manager := NewLocalGitWorktreeManager(LocalGitWorktreeManagerConfig{RootDir: root}, runner)

	worktree, err := manager.PrepareWorktree(context.Background(), WorktreeRequest{
		Repository: &domain.Repository{
			RepositoryID: "repo/123",
			GitHubOwner:  "agicto",
			GitHubRepo:   "codingcto",
		},
		BranchName: "specforge/pr-001",
		RunID:      9,
		TaskID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, filepath.Join(root, "worktrees", "run-9-task-10-specforge-pr-001"), worktree.Path)
	require.Len(t, runner.specs, 4)
	require.Equal(t, []string{"remote", "set-url", "origin", "https://github.com/agicto/codingcto.git"}, runner.specs[0].Args)
	require.Equal(t, mirrorDir, runner.specs[0].Dir)
	require.Equal(t, []string{"fetch", "--prune", "origin"}, runner.specs[1].Args)
	require.Equal(t, []string{"worktree", "prune"}, runner.specs[2].Args)
	require.Equal(t, []string{"worktree", "add", "--force", "-B", "specforge/pr-001", worktree.Path, "origin/specforge/pr-001"}, runner.specs[3].Args)
}

func TestLocalGitWorktreeManagerClonesMissingMirror(t *testing.T) {
	root := t.TempDir()
	runner := &captureRunner{result: CommandResult{ExitCode: 0}}
	manager := NewLocalGitWorktreeManager(LocalGitWorktreeManagerConfig{RootDir: root}, runner)

	_, err := manager.PrepareWorktree(context.Background(), WorktreeRequest{
		Repository: &domain.Repository{
			RepositoryID: "repo_123",
			GitHubOwner:  "agicto",
			GitHubRepo:   "codingcto",
		},
		BranchName: "specforge/pr-001",
		RunID:      1,
		TaskID:     2,
	})

	require.NoError(t, err)
	require.Len(t, runner.specs, 3)
	require.Equal(t, []string{"clone", "--mirror", "https://github.com/agicto/codingcto.git", filepath.Join(root, "mirrors", "repo_123.git")}, runner.specs[0].Args)
	require.Equal(t, []string{"worktree", "prune"}, runner.specs[1].Args)
	require.Equal(t, "git", runner.specs[2].Executable)
}

func TestLocalGitWorktreeManagerRejectsInvalidInput(t *testing.T) {
	manager := NewLocalGitWorktreeManager(LocalGitWorktreeManagerConfig{RootDir: t.TempDir()}, &captureRunner{})

	_, err := manager.PrepareWorktree(context.Background(), WorktreeRequest{
		Repository: &domain.Repository{
			RepositoryID: "repo_123",
			GitHubOwner:  "agicto",
			GitHubRepo:   "codingcto",
		},
		BranchName: "-bad",
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}
