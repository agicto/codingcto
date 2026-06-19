package project

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

const runtimeBindingFreshness = 5 * time.Minute

func buildProjectRuntimeBinding(project *domain.SpecForgeProject, userID uint, runtime *domain.SpecForgeRuntime, repositoryID string, req *UpsertProjectRuntimeBindingRequest) (*domain.SpecForgeProjectRuntimeBinding, error) {
	if project == nil || runtime == nil || req == nil {
		return nil, domain.ErrInvalidInput
	}
	repositoryID = strings.TrimSpace(repositoryID)
	runtimeID := strings.TrimSpace(runtime.RuntimeID)
	executor := strings.TrimSpace(req.Executor)
	repoDir := filepath.Clean(strings.TrimSpace(req.RepoDir))

	if repositoryID == "" || runtimeID == "" || repoDir == "" || !filepath.IsAbs(repoDir) {
		return nil, domain.ErrInvalidInput
	}
	if executor == "" {
		executor = strings.TrimSpace(runtime.Executor)
	}
	if executor == "" || executor != strings.TrimSpace(runtime.Executor) {
		return nil, domain.ErrInvalidInput
	}

	return &domain.SpecForgeProjectRuntimeBinding{
		WorkspaceID:  strings.TrimSpace(project.WorkspaceID),
		ProjectID:    project.ID,
		RepositoryID: repositoryID,
		RuntimeID:    runtimeID,
		Executor:     executor,
		RepoDir:      repoDir,
		Active:       true,
		CreatedBy:    userID,
	}, nil
}

func buildProjectRuntimeBindingStatus(now time.Time, primaryRepositoryID string, binding *domain.SpecForgeProjectRuntimeBinding, runtime *domain.SpecForgeRuntime) *domain.SpecForgeProjectRuntimeBindingStatus {
	if binding == nil {
		return nil
	}
	primaryRepositoryID = strings.TrimSpace(primaryRepositoryID)
	status := &domain.SpecForgeProjectRuntimeBindingStatus{
		Binding:  binding,
		Runtime:  runtime,
		Eligible: true,
	}
	if !binding.Active {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Runtime binding is inactive.")
	}
	if primaryRepositoryID == "" {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Project does not have a primary repository yet.")
	} else if strings.TrimSpace(binding.RepositoryID) != primaryRepositoryID {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(
			status.Warnings,
			fmt.Sprintf("Binding targets %s, but the primary repository is %s.", binding.RepositoryID, primaryRepositoryID),
		)
	}
	if strings.TrimSpace(binding.RepoDir) == "" || !filepath.IsAbs(strings.TrimSpace(binding.RepoDir)) {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Runtime binding repo directory must be an absolute path.")
	}
	if runtime == nil {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Bound runtime has not heartbeated yet.")
		return status
	}
	if strings.TrimSpace(runtime.Executor) != strings.TrimSpace(binding.Executor) {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(
			status.Warnings,
			fmt.Sprintf("Binding expects executor %s, but runtime reports %s.", binding.Executor, runtime.Executor),
		)
	}
	if runtime.Status != domain.RuntimeStatusOnline {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Bound runtime is not online.")
	}
	if runtime.Sandbox != nil && !runtime.Sandbox.Writable {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Bound runtime sandbox is not writable.")
	}
	if runtime.LastSeenAt.IsZero() || now.UTC().Sub(runtime.LastSeenAt.UTC()) > runtimeBindingFreshness {
		status.Eligible = false
		status.Warnings = appendCompactProjectStrings(status.Warnings, "Bound runtime heartbeat is stale.")
	}
	return status
}

func runtimeMatchesDiscoveredRepository(now time.Time, primaryRepositoryID string, runtime *domain.SpecForgeRuntime) bool {
	primaryRepositoryID = strings.TrimSpace(primaryRepositoryID)
	if primaryRepositoryID == "" || runtime == nil {
		return false
	}
	if runtime.Status != domain.RuntimeStatusOnline {
		return false
	}
	if runtime.LastSeenAt.IsZero() || now.UTC().Sub(runtime.LastSeenAt.UTC()) > runtimeBindingFreshness {
		return false
	}
	if runtime.Sandbox != nil && !runtime.Sandbox.Writable {
		return false
	}
	if requiredCommand := runtimeRequiredCLICommand(runtime.Executor); requiredCommand != "" && !runtimeHasAvailableCommand(runtime, requiredCommand) {
		return false
	}
	for _, repository := range runtime.Repositories {
		if runtimeRepositoryIDMatches(primaryRepositoryID, repository.RepositoryID) && strings.TrimSpace(repository.RepoDir) != "" {
			return true
		}
	}
	return false
}

func runtimeRepositoryIDMatches(projectRepositoryID, runtimeRepositoryID string) bool {
	projectRepositoryID = normalizeRuntimeRepositoryID(projectRepositoryID)
	runtimeRepositoryID = normalizeRuntimeRepositoryID(runtimeRepositoryID)
	return projectRepositoryID != "" && projectRepositoryID == runtimeRepositoryID
}

func normalizeRuntimeRepositoryID(repositoryID string) string {
	repositoryID = strings.ToLower(strings.TrimSpace(repositoryID))
	repositoryID = strings.TrimPrefix(repositoryID, "github_")
	return repositoryID
}

func runtimeRequiredCLICommand(executor string) string {
	switch strings.TrimSpace(executor) {
	case "codex_cli":
		return "codex"
	case "kimi_cli":
		return "kimi"
	case "claude_code_cli":
		return "claude"
	default:
		return ""
	}
}

func runtimeHasAvailableCommand(runtime *domain.SpecForgeRuntime, command string) bool {
	command = strings.TrimSpace(command)
	if runtime == nil || command == "" {
		return false
	}
	for _, cli := range runtime.AvailableCLIs {
		if cli.Available && strings.TrimSpace(cli.Command) == command {
			return true
		}
	}
	return false
}
