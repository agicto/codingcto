package runtimecli

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

func Run(commandName, version string) int {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "daemon":
			args = args[1:]
		case "help", "--help", "-h":
			args = append([]string{"--help"}, args[1:]...)
		}
	}

	flags := flag.NewFlagSet(commandName, flag.ContinueOnError)
	apiBaseURL := flags.String("api-base-url", envOrDefault("CODINGCTO_API_BASE_URL", "http://localhost:8025/v1"), "CodingCTO API base URL, including /v1")
	token := flags.String("token", os.Getenv("CODINGCTO_RUNTIME_TOKEN"), "Bearer token for runtime API access")
	runtimeID := flags.String("runtime-id", envOrDefault("CODINGCTO_RUNTIME_ID", defaultRuntimeID()), "Stable runtime id")
	repositoryID := flags.String("repository-id", os.Getenv("CODINGCTO_RUNTIME_REPOSITORY_ID"), "Optional repository id guard for claimed tasks")
	repoDir := flags.String("repo-dir", os.Getenv("CODINGCTO_RUNTIME_REPO_DIR"), "Local repository directory used by Codex CLI")
	once := flags.Bool("once", false, "Run one heartbeat/claim/execute cycle and exit")
	pollInterval := flags.Duration("poll-interval", envDurationOrDefault("CODINGCTO_RUNTIME_POLL_INTERVAL", 10*time.Second), "Polling interval for daemon mode")
	executorName := flags.String("executor", envOrDefault("CODINGCTO_RUNTIME_EXECUTOR", execution.ExecutorNameCodexCLI), "Executor kind: codex_cli or claude_code_cli")
	codexPath := flags.String("codex-path", envOrDefault("CODEX_CLI_PATH", "codex"), "Codex CLI executable path")
	claudePath := flags.String("claude-path", envOrDefault("CLAUDE_CODE_CLI_PATH", "claude"), "Claude Code CLI executable path")
	sandbox := flags.String("sandbox", envOrDefault("CODINGCTO_CODEX_SANDBOX", "workspace-write"), "Codex sandbox mode")
	approval := flags.String("approval-policy", envOrDefault("CODINGCTO_CODEX_APPROVAL_POLICY", "never"), "Codex approval policy")
	timeout := flags.Duration("timeout", envDurationOrDefault("CODINGCTO_CODEX_TIMEOUT", 30*time.Minute), "Per-task Codex timeout")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}

	if strings.TrimSpace(*repoDir) == "" {
		fmt.Fprintf(os.Stderr, "%s: --repo-dir or CODINGCTO_RUNTIME_REPO_DIR is required\n", commandName)
		return 2
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
		Version:         version,
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
			fmt.Fprintf(os.Stderr, "%s: %v\n", commandName, err)
			return 1
		}
		if result == nil || !result.Claimed {
			fmt.Printf("%s: no task claimed\n", commandName)
			return 0
		}
		if result.ExecutionResult != nil && (result.ExecutionResult.Status != "completed" || result.ExecutionResult.ExitCode != 0) {
			fmt.Fprintf(os.Stderr, "%s: task %d finished with %s\n", commandName, result.TaskID, result.ExecutionResult.Status)
			return 1
		}
		fmt.Printf("%s: task %d completed\n", commandName, result.TaskID)
		return 0
	}
	if err := worker.Run(ctx); err != nil && err != context.Canceled {
		fmt.Fprintf(os.Stderr, "%s: %v\n", commandName, err)
		return 1
	}
	return 0
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
