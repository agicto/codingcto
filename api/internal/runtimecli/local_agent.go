package runtimecli

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/execution"
)

const (
	defaultAPIBaseURL = "http://localhost:2010/v1"
	configDirName     = ".codingcto"
	configFileName    = "config.json"
)

type LocalAgentConfig struct {
	APIBaseURL     string   `json:"api_base_url"`
	RuntimeToken   string   `json:"runtime_token,omitempty"`
	RepoRoots      []string `json:"repo_roots,omitempty"`
	PollInterval   string   `json:"poll_interval,omitempty"`
	MaxConcurrency int      `json:"max_concurrency,omitempty"`
	CodexPath      string   `json:"codex_path,omitempty"`
	ClaudePath     string   `json:"claude_path,omitempty"`
	KimiPath       string   `json:"kimi_path,omitempty"`
	Sandbox        string   `json:"sandbox,omitempty"`
	ApprovalPolicy string   `json:"approval_policy,omitempty"`
	Timeout        string   `json:"timeout,omitempty"`
}

type localAgentRuntime struct {
	executor string
	worker   *execution.RuntimeWorker
}

func runUp(commandName, version string, args []string) int {
	flags := flag.NewFlagSet(commandName+" up", flag.ContinueOnError)
	apiBaseURL := flags.String("api-base-url", "", "CodingCTO API base URL, including /v1")
	token := flags.String("token", "", "Bearer token for runtime API access")
	repoRoot := flags.String("repo-root", "", "Repository root or directory containing repositories")
	once := flags.Bool("once", false, "Run one heartbeat/claim/execute cycle and exit")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}

	cfg, _, err := loadLocalAgentConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s up: %v\n", commandName, err)
		return 1
	}
	applyLocalAgentEnv(&cfg)
	if strings.TrimSpace(*apiBaseURL) != "" {
		cfg.APIBaseURL = strings.TrimSpace(*apiBaseURL)
	}
	if strings.TrimSpace(*token) != "" {
		cfg.RuntimeToken = strings.TrimSpace(*token)
	}
	if strings.TrimSpace(*repoRoot) != "" {
		cfg.RepoRoots = append(cfg.RepoRoots, strings.TrimSpace(*repoRoot))
	}
	cfg = normalizeLocalAgentConfig(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	runtimes, report, err := buildLocalAgentRuntimes(cfg, version)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s up: %v\n", commandName, err)
		return 1
	}
	printLocalAgentStartup(report, cfg, runtimes)
	if len(runtimes) == 0 {
		fmt.Fprintf(os.Stderr, "%s up: no executable CodingCTO CLI backends detected\n", commandName)
		return 1
	}
	if *once {
		for _, runtime := range runtimes {
			result, err := runtime.worker.RunOnce(ctx)
			if err != nil {
				fmt.Fprintf(os.Stderr, "%s up: %s: %v\n", commandName, runtime.executor, err)
				return 1
			}
			if result != nil && result.Claimed {
				fmt.Printf("%s up: %s completed task %d\n", commandName, runtime.executor, result.TaskID)
				if result.ExecutionResult != nil && result.ExecutionResult.Status != "completed" {
					return 1
				}
			}
		}
		return 0
	}
	return runLocalAgentLoop(ctx, commandName, cfg, runtimes)
}

func runStatus(commandName string, args []string) int {
	flags := flag.NewFlagSet(commandName+" status", flag.ContinueOnError)
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	cfg, path, err := loadLocalAgentConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s status: %v\n", commandName, err)
		return 1
	}
	applyLocalAgentEnv(&cfg)
	cfg = normalizeLocalAgentConfig(cfg)
	report := inspectLocalAgent(cfg)
	fmt.Printf("Config: %s\n", path)
	fmt.Printf("API: %s\n", cfg.APIBaseURL)
	fmt.Printf("Token: %s\n", tokenStatus(cfg.RuntimeToken))
	printCLIReport(report.AvailableCLIs)
	printRepositoryReport(report.Repositories)
	return 0
}

