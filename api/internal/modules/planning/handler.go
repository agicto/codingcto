package planning

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
	return "planning"
}

func (h *Handler) CreateIdea(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	var req CreateIdeaRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.CreateIdea(c.Request.Context(), userID, c.Param("repo_id"), &req)
	if err != nil {
		response.HandleError(c, "Failed to create idea", err)
		return
	}

	response.Created(c, toPlanReviewResponse(bundle))
}

func (h *Handler) GetPlan(c *gin.Context) {
	ideaID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	bundle, err := h.service.GetPlanForIdea(c.Request.Context(), ideaID)
	if err != nil {
		response.HandleError(c, "Failed to get plan", err)
		return
	}

	response.Success(c, toPlanReviewResponse(bundle))
}

func (h *Handler) ApprovePlan(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	planID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req ApprovePlanRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	bundle, err := h.service.ApprovePlan(c.Request.Context(), userID, planID, &req)
	if err != nil {
		response.HandleError(c, "Failed to approve plan", err)
		return
	}

	response.Success(c, toPlanReviewResponse(bundle))
}

func (h *Handler) CompilePrompt(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	prNodeID, ok := handler.ParseID(c, "id")
	if !ok {
		return
	}

	var req CompilePromptRequest
	if c.Request.ContentLength > 0 && !handler.BindJSON(c, &req) {
		return
	}

	prompt, err := h.service.CompilePrompt(c.Request.Context(), userID, prNodeID, &req)
	if err != nil {
		response.HandleError(c, "Failed to compile prompt", err)
		return
	}

	response.Created(c, &CompiledPromptResponse{Prompt: prompt})
}
