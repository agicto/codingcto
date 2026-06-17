package execution

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestHasDispatchReadyRuntimeRequiresExecutorCLI(t *testing.T) {
	now := time.Now()
	tests := []struct {
		name     string
		executor string
		clis     []domain.SpecForgeRuntimeCLI
		want     bool
	}{
		{
			name:     "codex runtime with codex cli",
			executor: ExecutorNameCodexCLI,
			clis:     []domain.SpecForgeRuntimeCLI{{Command: "codex", Available: true}},
			want:     true,
		},
		{
			name:     "kimi runtime with kimi cli",
			executor: ExecutorNameKimiCLI,
			clis:     []domain.SpecForgeRuntimeCLI{{Command: "kimi", Available: true}},
			want:     true,
		},
		{
			name:     "kimi runtime without kimi cli",
			executor: ExecutorNameKimiCLI,
			clis:     []domain.SpecForgeRuntimeCLI{{Command: "codex", Available: true}},
			want:     false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			runtime := &domain.SpecForgeRuntime{
				RuntimeID:     "runtime_1",
				Executor:      tt.executor,
				Status:        domain.RuntimeStatusOnline,
				LastSeenAt:    now,
				AvailableCLIs: tt.clis,
				Sandbox:       &domain.SpecForgeRuntimeSandbox{Writable: true},
			}

			require.Equal(t, tt.want, hasDispatchReadyRuntime(tt.executor, []*domain.SpecForgeRuntime{runtime}))
		})
	}
}

func TestHasDispatchReadyRuntimeRequiresMatchingRepositoryWhenReported(t *testing.T) {
	now := time.Now()
	runtime := &domain.SpecForgeRuntime{
		RuntimeID:     "runtime_1",
		Executor:      ExecutorNameCodexCLI,
		Status:        domain.RuntimeStatusOnline,
		LastSeenAt:    now,
		AvailableCLIs: []domain.SpecForgeRuntimeCLI{{Command: "codex", Available: true}},
		Sandbox:       &domain.SpecForgeRuntimeSandbox{Writable: true},
		Repositories: []domain.SpecForgeRuntimeRepository{
			{RepositoryID: "repo_1", RepoDir: "/workspace/repo-1"},
		},
	}

	require.True(t, hasDispatchReadyRuntimeForRepository(ExecutorNameCodexCLI, "repo_1", []*domain.SpecForgeRuntime{runtime}))
	require.False(t, hasDispatchReadyRuntimeForRepository(ExecutorNameCodexCLI, "repo_2", []*domain.SpecForgeRuntime{runtime}))
}

func TestHasDispatchReadyRuntimeKeepsLegacyRuntimeWithoutRepositories(t *testing.T) {
	now := time.Now()
	runtime := &domain.SpecForgeRuntime{
		RuntimeID:     "runtime_1",
		Executor:      ExecutorNameCodexCLI,
		Status:        domain.RuntimeStatusOnline,
		LastSeenAt:    now,
		AvailableCLIs: []domain.SpecForgeRuntimeCLI{{Command: "codex", Available: true}},
		Sandbox:       &domain.SpecForgeRuntimeSandbox{Writable: true},
	}

	require.True(t, hasDispatchReadyRuntimeForRepository(ExecutorNameCodexCLI, "repo_1", []*domain.SpecForgeRuntime{runtime}))
}