func runDoctor(commandName string, args []string) int {
	flags := flag.NewFlagSet(commandName+" doctor", flag.ContinueOnError)
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	cfg, _, err := loadLocalAgentConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s doctor: %v\n", commandName, err)
		return 1
	}
	applyLocalAgentEnv(&cfg)
	cfg = normalizeLocalAgentConfig(cfg)
	report := inspectLocalAgent(cfg)

	failures := 0
	if err := checkLocalAPI(cfg.APIBaseURL); err != nil {
		failures++
		fmt.Printf("API: fail - %v\n", err)
	} else {
		fmt.Printf("API: ok - %s\n", cfg.APIBaseURL)
	}
	if runtimeExecutableCount(report.AvailableCLIs) == 0 {
		failures++
		fmt.Println("CLI: fail - install Codex, Claude, or Kimi CLI before running ccto up")
	} else {
		fmt.Printf("CLI: ok - %d executable backend(s)\n", runtimeExecutableCount(report.AvailableCLIs))
	}
	if len(report.Repositories) == 0 {
		failures++
		fmt.Println("Repos: fail - run from a GitHub repository or configure repo_roots")
	} else {
		fmt.Printf("Repos: ok - %d GitHub repo(s) discovered\n", len(report.Repositories))
	}
	if strings.TrimSpace(cfg.RuntimeToken) == "" {
		failures++
		fmt.Println("Token: fail - configure CODINGCTO_RUNTIME_TOKEN or local config")
	} else {
		fmt.Printf("Token: ok - %s\n", tokenStatus(cfg.RuntimeToken))
	}
	if failures > 0 {
		return 1
	}
	return 0
}

func runConfigure(commandName string, args []string) int {
	flags := flag.NewFlagSet(commandName+" configure", flag.ContinueOnError)
	apiBaseURL := flags.String("api-base-url", "", "CodingCTO API base URL, including /v1")
	token := flags.String("token", "", "Bearer token for runtime API access")
	repoRoot := flags.String("repo-root", "", "Repository root or directory containing repositories")
	if err := flags.Parse(args); err != nil {
		if err == flag.ErrHelp {
			return 0
		}
		return 2
	}
	cfg, path, err := loadLocalAgentConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s configure: %v\n", commandName, err)
		return 1
	}
	if strings.TrimSpace(*apiBaseURL) != "" {
		cfg.APIBaseURL = strings.TrimSpace(*apiBaseURL)
	}
	if strings.TrimSpace(*token) != "" {
		cfg.RuntimeToken = strings.TrimSpace(*token)
	}
	if strings.TrimSpace(*repoRoot) != "" {
		cfg.RepoRoots = append(cfg.RepoRoots, strings.TrimSpace(*repoRoot))
	}
	cfg = normalizeLocalAgentConfig(cfg)
	if err := saveLocalAgentConfig(path, cfg); err != nil {
		fmt.Fprintf(os.Stderr, "%s configure: %v\n", commandName, err)
		return 1
	}
	fmt.Printf("Saved ccto config to %s\n", path)
	return 0
}

func runLocalAgentLoop(ctx context.Context, commandName string, cfg LocalAgentConfig, runtimes []localAgentRuntime) int {
	interval := configDuration(cfg.PollInterval, 10*time.Second)
	for {
		select {
		case <-ctx.Done():
			deregisterLocalAgentRuntimes(cfg, runtimes)
			return 0
		default:
		}
		for _, runtime := range runtimes {
			if _, err := runtime.worker.RunOnce(ctx); err != nil {
				fmt.Fprintf(os.Stderr, "%s up: %s: %v\n", commandName, runtime.executor, err)
			}
		}
		timer := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			timer.Stop()
			deregisterLocalAgentRuntimes(cfg, runtimes)
			return 0
		case <-timer.C:
		}
	}
}

func buildLocalAgentRuntimes(cfg LocalAgentConfig, version string) ([]localAgentRuntime, RuntimeCapabilityView, error) {
	report := inspectLocalAgent(cfg)
	client := execution.NewRuntimeHTTPClient(execution.RuntimeHTTPClientConfig{
		BaseURL: cfg.APIBaseURL,
		Token:   cfg.RuntimeToken,
	})
	factory := execution.NewExecutorFactory(execution.ExecutorFactoryConfig{
		CodexPath:      firstNonEmpty(cfg.CodexPath, "codex"),
		ClaudePath:     firstNonEmpty(cfg.ClaudePath, "claude"),
		KimiPath:       firstNonEmpty(cfg.KimiPath, "kimi"),
		SandboxMode:    firstNonEmpty(cfg.Sandbox, "workspace-write"),
		ApprovalPolicy: firstNonEmpty(cfg.ApprovalPolicy, "never"),
		Timeout:        configDuration(cfg.Timeout, 30*time.Minute),
	}, nil)
	executors := executableBackends(report.AvailableCLIs)
	runtimes := make([]localAgentRuntime, 0, len(executors))
	for _, executorName := range executors {
		executor := factory.MustCreate(executorName)
		runtimeID := stableRuntimeID(executorName)
		worker := execution.NewRuntimeWorker(execution.RuntimeWorkerConfig{
			RuntimeID:       runtimeID,
			Executor:        executorName,
			Version:         version,
			SessionID:       runtimeID,
			PollInterval:    configDuration(cfg.PollInterval, 10*time.Second),
			Env:             runtimeEnv(),
			AvailableCLIs:   report.AvailableCLIs,
			Sandbox:         report.Sandbox,
			SkillRoots:      report.SkillRoots,
			Repositories:    report.Repositories,
			LocalSkillCount: report.LocalSkillCount,
			MaxConcurrency:  cfg.MaxConcurrency,
		}, client, executor)
		runtimes = append(runtimes, localAgentRuntime{executor: executorName, worker: worker})
	}
	return runtimes, report, nil
}

