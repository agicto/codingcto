package execution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type RuntimeCapabilityProbeConfig struct {
	CodexPath      string
	RepoDir        string
	SandboxMode    string
	ApprovalPolicy string
}

type RuntimeCapabilityReport struct {
	AvailableCLIs   []domain.SpecForgeRuntimeCLI
	Sandbox         *domain.SpecForgeRuntimeSandbox
	SkillRoots      []domain.SpecForgeRuntimeSkillRoot
	LocalSkillCount int
}

func DetectRuntimeCapabilities(cfg RuntimeCapabilityProbeConfig) RuntimeCapabilityReport {
	roots := detectRuntimeSkillRoots(cfg.RepoDir)
	return RuntimeCapabilityReport{
		AvailableCLIs:   detectRuntimeCLIs(cfg.CodexPath),
		Sandbox:         detectRuntimeSandbox(cfg.SandboxMode, cfg.ApprovalPolicy),
		SkillRoots:      roots,
		LocalSkillCount: countRuntimeSkills(roots),
	}
}

func normalizeRuntimeCLIs(clis []domain.SpecForgeRuntimeCLI) []domain.SpecForgeRuntimeCLI {
	out := make([]domain.SpecForgeRuntimeCLI, 0, len(clis))
	seen := map[string]struct{}{}
	for _, cli := range clis {
		command := limitRuntimeCapabilityString(cli.Command, 120)
		if command == "" {
			continue
		}
		key := command + "|" + limitRuntimeCapabilityString(cli.Path, 500)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		name := limitRuntimeCapabilityString(cli.Name, 120)
		if name == "" {
			name = command
		}
		out = append(out, domain.SpecForgeRuntimeCLI{
			Name:      name,
			Command:   command,
			Path:      limitRuntimeCapabilityString(cli.Path, 500),
			Version:   limitRuntimeCapabilityString(cli.Version, 160),
			Available: cli.Available,
		})
		if len(out) >= 20 {
			break
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Available != out[j].Available {
			return out[i].Available
		}
		return out[i].Command < out[j].Command
	})
	return out
}

func normalizeRuntimeSandbox(sandbox *domain.SpecForgeRuntimeSandbox) *domain.SpecForgeRuntimeSandbox {
	if sandbox == nil {
		return nil
	}
	return &domain.SpecForgeRuntimeSandbox{
		Provider:       limitRuntimeCapabilityString(sandbox.Provider, 100),
		Mode:           limitRuntimeCapabilityString(sandbox.Mode, 100),
		NetworkAccess:  sandbox.NetworkAccess,
		Writable:       sandbox.Writable,
		ApprovalPolicy: limitRuntimeCapabilityString(sandbox.ApprovalPolicy, 100),
		Reason:         limitRuntimeCapabilityString(sandbox.Reason, 500),
	}
}

func normalizeRuntimeSkillRoots(roots []domain.SpecForgeRuntimeSkillRoot) []domain.SpecForgeRuntimeSkillRoot {
	out := make([]domain.SpecForgeRuntimeSkillRoot, 0, len(roots))
	seen := map[string]struct{}{}
	for _, root := range roots {
		provider := limitRuntimeCapabilityString(root.Provider, 100)
		path := limitRuntimeCapabilityString(root.Path, 500)
		if provider == "" || path == "" {
			continue
		}
		key := provider + "|" + path
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, domain.SpecForgeRuntimeSkillRoot{
			Provider: provider,
			Path:     path,
			Writable: root.Writable,
		})
		if len(out) >= 20 {
			break
		}
	}
	return out
}

func runtimeCapabilitiesHash(clis []domain.SpecForgeRuntimeCLI, sandbox *domain.SpecForgeRuntimeSandbox, roots []domain.SpecForgeRuntimeSkillRoot, localSkillCount int) string {
	payload := RuntimeCapabilityReport{
		AvailableCLIs:   normalizeRuntimeCLIs(clis),
		Sandbox:         normalizeRuntimeSandbox(sandbox),
		SkillRoots:      normalizeRuntimeSkillRoots(roots),
		LocalSkillCount: localSkillCount,
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func detectRuntimeCLIs(codexPath string) []domain.SpecForgeRuntimeCLI {
	candidates := []struct {
		name     string
		command  string
		override string
	}{
		{name: "Codex CLI", command: "codex", override: strings.TrimSpace(codexPath)},
		{name: "Claude Code", command: "claude"},
		{name: "GitHub Copilot CLI", command: "copilot"},
		{name: "Gemini CLI", command: "gemini"},
		{name: "OpenCode", command: "opencode"},
		{name: "OpenClaw", command: "openclaw"},
		{name: "Cursor Agent", command: "cursor-agent"},
		{name: "Kimi CLI", command: "kimi"},
		{name: "Kiro CLI", command: "kiro"},
	}
	out := make([]domain.SpecForgeRuntimeCLI, 0, len(candidates))
	for _, candidate := range candidates {
		command := candidate.command
		path := ""
		if candidate.override != "" {
			command = candidate.override
		}
		if resolved, err := exec.LookPath(command); err == nil {
			path = resolved
		}
		available := path != ""
		version := ""
		if available {
			version = runtimeCLIVersion(path)
		}
		out = append(out, domain.SpecForgeRuntimeCLI{
			Name:      candidate.name,
			Command:   candidate.command,
			Path:      path,
			Version:   version,
			Available: available,
		})
	}
	return normalizeRuntimeCLIs(out)
}

func runtimeCLIVersion(path string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, path, "--version").CombinedOutput()
	if err != nil || len(output) == 0 {
		return ""
	}
	line := strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0])
	return limitRuntimeCapabilityString(line, 160)
}

