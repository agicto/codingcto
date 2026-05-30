package domain

import (
	"context"
	"time"
)

const (
	ProjectStatusActive   = "active"
	ProjectStatusArchived = "archived"

	ProjectRepositoryRolePrimary    = "primary"
	ProjectRepositoryRoleDependency = "dependency"
	ProjectRepositoryRoleDocs       = "docs"
	ProjectRepositoryRoleInfra      = "infra"
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
	Project      *SpecForgeProject             `json:"project"`
	Repositories []*SpecForgeProjectRepository `json:"repositories"`
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