func deregisterLocalAgentRuntimes(cfg LocalAgentConfig, runtimes []localAgentRuntime) {
	ids := make([]string, 0, len(runtimes))
	for _, runtime := range runtimes {
		ids = append(ids, stableRuntimeID(runtime.executor))
	}
	if len(ids) == 0 {
		return
	}
	client := execution.NewRuntimeHTTPClient(execution.RuntimeHTTPClientConfig{BaseURL: cfg.APIBaseURL, Token: cfg.RuntimeToken})
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_, _ = client.Deregister(ctx, &execution.RuntimeDeregisterRequest{RuntimeIDs: ids})
}

type RuntimeCapabilityView struct {
	AvailableCLIs   []domain.SpecForgeRuntimeCLI
	Sandbox         *domain.SpecForgeRuntimeSandbox
	SkillRoots      []domain.SpecForgeRuntimeSkillRoot
	Repositories    []domain.SpecForgeRuntimeRepository
	LocalSkillCount int
}

func inspectLocalAgent(cfg LocalAgentConfig) RuntimeCapabilityView {
	repositories := discoverRuntimeRepositories(cfg.RepoRoots)
	repoDir := ""
	if len(repositories) > 0 {
		repoDir = repositories[0].RepoDir
	}
	report := execution.DetectRuntimeCapabilities(execution.RuntimeCapabilityProbeConfig{
		CodexPath:      firstNonEmpty(cfg.CodexPath, "codex"),
		ClaudePath:     firstNonEmpty(cfg.ClaudePath, "claude"),
		KimiPath:       firstNonEmpty(cfg.KimiPath, "kimi"),
		RepoDir:        repoDir,
		SandboxMode:    firstNonEmpty(cfg.Sandbox, "workspace-write"),
		ApprovalPolicy: firstNonEmpty(cfg.ApprovalPolicy, "never"),
	})
	return RuntimeCapabilityView{
		AvailableCLIs:   report.AvailableCLIs,
		Sandbox:         report.Sandbox,
		SkillRoots:      report.SkillRoots,
		Repositories:    repositories,
		LocalSkillCount: report.LocalSkillCount,
	}
}

func loadLocalAgentConfig() (LocalAgentConfig, string, error) {
	path, err := localAgentConfigPath()
	if err != nil {
		return LocalAgentConfig{}, "", err
	}
	cfg := LocalAgentConfig{}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return normalizeLocalAgentConfig(cfg), path, nil
		}
		return LocalAgentConfig{}, path, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return LocalAgentConfig{}, path, fmt.Errorf("decode ccto config: %w", err)
	}
	return normalizeLocalAgentConfig(cfg), path, nil
}

func saveLocalAgentConfig(path string, cfg LocalAgentConfig) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o600)
}

func localAgentConfigPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(home) == "" {
		return "", fmt.Errorf("find user home: %w", err)
	}
	return filepath.Join(home, configDirName, configFileName), nil
}

func normalizeLocalAgentConfig(cfg LocalAgentConfig) LocalAgentConfig {
	cfg.APIBaseURL = firstNonEmpty(cfg.APIBaseURL, defaultAPIBaseURL)
	cfg.RuntimeToken = firstNonEmpty(cfg.RuntimeToken, execution.LocalRuntimeToken())
	cfg.PollInterval = firstNonEmpty(cfg.PollInterval, "10s")
	cfg.CodexPath = firstNonEmpty(cfg.CodexPath, "codex")
	cfg.ClaudePath = firstNonEmpty(cfg.ClaudePath, "claude")
	cfg.KimiPath = firstNonEmpty(cfg.KimiPath, "kimi")
	cfg.Sandbox = firstNonEmpty(cfg.Sandbox, "workspace-write")
	cfg.ApprovalPolicy = firstNonEmpty(cfg.ApprovalPolicy, "never")
	cfg.Timeout = firstNonEmpty(cfg.Timeout, "30m")
	if cfg.MaxConcurrency <= 0 {
		cfg.MaxConcurrency = 1
	}
	cfg.RepoRoots = compactUniquePaths(cfg.RepoRoots)
	if cwd, err := os.Getwd(); err == nil && strings.TrimSpace(cwd) != "" {
		cfg.RepoRoots = compactUniquePaths(append([]string{cwd}, cfg.RepoRoots...))
	}
	return cfg
}

