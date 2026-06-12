package project

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
	return "project"
}

func (h *Handler) CreateProject(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req CreateProjectRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	project, err := h.service.CreateProject(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create project", err)
		return
	}
	response.Created(c, &ProjectResponse{Project: project})
}

func (h *Handler) ListProjects(c *gin.Context) {
	projects, err := h.service.ListProjects(c.Request.Context(), c.Query("workspace_id"))
	if err != nil {
		response.HandleError(c, "Failed to list projects", err)
		return
	}
	response.Success(c, &ProjectListResponse{Projects: projects})
}

func (h *Handler) GetProject(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	project, err := h.service.GetProject(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to get project", err)
		return
	}
	response.Success(c, &ProjectResponse{Project: project})
}

func (h *Handler) UpdateProject(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req UpdateProjectRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	project, err := h.service.UpdateProject(c.Request.Context(), projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to update project", err)
		return
	}
	response.Success(c, &ProjectResponse{Project: project})
}

func (h *Handler) DeleteProject(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	if err := h.service.DeleteProject(c.Request.Context(), projectID); err != nil {
		response.HandleError(c, "Failed to delete project", err)
		return
	}
	response.NoContent(c)
}

func (h *Handler) BindRepository(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req BindRepositoryRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	binding, err := h.service.BindRepository(c.Request.Context(), userID, projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to bind repository", err)
		return
	}
	response.Created(c, &ProjectRepositoryResponse{Repository: binding})
}

func (h *Handler) ListRepositories(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	repositories, err := h.service.ListRepositories(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to list project repositories", err)
		return
	}
	response.Success(c, &ProjectRepositoryListResponse{Repositories: repositories})
}

func (h *Handler) UnbindRepository(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	if err := h.service.UnbindRepository(c.Request.Context(), projectID, c.Param("repository_id")); err != nil {
		response.HandleError(c, "Failed to unbind repository", err)
		return
	}
	response.Success(c, gin.H{"deleted": true})
}

func (h *Handler) GetProjectContext(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	context, err := h.service.GetProjectContext(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to get project context", err)
		return
	}
	response.Success(c, &ProjectContextResponse{Context: context})
}

func (h *Handler) GetProjectReadiness(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	readiness, err := h.service.GetProjectReadiness(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to get project readiness", err)
		return
	}
	response.Success(c, &ProjectReadinessResponse{Readiness: readiness})
}
