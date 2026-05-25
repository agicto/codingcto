package verification

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
	return "verification"
}

func (h *Handler) CreateFixAttempt(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	var req CreateFixAttemptRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	attempt, err := h.service.CreateFixAttempt(c.Request.Context(), userID, uint(prNodeID), &req)
	if err != nil {
		response.HandleError(c, "Failed to create fix attempt", err)
		return
	}
	response.Success(c, attempt)
}

func (h *Handler) ListFixAttempts(c *gin.Context) {
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	attempts, err := h.service.ListFixAttempts(c.Request.Context(), uint(prNodeID))
	if err != nil {
		response.HandleError(c, "Failed to list fix attempts", err)
		return
	}
	response.Success(c, attempts)
}
