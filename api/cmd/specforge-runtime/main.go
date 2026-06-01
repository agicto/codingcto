package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/zgiai/luas/api/internal/modules/execution"
)

func main() {
	apiBaseURL := flag.String("api-base-url", envOrDefault("SPECFORGE_API_BASE_URL", "http://localhost:2010/v1"), "CodingCTO API base URL, including /v1")
	token := flag.String("token", envOrDefault("SPECFORGE_RUNTIME_TOKEN", os.Getenv("CODINGCTO_RUNTIME_TOKEN")), "Bearer token for runtime API access")
	runtimeID := flag.String("runtime-id", envOrDefault("SPECFORGE_RUNTIME_ID", defaultRuntimeID()), "Stable runtime id")
	repositoryID := flag.String("repository-id", os.Getenv("SPECFORGE_RUNTIME_REPOSITORY_ID"), "Optional repository id guard for claimed tasks")
	repoDir := flag.String("repo-dir", os.Getenv("SPECFORGE_RUNTIME_REPO_DIR"), "Local repository directory used by Codex CLI")
	once := flag.Bool("once", false, "Run one heartbeat/claim/execute cycle and exit")
	pollInterval := flag.Duration("poll-interval", envDurationOrDefault("SPECFORGE_RUNTIME_POLL_INTERVAL", 10*time.Second), "Polling interval for daemon mode")
	executorName := flag.String("executor", envOrDefault("SPECFORGE_RUNTIME_EXECUTOR", execution.ExecutorNameCodexCLI), "Executor kind: codex_cli or claude_code_cli")
	codexPath := flag.String("codex-path", envOrDefault("CODEX_CLI_PATH", "codex"), "Codex CLI executable path")
	claudePath := flag.String("claude-path", envOrDefault("CLAUDE_CODE_CLI_PATH", "claude"), "Claude Code CLI executable path")
	sandbox := flag.String("sandbox", envOrDefault("SPECFORGE_CODEX_SANDBOX", "workspace-write"), "Codex sandbox mode")
	approval := flag.String("approval-policy", envOrDefault("SPECFORGE_CODEX_APPROVAL_POLICY", "never"), "Codex approval policy")
	timeout := flag.Duration("timeout", envDurationOrDefault("SPECFORGE_CODEX_TIMEOUT", 30*time.Minute), "Per-task Codex timeout")
	flag.Parse()

	if strings.TrimSpace(*repoDir) == "" {
		fmt.Fprintln(os.Stderr, "specforge-runtime: --repo-dir or SPECFORGE_RUNTIME_REPO_DIR is required")
		os.Exit(2)
	}
	client := execution.NewRuntimeHTTPClient(execution.RuntimeHTTPClientConfig{
		BaseURL: *apiBaseURL,
		Token:   *token,
	})
	executorFactory := execution.NewExecutorFactory(execution.ExecutorFactoryConfig{
		CodexPath:      *codexPath,
		ClaudePath:     *claudePath,
		SandboxMode:    *sandbox,
		ApprovalPolicy: *approval,
		Timeout:        *timeout,
	}, nil)
	executor := executorFactory.MustCreate(*executorName)
	capabilities := execution.DetectRuntimeCapabilities(execution.RuntimeCapabilityProbeConfig{
		CodexPath:      *codexPath,
		RepoDir:        *repoDir,
		SandboxMode:    *sandbox,
		ApprovalPolicy: *approval,
	})
	worker := execution.NewRuntimeWorker(execution.RuntimeWorkerConfig{
		RuntimeID:       *runtimeID,
		Executor:        *executorName,
		Version:         "specforge-runtime/0.1",
		RepositoryID:    *repositoryID,
		RepoDir:         *repoDir,
		SessionID:       *runtimeID,
		PollInterval:    *pollInterval,
		Env:             runtimeEnv(),
		AvailableCLIs:   capabilities.AvailableCLIs,
		Sandbox:         capabilities.Sandbox,
		SkillRoots:      capabilities.SkillRoots,
		LocalSkillCount: capabilities.LocalSkillCount,
	}, client, executor)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *once {
		result, err := worker.RunOnce(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "specforge-runtime: %v\n", err)
			os.Exit(1)
		}
		if result == nil || !result.Claimed {
			fmt.Println("specforge-runtime: no task claimed")
			return
		}
		if result.ExecutionResult != nil && (result.ExecutionResult.Status != "completed" || result.ExecutionResult.ExitCode != 0) {
			fmt.Fprintf(os.Stderr, "specforge-runtime: task %d finished with %s\n", result.TaskID, result.ExecutionResult.Status)
			os.Exit(1)
		}
		fmt.Printf("specforge-runtime: task %d completed\n", result.TaskID)
		return
	}
	if err := worker.Run(ctx); err != nil && err != context.Canceled {
		fmt.Fprintf(os.Stderr, "specforge-runtime: %v\n", err)
		os.Exit(1)
	}
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envDurationOrDefault(key string, fallback time.Duration) time.Duration {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return duration
}

func defaultRuntimeID() string {
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		return "local-codex-runtime"
	}
	return "local-" + hostname
}

func runtimeEnv() map[string]string {
	out := map[string]string{}
	for _, key := range []string{"CODEX_HOME", "OPENAI_API_KEY", "OPENAI_BASE_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			out[key] = value
		}
	}
	return out
}
