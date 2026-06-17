package runtimecli

import (
	"context"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

func discoverRuntimeRepositories(roots []string) []domain.SpecForgeRuntimeRepository {
	candidates := discoverRepositoryCandidates(roots)
	out := make([]domain.SpecForgeRuntimeRepository, 0, len(candidates))
	seen := map[string]struct{}{}
	for _, candidate := range candidates {
		repository := inspectRuntimeRepository(candidate)
		if strings.TrimSpace(repository.RepositoryID) == "" || strings.TrimSpace(repository.RepoDir) == "" {
			continue
		}
		key := repository.RepositoryID + "|" + repository.RepoDir
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, repository)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RepositoryID != out[j].RepositoryID {
			return out[i].RepositoryID < out[j].RepositoryID
		}
		return out[i].RepoDir < out[j].RepoDir
	})
	return out
}

func discoverRepositoryCandidates(roots []string) []string {
	seen := map[string]struct{}{}
	out := []string{}
	for _, root := range roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		abs, err := filepath.Abs(root)
		if err == nil {
			root = abs
		}
		if gitRoot := gitWorktreeRoot(root); gitRoot != "" {
			if _, ok := seen[gitRoot]; !ok {
				seen[gitRoot] = struct{}{}
				out = append(out, gitRoot)
			}
			continue
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			child := filepath.Join(root, entry.Name())
			gitRoot := gitWorktreeRoot(child)
			if gitRoot == "" {
				continue
			}
			if _, ok := seen[gitRoot]; ok {
				continue
			}
			seen[gitRoot] = struct{}{}
			out = append(out, gitRoot)
		}
	}
	sort.Strings(out)
	return out
}

func inspectRuntimeRepository(repoDir string) domain.SpecForgeRuntimeRepository {
	repoDir = strings.TrimSpace(repoDir)
	remoteURL := runGitLine(repoDir, "remote", "get-url", "origin")
	repositoryID := repositoryIDFromRemote(remoteURL)
	branch := runGitLine(repoDir, "branch", "--show-current")
	if strings.TrimSpace(branch) == "" {
		branch = "detached"
	}
	status := runGitLine(repoDir, "status", "--porcelain")
	return domain.SpecForgeRuntimeRepository{
		RepositoryID: repositoryID,
		RepoDir:      repoDir,
		RemoteURL:    remoteURL,
		Branch:       branch,
		Dirty:        strings.TrimSpace(status) != "",
	}
}

func gitWorktreeRoot(path string) string {
	root := runGitLine(path, "rev-parse", "--show-toplevel")
	if root == "" {
		return ""
	}
	abs, err := filepath.Abs(root)
	if err == nil {
		root = abs
	}
	return root
}

func runGitLine(dir string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0])
}

func repositoryIDFromRemote(remote string) string {
	remote = strings.TrimSpace(remote)
	if remote == "" {
		return ""
	}
	ownerRepo := ""
	if strings.HasPrefix(remote, "git@") {
		if idx := strings.Index(remote, ":"); idx >= 0 && idx+1 < len(remote) {
			ownerRepo = remote[idx+1:]
		}
	} else if parsed, err := url.Parse(remote); err == nil && strings.Contains(parsed.Host, "github.com") {
		ownerRepo = strings.TrimPrefix(parsed.Path, "/")
	}
	ownerRepo = strings.TrimSuffix(strings.TrimSpace(ownerRepo), ".git")
	parts := strings.Split(ownerRepo, "/")
	if len(parts) < 2 {
		return ""
	}
	owner := sanitizeRepositoryIDPart(parts[len(parts)-2])
	repo := sanitizeRepositoryIDPart(parts[len(parts)-1])
	if owner == "" || repo == "" {
		return ""
	}
	return owner + "__" + repo
}

func sanitizeRepositoryIDPart(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	for _, r := range value {
		switch {
		case r >= 'a' && r <= 'z':
			b.WriteRune(r)
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '-' || r == '_' || r == '.':
			b.WriteRune(r)
		}
	}
	return strings.Trim(b.String(), "-_.")
}
