package githubintegration

import (
	"strconv"

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
	return "githubintegration"
}

func (h *Handler) UpsertInstallation(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req UpsertInstallationRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	installation, err := h.service.UpsertInstallation(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to save GitHub installation", err)
		return
	}
	response.Success(c, installation)
}

func (h *Handler) GetInstallation(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		response.HandleError(c, "Invalid installation id", err)
		return
	}
	installation, err := h.service.GetInstallation(c.Request.Context(), uint(id))
	if err != nil {
		response.HandleError(c, "Failed to get GitHub installation", err)
		return
	}
	response.Success(c, installation)
}

func (h *Handler) UpsertRepository(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req UpsertRepositoryRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	repository, err := h.service.UpsertRepository(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to save repository", err)
		return
	}
	response.Success(c, repository)
}

func (h *Handler) GetRepository(c *gin.Context) {
	repository, err := h.service.GetRepository(c.Request.Context(), c.Param("repo_id"))
	if err != nil {
		response.HandleError(c, "Failed to get repository", err)
		return
	}
	response.Success(c, repository)
}
