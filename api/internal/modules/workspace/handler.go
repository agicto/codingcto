package workspace

import (
	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/pkg/handler"
	"github.com/zgiai/luas/api/pkg/response"
)

type Handler struct {
	service Service
}

var (
	_ contracts.Module      = (*Handler)(nil)
	_ contracts.RouteModule = (*Handler)(nil)
)

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Name() string {
	return "workspace"
}

func (h *Handler) CreateWorkspace(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req CreateWorkspaceRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	workspace, err := h.service.CreateWorkspace(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create workspace", err)
		return
	}
	response.Created(c, &WorkspaceResponse{Workspace: workspace})
}

func (h *Handler) ListWorkspaces(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req ListWorkspacesRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	workspaces, err := h.service.ListWorkspaces(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to list workspaces", err)
		return
	}
	response.Success(c, &WorkspaceListResponse{Workspaces: workspaces})
}

func (h *Handler) GetWorkspace(c *gin.Context) {
	workspace, err := h.service.GetWorkspace(c.Request.Context(), c.Param("workspace_id"))
	if err != nil {
		response.HandleError(c, "Failed to get workspace", err)
		return
	}
	response.Success(c, &WorkspaceResponse{Workspace: workspace})
}

func (h *Handler) UpdateWorkspace(c *gin.Context) {
	var req UpdateWorkspaceRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	workspace, err := h.service.UpdateWorkspace(c.Request.Context(), c.Param("workspace_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to update workspace", err)
		return
	}
	response.Success(c, &WorkspaceResponse{Workspace: workspace})
}
