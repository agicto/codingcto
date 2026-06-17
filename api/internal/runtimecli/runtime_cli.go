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

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/execution"
)

func Run(commandName, version string) int {
	args := os.Args[1:]
	if len(args) == 0 {
		printUsage(commandName)
		return 0
	}
	switch args[0] {
	case "up":
		return runUp(commandName, version, args[1:])
	case "status":
		return runStatus(commandName, args[1:])
	case "doctor":
		return runDoctor(commandName, args[1:])
	case "configure":
		return runConfigure(commandName, args[1:])
	case "daemon":
		return runDaemon(commandName, version, args[1:])
	case "help", "--help", "-h":
		printUsage(commandName)
		return 0
	default:
		if strings.HasPrefix(args[0], "-") {
			return runDaemon(commandName, version, args)
		}
		fmt.Fprintf(os.Stderr, "%s: unknown command %q\n", commandName, args[0])
		printUsage(commandName)
		return 2
	}
}

func printUsage(commandName string) {
	fmt.Printf(`%s local agent

Usage:
  %s up [--once]
  %s status
  %s doctor
  %s configure [--api-base-url URL] [--token TOKEN] [--repo-root PATH]
  %s daemon [advanced flags]

`, commandName, commandName, commandName, commandName, commandName, commandName)
}

func runDaemon(commandName, version string, args []string) int {
	flags := flag.NewFlagSet(commandName, flag.ContinueOnError)
	apiBaseURL := flags.String("api-base-url", envOrDefault("CODINGCTO_API_BASE_URL", envOrDefault("SPECFORGE_API_BASE_URL", "http://localhost:2010/v1")), "CodingCTO API base URL, including /v1")
	token := flags.String("token", envOrDefault("CODINGCTO_RUNTIME_TOKEN", envOrDefault("SPECFORGE_RUNTIME_TOKEN", execution.LocalRuntimeToken())), "Bearer token for runtime API access")
	runtimeID := flags.String("runtime-id", envOrDefault("CODINGCTO_RUNTIME_ID", envOrDefault("SPECFORGE_RUNTIME_ID", defaultRuntimeID())), "Stable runtime id")
	repositoryID := flags.String("repository-id", envOrDefault("CODINGCTO_RUNTIME_REPOSITORY_ID", os.Getenv("SPECFORGE_RUNTIME_REPOSITORY_ID")), "Optional repository id guard for claimed tasks")
	repoDir := flags.String("repo-dir", envOrDefault("CODINGCTO_RUNTIME_REPO_DIR", os.Getenv("SPECFORGE_RUNTIME_REPO_DIR")), "Local repository directory used by the selected AI CLI")
	once := flags.Bool("once", false, "Run one heartbeat/claim/execute cycle and exit")
	pollInterval := flags.Duration("poll-interval", envDurationOrDefault("CODINGCTO_RUNTIME_POLL_INTERVAL", envDurationOrDefault("SPECFORGE_RUNTIME_POLL_INTERVAL", 10*time.Second)), "Polling interval for daemon mode")
	maxConcurrency := flags.Int("max-concurrency", envIntOrDefault("CODINGCTO_RUNTIME_MAX_CONCURRENCY", envIntOrDefault("SPECFORGE_RUNTIME_MAX_CONCURRENCY", 1)), "Maximum task slots this runtime should advertise")
	executorName := flags.String("executor", envOrDefault("CODINGCTO_RUNTIME_EXECUTOR", envOrDefault("SPECFORGE_RUNTIME_EXECUTOR", execution.ExecutorNameCodexCLI)), "Executor kind: codex_cli, kimi_cli, or claude_code_cli")
	codexPath := flags.String("codex-path", envOrDefault("CODEX_CLI_PATH", "codex"), "Codex CLI executable path")
	claudePath := flags.String("claude-path", envOrDefault("CLAUDE_CODE_CLI_PATH", "claude"), "Claude Code CLI executable path")
	kimiPath := flags.String("kimi-path", envOrDefault("KIMI_CLI_PATH", "kimi"), "Kimi CLI executable path")
	sandbox := flags.String("sandbox", envOrDefault("CODINGCTO_CODEX_SANDBOX", envOrDefault("SPECFORGE_CODEX_SANDBOX", "workspace-write")), "Codex sandbox mode")
	approval := flags.String("approval-policy", envOrDefault("CODINGCTO_CODEX_APPROVAL_POLICY", envOrDefault("SPECFORGE_CODEX_APPROVAL_POLICY", "never")), "Codex approval policy")
	timeout := flags.Duration("timeout", envDurationOrDefault("CODINGCTO_CODEX_TIMEOUT", envDurationOrDefault("SPECFORGE_CODEX_TIMEOUT", 30*time.Minute)), "Per-task executor timeout")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}

	if strings.TrimSpace(*repoDir) == "" {
		fmt.Fprintf(os.Stderr, "%s: --repo-dir, CODINGCTO_RUNTIME_REPO_DIR, or SPECFORGE_RUNTIME_REPO_DIR is required\n", commandName)
		return 2
	}
	client := execution.NewRuntimeHTTPClient(execution.RuntimeHTTPClientConfig{
		BaseURL: *apiBaseURL,
		Token:   *token,
	})
	executorFactory := execution.NewExecutorFactory(execution.ExecutorFactoryConfig{
		CodexPath:      *codexPath,
		ClaudePath:     *claudePath,
		KimiPath:       *kimiPath,
		SandboxMode:    *sandbox,
		ApprovalPolicy: *approval,
		Timeout:        *timeout,
	}, nil)
	executor := executorFactory.MustCreate(*executorName)
	capabilities := execution.DetectRuntimeCapabilities(execution.RuntimeCapabilityProbeConfig{
		CodexPath:      *codexPath,
		ClaudePath:     *claudePath,
		KimiPath:       *kimiPath,
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
		Repositories:    daemonRepositories(*repositoryID, *repoDir),
		LocalSkillCount: capabilities.LocalSkillCount,
		MaxConcurrency:  *maxConcurrency,
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

func daemonRepositories(repositoryID, repoDir string) []domain.SpecForgeRuntimeRepository {
	repositoryID = strings.TrimSpace(repositoryID)
	repoDir = strings.TrimSpace(repoDir)
	if repositoryID == "" || repoDir == "" {
		return nil
	}
	return []domain.SpecForgeRuntimeRepository{{RepositoryID: repositoryID, RepoDir: repoDir}}
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func envIntOrDefault(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	var parsed int
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
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
	for _, key := range []string{"CODEX_HOME", "OPENAI_API_KEY", "OPENAI_BASE_URL", "KIMI_API_KEY", "KIMI_BASE_URL"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			out[key] = value
		}
	}
	return out
}
