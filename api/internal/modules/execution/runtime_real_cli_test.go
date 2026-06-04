package execution

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestRuntimeWorkerRunsRealCLIExecutors(t *testing.T) {
	if os.Getenv("SPECFORGE_RUN_REAL_CLI_TESTS") != "1" {
		t.Skip("set SPECFORGE_RUN_REAL_CLI_TESTS=1 to run real CLI integration tests")
	}

	cases := []struct {
		name       string
		executor   string
		executable string
		codexPath  string
		claudePath string
		kimiPath   string
	}{
		{
			name:       "codex",
			executor:   ExecutorNameCodexCLI,
			executable: envOrFirst("SPECFORGE_REAL_CODEX_PATH", "CODEX_CLI_PATH", "codex"),
			codexPath:  envOrFirst("SPECFORGE_REAL_CODEX_PATH", "CODEX_CLI_PATH", "codex"),
			claudePath: "claude",
			kimiPath:   "kimi",
		},
		{
			name:       "claude",
			executor:   ExecutorNameClaudeCodeCLI,
			executable: envOrFirst("SPECFORGE_REAL_CLAUDE_PATH", "CLAUDE_CODE_CLI_PATH", "claude"),
			codexPath:  "codex",
			claudePath: envOrFirst("SPECFORGE_REAL_CLAUDE_PATH", "CLAUDE_CODE_CLI_PATH", "claude"),
			kimiPath:   "kimi",
		},
		{
			name:       "kimi",
			executor:   ExecutorNameKimiCLI,
			executable: envOrFirst("SPECFORGE_REAL_KIMI_PATH", "KIMI_CLI_PATH", "kimi"),
			codexPath:  "codex",
			claudePath: "claude",
			kimiPath:   envOrFirst("SPECFORGE_REAL_KIMI_PATH", "KIMI_CLI_PATH", "kimi"),
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			if _, err := exec.LookPath(tc.executable); err != nil {
				t.Skipf("%s not available: %v", tc.executable, err)
			}

			workdir := t.TempDir()
			require.NoError(t, os.WriteFile(filepath.Join(workdir, "README.txt"), []byte("runtime verification workspace\n"), 0o644))

			client := &runtimeRealCLIFakeClient{
				claim: &ClaimAgentTaskResponse{
					Task: &ClaimedAgentTask{
						ID:         101,
						RunID:      11,
						PRNodeID:   21,
						Executor:   tc.executor,
						Status:     domain.AgentTaskStatusDispatched,
						PromptType: domain.PromptTypeImplementation,
					},
					Prompt: &ClaimedTaskPrompt{
						ID:         31,
						Version:    "real-cli-test",
						Type:       domain.PromptTypeImplementation,
						PromptText: "Reply with exactly OK. Do not modify files. Do not run commands.",
					},
					ExecutionContext: &ClaimedTaskExecutionContext{
						RepositoryID: "runtime-test",
						BranchName:   "",
					},
				},
			}

			executor := NewExecutorFactory(ExecutorFactoryConfig{
				CodexPath:      tc.codexPath,
				ClaudePath:     tc.claudePath,
				KimiPath:       tc.kimiPath,
				SandboxMode:    "workspace-write",
				ApprovalPolicy: "never",
				Timeout:        2 * time.Minute,
			}, nil).MustCreate(tc.executor)

			worker := NewRuntimeWorker(RuntimeWorkerConfig{
				RuntimeID:    "real-cli-test-" + tc.name,
				Executor:     tc.executor,
				RepoDir:      workdir,
				SessionID:    "real-cli-session-" + tc.name,
				PollInterval: time.Second,
			}, client, executor)

			result, err := worker.RunOnce(context.Background())
			require.NoError(t, err)
			require.NotNil(t, result)
			require.True(t, result.Claimed)
			require.NotNil(t, result.ExecutionResult)
			require.Equal(t, "completed", result.ExecutionResult.Status)
			require.Equal(t, 0, result.ExecutionResult.ExitCode)
			require.Contains(t, client.submit.Status, "completed")
			require.Equal(t, 0, client.submit.ExitCode)
			require.Contains(t, client.submit.Output, "OK")
			require.NotEmpty(t, client.events)
			require.Contains(t, eventTypes(client.events), "runtime_claimed")
			require.Contains(t, eventTypes(client.events), "executor_result")
			require.Contains(t, eventTypes(client.events), "executor_stdout")
		})
	}
}

type runtimeRealCLIFakeClient struct {
	events []*CreateTaskEventRequest
	claim  *ClaimAgentTaskResponse
	submit *SubmitTaskResultRequest
}

func (c *runtimeRealCLIFakeClient) Heartbeat(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error) {
	return &RuntimeHeartbeatResponse{
		Runtime:      &domain.SpecForgeRuntime{RuntimeID: req.RuntimeID, Executor: req.Executor, Status: "online"},
		ClaimPending: true,
	}, nil
}

func (c *runtimeRealCLIFakeClient) ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error) {
	return c.claim, nil
}

func (c *runtimeRealCLIFakeClient) CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error) {
	c.events = append(c.events, req)
	return &domain.SpecForgeTaskEvent{TaskID: taskID, Type: req.Type, Tool: req.Tool, Content: req.Content, Output: req.Output}, nil
}

func (c *runtimeRealCLIFakeClient) SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error) {
	c.submit = req
	return &domain.SpecForgeExecutionBundle{}, nil
}

func (c *runtimeRealCLIFakeClient) GetDirectTask(ctx context.Context, taskID uint, runtimeID string) (*domain.CodingCTODirectAgentTask, error) {
	return &domain.CodingCTODirectAgentTask{ID: taskID, RuntimeID: runtimeID, Status: domain.AgentTaskStatusRunning}, nil
}

func (c *runtimeRealCLIFakeClient) CreateDirectTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.CodingCTODirectTaskEvent, error) {
	c.events = append(c.events, req)
	return &domain.CodingCTODirectTaskEvent{TaskID: taskID, Type: req.Type, Tool: req.Tool, Content: req.Content, Output: req.Output}, nil
}

func (c *runtimeRealCLIFakeClient) SubmitDirectTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.CodingCTODirectAgentTask, error) {
	c.submit = req
	return &domain.CodingCTODirectAgentTask{ID: taskID, Status: req.Status}, nil
}

func (c *runtimeRealCLIFakeClient) Deregister(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	return &domain.SpecForgeRuntimeSweepResult{}, nil
}

func eventTypes(events []*CreateTaskEventRequest) string {
	types := make([]string, 0, len(events))
	for _, event := range events {
		if event == nil {
			continue
		}
		types = append(types, strings.TrimSpace(event.Type))
	}
	return strings.Join(types, ",")
}

func envOrFirst(keys ...string) string {
	for _, key := range keys[:len(keys)-1] {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return keys[len(keys)-1]
}
