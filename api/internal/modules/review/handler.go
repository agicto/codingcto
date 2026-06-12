package review

import (
	"errors"
	"io"
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
	return "review"
}

func (h *Handler) GetReviewDecision(c *gin.Context) {
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	decision, err := h.service.GetReviewDecision(c.Request.Context(), uint(prNodeID))
	if err != nil {
		response.HandleError(c, "Failed to load review decision", err)
		return
	}
	response.Success(c, decision)
}

func (h *Handler) ApproveReviewDecision(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	var req ApproveReviewDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	decision, err := h.service.ApproveReviewDecision(c.Request.Context(), userID, uint(prNodeID), &req)
	if err != nil {
		response.HandleError(c, "Failed to approve review decision", err)
		return
	}
	response.Success(c, decision)
}

func (h *Handler) RejectReviewDecision(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	var req RejectReviewDecisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	decision, err := h.service.RejectReviewDecision(c.Request.Context(), userID, uint(prNodeID), &req)
	if err != nil {
		response.HandleError(c, "Failed to reject review decision", err)
		return
	}
	response.Success(c, decision)
}