func detectRuntimeSandbox(mode, approvalPolicy string) *domain.SpecForgeRuntimeSandbox {
	mode = firstNonEmpty(mode, "workspace-write")
	approvalPolicy = firstNonEmpty(approvalPolicy, "never")
	networkAccess := mode != "read-only"
	reason := "Codex CLI sandbox policy reported by the local runtime."
	if runtime.GOOS == "darwin" && mode == "workspace-write" {
		reason = "macOS Codex runtimes may require broader filesystem permissions while preserving the reported workspace-write intent."
	}
	return normalizeRuntimeSandbox(&domain.SpecForgeRuntimeSandbox{
		Provider:       "codex_cli",
		Mode:           mode,
		NetworkAccess:  networkAccess,
		Writable:       mode != "read-only",
		ApprovalPolicy: approvalPolicy,
		Reason:         reason,
	})
}

func detectRuntimeSkillRoots(repoDir string) []domain.SpecForgeRuntimeSkillRoot {
	roots := []domain.SpecForgeRuntimeSkillRoot{}
	if codeHome := strings.TrimSpace(os.Getenv("CODEX_HOME")); codeHome != "" {
		roots = append(roots, runtimeSkillRoot("codex", filepath.Join(codeHome, "skills")))
	} else if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
		roots = append(roots, runtimeSkillRoot("codex", filepath.Join(home, ".codex", "skills")))
	}
	repoDir = strings.TrimSpace(repoDir)
	if repoDir != "" {
		roots = append(roots,
			runtimeSkillRoot("claude", filepath.Join(repoDir, ".claude", "skills")),
			runtimeSkillRoot("copilot", filepath.Join(repoDir, ".github", "skills")),
			runtimeSkillRoot("opencode", filepath.Join(repoDir, ".opencode", "skills")),
			runtimeSkillRoot("cursor", filepath.Join(repoDir, ".cursor", "skills")),
			runtimeSkillRoot("generic", filepath.Join(repoDir, ".agent_context", "skills")),
		)
	}
	return normalizeRuntimeSkillRoots(roots)
}

func runtimeSkillRoot(provider, path string) domain.SpecForgeRuntimeSkillRoot {
	return domain.SpecForgeRuntimeSkillRoot{
		Provider: provider,
		Path:     path,
		Writable: pathIsWritable(path),
	}
}

func pathIsWritable(path string) bool {
	if strings.TrimSpace(path) == "" {
		return false
	}
	if info, err := os.Stat(path); err == nil {
		return info.IsDir() && directoryIsWritable(path)
	}
	parent := filepath.Dir(path)
	if info, err := os.Stat(parent); err == nil {
		return info.IsDir() && directoryIsWritable(parent)
	}
	return false
}

func directoryIsWritable(path string) bool {
	file, err := os.CreateTemp(path, ".specforge-write-check-*")
	if err != nil {
		return false
	}
	name := file.Name()
	_ = file.Close()
	_ = os.Remove(name)
	return true
}

func countRuntimeSkills(roots []domain.SpecForgeRuntimeSkillRoot) int {
	seen := map[string]struct{}{}
	for _, root := range roots {
		path := strings.TrimSpace(root.Path)
		if path == "" {
			continue
		}
		_ = filepath.WalkDir(path, func(candidate string, entry os.DirEntry, err error) error {
			if err != nil || entry == nil || entry.IsDir() {
				return nil
			}
			if strings.EqualFold(entry.Name(), "SKILL.md") {
				seen[filepath.Dir(candidate)] = struct{}{}
			}
			return nil
		})
	}
	return len(seen)
}

func limitRuntimeCapabilityString(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) <= max {
		return value
	}
	return value[:max]
}