func applyLocalAgentEnv(cfg *LocalAgentConfig) {
	if value := strings.TrimSpace(os.Getenv("CODINGCTO_API_BASE_URL")); value != "" {
		cfg.APIBaseURL = value
	} else if value := strings.TrimSpace(os.Getenv("SPECFORGE_API_BASE_URL")); value != "" {
		cfg.APIBaseURL = value
	}
	if value := strings.TrimSpace(os.Getenv("CODINGCTO_RUNTIME_TOKEN")); value != "" {
		cfg.RuntimeToken = value
	} else if value := strings.TrimSpace(os.Getenv("SPECFORGE_RUNTIME_TOKEN")); value != "" {
		cfg.RuntimeToken = value
	}
	if value := strings.TrimSpace(os.Getenv("CODEX_CLI_PATH")); value != "" {
		cfg.CodexPath = value
	}
	if value := strings.TrimSpace(os.Getenv("CLAUDE_CODE_CLI_PATH")); value != "" {
		cfg.ClaudePath = value
	}
	if value := strings.TrimSpace(os.Getenv("KIMI_CLI_PATH")); value != "" {
		cfg.KimiPath = value
	}
}

func configDuration(value string, fallback time.Duration) time.Duration {
	duration, err := time.ParseDuration(strings.TrimSpace(value))
	if err != nil || duration <= 0 {
		return fallback
	}
	return duration
}

func stableRuntimeID(executor string) string {
	hostname, err := os.Hostname()
	if err != nil || strings.TrimSpace(hostname) == "" {
		hostname = "local"
	}
	sum := sha1.Sum([]byte(hostname + "|" + executor))
	return "local-" + sanitizeRuntimePart(hostname) + "-" + sanitizeRuntimePart(executor) + "-" + hex.EncodeToString(sum[:])[:8]
}

func sanitizeRuntimePart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '-' {
			b.WriteRune(r)
		} else if r == '.' || r == ' ' {
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-_")
	if out == "" {
		return "runtime"
	}
	if len(out) > 48 {
		return out[:48]
	}
	return out
}

func executableBackends(clis []domain.SpecForgeRuntimeCLI) []string {
	commandAvailable := map[string]bool{}
	for _, cli := range clis {
		if cli.Available {
			commandAvailable[strings.TrimSpace(cli.Command)] = true
		}
	}
	out := []string{}
	if commandAvailable["codex"] {
		out = append(out, execution.ExecutorNameCodexCLI)
	}
	if commandAvailable["claude"] {
		out = append(out, execution.ExecutorNameClaudeCodeCLI)
	}
	if commandAvailable["kimi"] {
		out = append(out, execution.ExecutorNameKimiCLI)
	}
	return out
}

func runtimeExecutableCount(clis []domain.SpecForgeRuntimeCLI) int {
	return len(executableBackends(clis))
}

func printLocalAgentStartup(report RuntimeCapabilityView, cfg LocalAgentConfig, runtimes []localAgentRuntime) {
	fmt.Printf("ccto local agent\n")
	fmt.Printf("API: %s\n", cfg.APIBaseURL)
	fmt.Printf("Token: %s\n", tokenStatus(cfg.RuntimeToken))
	fmt.Printf("Executable runtimes: %d\n", len(runtimes))
	printCLIReport(report.AvailableCLIs)
	printRepositoryReport(report.Repositories)
}

func printCLIReport(clis []domain.SpecForgeRuntimeCLI) {
	fmt.Println("CLIs:")
	for _, cli := range clis {
		status := "missing"
		if cli.Available {
			status = "available"
		}
		version := strings.TrimSpace(cli.Version)
		if version != "" {
			version = " - " + version
		}
		fmt.Printf("  - %s (%s): %s%s\n", cli.Name, cli.Command, status, version)
	}
}

func printRepositoryReport(repositories []domain.SpecForgeRuntimeRepository) {
	fmt.Println("Repositories:")
	if len(repositories) == 0 {
		fmt.Println("  - none discovered")
		return
	}
	for _, repository := range repositories {
		dirty := "clean"
		if repository.Dirty {
			dirty = "dirty"
		}
		fmt.Printf("  - %s: %s [%s %s]\n", repository.RepositoryID, repository.RepoDir, firstNonEmpty(repository.Branch, "detached"), dirty)
	}
}

func tokenStatus(token string) string {
	token = strings.TrimSpace(token)
	if token == "" {
		return "missing"
	}
	if token == execution.LocalRuntimeToken() {
		return "local development token"
	}
	return "configured"
}

func checkLocalAPI(apiBaseURL string) error {
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(apiBaseURL, "/")+"/health", nil)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("GET /health returned %d", resp.StatusCode)
	}
	return nil
}

func compactUniquePaths(values []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		abs, err := filepath.Abs(value)
		if err == nil {
			value = abs
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	sort.Strings(out)
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
