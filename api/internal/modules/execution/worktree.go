package execution

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode"

	"github.com/zgiai/luas/api/internal/domain"
)

type RepositoryResolver interface {
	GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error)
}

type WorktreeManager interface {
	PrepareWorktree(ctx context.Context, req WorktreeRequest) (*Worktree, error)
}

type WorktreeRequest struct {
	Repository *domain.Repository
	BranchName string
	RunID      uint
	TaskID     uint
}

type Worktree struct {
	Path string
}

type LocalGitWorktreeManagerConfig struct {
	RootDir string
}

type LocalGitWorktreeManager struct {
	cfg    LocalGitWorktreeManagerConfig
	runner CommandRunner
}

func NewDefaultWorktreeManager() WorktreeManager {
	return NewLocalGitWorktreeManager(LocalGitWorktreeManagerConfig{}, nil)
}

func NewLocalGitWorktreeManager(cfg LocalGitWorktreeManagerConfig, runner CommandRunner) *LocalGitWorktreeManager {
	if strings.TrimSpace(cfg.RootDir) == "" {
		cfg.RootDir = os.Getenv("SPECFORGE_WORKTREE_ROOT")
	}
	if strings.TrimSpace(cfg.RootDir) == "" {
		cfg.RootDir = filepath.Join(os.TempDir(), "luas-specforge-worktrees")
	}
	if runner == nil {
		runner = OSCommandRunner{}
	}
	return &LocalGitWorktreeManager{cfg: cfg, runner: runner}
}

func (m *LocalGitWorktreeManager) PrepareWorktree(ctx context.Context, req WorktreeRequest) (*Worktree, error) {
	if req.Repository == nil || strings.TrimSpace(req.Repository.RepositoryID) == "" || strings.TrimSpace(req.Repository.GitHubOwner) == "" || strings.TrimSpace(req.Repository.GitHubRepo) == "" {
		return nil, domain.ErrInvalidInput
	}
	branchName := strings.TrimSpace(req.BranchName)
	if branchName == "" || strings.HasPrefix(branchName, "-") {
		return nil, domain.ErrInvalidInput
	}
	rootDir, err := filepath.Abs(m.cfg.RootDir)
	if err != nil {
		return nil, fmt.Errorf("resolve worktree root: %w", err)
	}
	mirrorRoot := filepath.Join(rootDir, "mirrors")
	worktreeRoot := filepath.Join(rootDir, "worktrees")
	if err := os.MkdirAll(mirrorRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create mirror root: %w", err)
	}
	if err := os.MkdirAll(worktreeRoot, 0o755); err != nil {
		return nil, fmt.Errorf("create worktree root: %w", err)
	}

	repositoryKey := sanitizePathPart(req.Repository.RepositoryID)
	mirrorDir := filepath.Join(mirrorRoot, repositoryKey+".git")
	cloneURL := fmt.Sprintf("https://github.com/%s/%s.git", strings.TrimSpace(req.Repository.GitHubOwner), strings.TrimSpace(req.Repository.GitHubRepo))
	if _, err := os.Stat(mirrorDir); os.IsNotExist(err) {
		if result, runErr := m.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"clone", "--mirror", cloneURL, mirrorDir},
		}); runErr != nil || result.ExitCode != 0 {
			return nil, commandFailure("clone mirror repository", result, runErr)
		}
	} else if err != nil {
		return nil, fmt.Errorf("stat mirror repository: %w", err)
	} else {
		if result, runErr := m.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"remote", "set-url", "origin", cloneURL},
			Dir:        mirrorDir,
		}); runErr != nil || result.ExitCode != 0 {
			return nil, commandFailure("update mirror remote", result, runErr)
		}
		if result, runErr := m.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"fetch", "--prune", "origin"},
			Dir:        mirrorDir,
		}); runErr != nil || result.ExitCode != 0 {
			return nil, commandFailure("fetch mirror repository", result, runErr)
		}
	}

	worktreeDir := filepath.Join(worktreeRoot, fmt.Sprintf("run-%d-task-%d-%s", req.RunID, req.TaskID, sanitizePathPart(branchName)))
	if !strings.HasPrefix(worktreeDir, worktreeRoot+string(os.PathSeparator)) {
		return nil, domain.ErrInvalidInput
	}
	if err := os.RemoveAll(worktreeDir); err != nil {
		return nil, fmt.Errorf("remove stale worktree: %w", err)
	}
	if result, runErr := m.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"worktree", "prune"},
		Dir:        mirrorDir,
	}); runErr != nil || result.ExitCode != 0 {
		return nil, commandFailure("prune stale worktrees", result, runErr)
	}
	if result, runErr := m.runner.Run(ctx, CommandSpec{
		Executable: "git",
		Args:       []string{"worktree", "add", "--force", "-B", branchName, worktreeDir, "origin/" + branchName},
		Dir:        mirrorDir,
	}); runErr != nil || result.ExitCode != 0 {
		if !isMissingRemoteBranchFailure(result, runErr) {
			return nil, commandFailure("create task worktree", result, runErr)
		}
		if fallback, fallbackErr := m.runner.Run(ctx, CommandSpec{
			Executable: "git",
			Args:       []string{"worktree", "add", "--force", "-B", branchName, worktreeDir, "HEAD"},
			Dir:        mirrorDir,
		}); fallbackErr != nil || fallback.ExitCode != 0 {
			return nil, commandFailure("create fallback task worktree", fallback, fallbackErr)
		}
	}
	return &Worktree{Path: worktreeDir}, nil
}

func sanitizePathPart(value string) string {
	value = strings.TrimSpace(value)
	var builder strings.Builder
	builder.Grow(len(value))
	lastDash := false
	for _, r := range value {
		allowed := unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '-'
		if allowed {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(builder.String(), "-.")
	if out == "" {
		return "item"
	}
	return out
}
