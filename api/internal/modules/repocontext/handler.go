package repocontext

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
	return "repocontext"
}

func (h *Handler) UpsertProfile(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req UpsertRepoProfileRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	profile, err := h.service.UpsertProfile(c.Request.Context(), userID, c.Param("repo_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to save repo profile", err)
		return
	}

	response.Success(c, profile)
}

func (h *Handler) InferProfile(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req InferRepoProfileRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	profile, err := h.service.InferProfile(c.Request.Context(), userID, c.Param("repo_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to infer repo profile", err)
		return
	}

	response.Success(c, profile)
}

func (h *Handler) GetProfile(c *gin.Context) {
	profile, err := h.service.GetProfile(c.Request.Context(), c.Param("repo_id"))
	if err != nil {
		response.HandleError(c, "Failed to get repo profile", err)
		return
	}

	response.Success(c, profile)
}
