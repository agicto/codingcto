package runtimecli

import (
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
