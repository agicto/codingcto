package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	ProjectStatusActive   = "active"
	ProjectStatusArchived = "archived"

	ProjectRepositoryRolePrimary    = "primary"
	ProjectRepositoryRoleDependency = "dependency"
	ProjectRepositoryRoleDocs       = "docs"
	ProjectRepositoryRoleInfra      = "infra"

	MaxSpecForgeProjectRepositories = 3
)

// SpecForgeProject groups repositories, requirements, plans, and execution runs.
type SpecForgeProject struct {
	ID          uint      `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SpecForgeProjectRepository binds an existing GitHub repository to a project.
type SpecForgeProjectRepository struct {
	ID           uint      `json:"id"`
	WorkspaceID  string    `json:"workspace_id"`
	ProjectID    uint      `json:"project_id"`
	RepositoryID string    `json:"repository_id"`
	Role         string    `json:"role"`
	Active       bool      `json:"active"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeProjectContext is the project-scoped context shown before planning.
type SpecForgeProjectContext struct {
	Project               *SpecForgeProject                    `json:"project"`
	Repositories          []*SpecForgeProjectRepository        `json:"repositories"`
	RepositoryContexts    []*SpecForgeProjectRepositoryContext `json:"repository_contexts"`
	PrimaryRepositoryID   string                               `json:"primary_repository_id,omitempty"`
	ExecutionRepositoryID string                               `json:"execution_repository_id,omitempty"`
	ReadOnlyRepositoryIDs []string                             `json:"read_only_repository_ids,omitempty"`
	ExecutionGuardrails   []string                             `json:"execution_guardrails,omitempty"`
}

// SpecForgeProjectRepositoryContext enriches a project repository binding with planner-ready repo intelligence.
type SpecForgeProjectRepositoryContext struct {
	Repository *SpecForgeProjectRepository `json:"repository"`
	Profile    *SpecForgeRepoProfile       `json:"profile,omitempty"`
	Skills     []*SpecForgeSkill           `json:"skills"`
	Warnings   []string                    `json:"warnings,omitempty"`
}

func ApplySpecForgeProjectContextGuardrails(context *SpecForgeProjectContext) {
	if context == nil {
		return
	}
	context.PrimaryRepositoryID = ""
	context.ExecutionRepositoryID = ""
	context.ReadOnlyRepositoryIDs = nil
	context.ExecutionGuardrails = nil

	activeCount := 0
	readOnly := []string{}
	for _, repository := range context.Repositories {
		if repository == nil || !repository.Active {
			continue
		}
		activeCount++
		repositoryID := strings.TrimSpace(repository.RepositoryID)
		if repository.Role == ProjectRepositoryRolePrimary && context.PrimaryRepositoryID == "" {
			context.PrimaryRepositoryID = repositoryID
			context.ExecutionRepositoryID = repositoryID
			continue
		}
		if repositoryID != "" {
			readOnly = append(readOnly, repositoryID)
		}
	}
	context.ReadOnlyRepositoryIDs = readOnly
	if context.PrimaryRepositoryID == "" {
		context.ExecutionGuardrails = append(context.ExecutionGuardrails, "Project must bind one active primary repository before planning or execution.")
		return
	}
	context.ExecutionGuardrails = append(context.ExecutionGuardrails,
		"MVP execution is primary-repository only.",
		"Planner may read dependency, docs, and infra repositories as context.",
		"Executor must modify only "+context.PrimaryRepositoryID+"; other bound repositories are read-only context.",
		fmt.Sprintf("Project currently has %d active repositories bound; maximum supported is %d.", activeCount, MaxSpecForgeProjectRepositories),
	)
}

// SpecForgeProjectRepositoryStore persists SpecForge project state.
type SpecForgeProjectRepositoryStore interface {
	CreateProject(ctx context.Context, project *SpecForgeProject) error
	UpdateProject(ctx context.Context, project *SpecForgeProject) error
	FindProjectByID(ctx context.Context, id uint) (*SpecForgeProject, error)
	FindProjectByWorkspaceAndSlug(ctx context.Context, workspaceID, slug string) (*SpecForgeProject, error)
	ListProjectsByWorkspace(ctx context.Context, workspaceID string) ([]*SpecForgeProject, error)
	CreateProjectRepository(ctx context.Context, binding *SpecForgeProjectRepository) error
	DeleteProjectRepository(ctx context.Context, projectID uint, repositoryID string) error
	FindProjectRepository(ctx context.Context, projectID uint, repositoryID string) (*SpecForgeProjectRepository, error)
	ListProjectRepositories(ctx context.Context, projectID uint) ([]*SpecForgeProjectRepository, error)
	CountActiveProjectRepositories(ctx context.Context, projectID uint) (int64, error)
	FindActivePrimaryProjectRepository(ctx context.Context, projectID uint) (*SpecForgeProjectRepository, error)
}
