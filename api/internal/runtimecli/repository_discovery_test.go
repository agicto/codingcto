package runtimecli

import (
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRepositoryIDFromRemote(t *testing.T) {
	tests := []struct {
		remote string
		want   string
	}{
		{remote: "https://github.com/agicto/codingcto.git", want: "agicto__codingcto"},
		{remote: "git@github.com:agicto/codingcto.git", want: "agicto__codingcto"},
		{remote: "ssh://git@github.com/Agicto/CodingCTO.git", want: "agicto__codingcto"},
		{remote: "https://example.com/agicto/codingcto.git", want: ""},
	}

	for _, tt := range tests {
		t.Run(tt.remote, func(t *testing.T) {
			require.Equal(t, tt.want, repositoryIDFromRemote(tt.remote))
		})
	}
}

func TestStableRuntimeIDIncludesExecutor(t *testing.T) {
	codex := stableRuntimeID("codex_cli")
	kimi := stableRuntimeID("kimi_cli")

	require.Contains(t, codex, "codex_cli")
	require.Contains(t, kimi, "kimi_cli")
	require.NotEqual(t, codex, kimi)
}

func TestDaemonRepositoryDefaultsInferCurrentGitRepository(t *testing.T) {
	repoDir := t.TempDir()
	runGit(t, repoDir, "init")
	runGit(t, repoDir, "remote", "add", "origin", "git@github.com:agicto/codingcto.git")
	t.Chdir(repoDir)

	resolvedRepoDir, repositoryID, err := daemonRepositoryDefaults("", "")
	expectedRepoDir, pathErr := filepath.EvalSymlinks(repoDir)

	require.NoError(t, err)
	require.NoError(t, pathErr)
	require.Equal(t, expectedRepoDir, resolvedRepoDir)
	require.Equal(t, "agicto__codingcto", repositoryID)
}

func runGit(t *testing.T, dir string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	require.NoError(t, err, string(output))
}
