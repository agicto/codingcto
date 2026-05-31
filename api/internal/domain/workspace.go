package domain

import (
	"context"
	"strings"
	"time"
)

const (
	WorkspaceStatusActive   = "active"
	WorkspaceStatusArchived = "archived"
)

// Workspace is the first-class tenant boundary for CodingCTO projects and GitHub bindings.
type Workspace struct {
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

// WorkspaceRepository persists workspace lifecycle state.
type WorkspaceRepository interface {
	CreateWorkspace(ctx context.Context, workspace *Workspace) error
	UpdateWorkspace(ctx context.Context, workspace *Workspace) error
	FindWorkspaceByWorkspaceID(ctx context.Context, workspaceID string) (*Workspace, error)
	FindWorkspaceBySlug(ctx context.Context, slug string) (*Workspace, error)
	ListWorkspaces(ctx context.Context, createdBy uint, status string, limit int) ([]*Workspace, error)
}

func NormalizeWorkspaceID(value string) string {
	value = strings.TrimSpace(value)
	value = strings.ReplaceAll(value, "-", "_")
	return value
}
