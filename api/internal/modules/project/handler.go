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

func (h *Handler) ListRepositoryOptions(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	repositories, err := h.service.ListRepositoryOptions(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to list project repository options", err)
		return
	}
	response.Success(c, &ProjectRepositoryOptionsResponse{Repositories: repositories})
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

func (h *Handler) RefreshProjectContext(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	snapshot, err := h.service.RefreshProjectContext(c.Request.Context(), userID, projectID)
	if err != nil {
		response.HandleError(c, "Failed to refresh project context", err)
		return
	}
	response.Success(c, &ProjectContextSnapshotResponse{Snapshot: snapshot})
}

func (h *Handler) ListProjectDeepWiki(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	repositories, err := h.service.ListProjectDeepWiki(c.Request.Context(), userID, projectID)
	if err != nil {
		response.HandleError(c, "Failed to list project DeepWiki", err)
		return
	}
	response.Success(c, &ProjectDeepWikiResponse{Repositories: repositories})
}

func (h *Handler) ReindexProjectRepositoryDeepWiki(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	repository, err := h.service.ReindexProjectRepositoryDeepWiki(c.Request.Context(), userID, projectID, c.Param("repository_id"))
	if err != nil {
		response.HandleError(c, "Failed to reindex project repository DeepWiki", err)
		return
	}
	response.Success(c, &ProjectRepositoryDeepWikiResultResponse{Repository: repository})
}

func (h *Handler) DeleteProjectRepositoryDeepWiki(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	if err := h.service.DeleteProjectRepositoryDeepWiki(c.Request.Context(), userID, projectID, c.Param("repository_id")); err != nil {
		response.HandleError(c, "Failed to delete project repository DeepWiki", err)
		return
	}
	response.NoContent(c)
}

func (h *Handler) GetProjectExpertPolicy(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	policy, err := h.service.GetProjectExpertPolicy(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to get project expert policy", err)
		return
	}
	response.Success(c, &ProjectExpertPolicyResponse{Policy: policy})
}

func (h *Handler) CreateProjectExpertPolicy(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req UpsertProjectExpertPolicyRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	policy, err := h.service.CreateProjectExpertPolicy(c.Request.Context(), userID, projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create project expert policy", err)
		return
	}
	response.Created(c, &ProjectExpertPolicyResponse{Policy: policy})
}

func (h *Handler) UpdateProjectExpertPolicy(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	policyID, ok := handler.ParseID(c, "policy_id")
	if !ok {
		return
	}

	var req UpsertProjectExpertPolicyRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	policy, err := h.service.UpdateProjectExpertPolicy(c.Request.Context(), userID, projectID, policyID, &req)
	if err != nil {
		response.HandleError(c, "Failed to update project expert policy", err)
		return
	}
	response.Success(c, &ProjectExpertPolicyResponse{Policy: policy})
}

func (h *Handler) ListProjectRuntimeBindings(c *gin.Context) {
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	bindings, err := h.service.ListProjectRuntimeBindings(c.Request.Context(), projectID)
	if err != nil {
		response.HandleError(c, "Failed to list project runtime bindings", err)
		return
	}
	response.Success(c, &ProjectRuntimeBindingListResponse{Bindings: bindings})
}

func (h *Handler) CreateProjectRuntimeBinding(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req UpsertProjectRuntimeBindingRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	binding, err := h.service.CreateProjectRuntimeBinding(c.Request.Context(), userID, projectID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create project runtime binding", err)
		return
	}
	response.Created(c, &ProjectRuntimeBindingResponse{Binding: binding})
}

func (h *Handler) UpdateProjectRuntimeBinding(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	projectID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}
	bindingID, ok := handler.ParseID(c, "binding_id")
	if !ok {
		return
	}

	var req UpsertProjectRuntimeBindingRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	binding, err := h.service.UpdateProjectRuntimeBinding(c.Request.Context(), userID, projectID, bindingID, &req)
	if err != nil {
		response.HandleError(c, "Failed to update project runtime binding", err)
		return
	}
	response.Success(c, &ProjectRuntimeBindingResponse{Binding: binding})
}
