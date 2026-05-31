package workspace

import "github.com/zgiai/luas/api/internal/domain"

type CreateWorkspaceRequest struct {
	WorkspaceID string `json:"workspace_id" binding:"omitempty,min=2,max=255"`
	Name        string `json:"name" binding:"required,min=2,max=120"`
	Slug        string `json:"slug" binding:"omitempty,min=2,max=100"`
	Description string `json:"description" binding:"omitempty,max=5000"`
}

type UpdateWorkspaceRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=2,max=120"`
	Description *string `json:"description" binding:"omitempty,max=5000"`
	Status      *string `json:"status" binding:"omitempty,oneof=active archived"`
}

type ListWorkspacesRequest struct {
	Status string `form:"status" binding:"omitempty,oneof=active archived"`
	Limit  int    `form:"limit" binding:"omitempty,min=1,max=100"`
}

type WorkspaceResponse struct {
	Workspace *domain.Workspace `json:"workspace"`
}

type WorkspaceListResponse struct {
	Workspaces []*domain.Workspace `json:"workspaces"`
}
