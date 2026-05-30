package verification

import (
	"context"
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/pkg/handler"
	"github.com/zgiai/luas/api/pkg/response"
)

type Handler struct {
	service Service
}

var (
	_ contracts.Module      = (*Handler)(nil)
	_ contracts.RouteModule = (*Handler)(nil)
	_ contracts.EventModule = (*Handler)(nil)
)

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Name() string {
	return "verification"
}

func (h *Handler) RegisterEvents(bus *events.EventBus) {
	if bus == nil {
		return
	}
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, h.handlePRNodeCIFailed)
	bus.Subscribe(domain.EventSpecForgeFixTaskFinished, h.handleFixTaskFinished)
}

func (h *Handler) handlePRNodeCIFailed(ctx context.Context, e events.Event) error {
	var underlying any = e
	if wrapped, ok := e.(events.WrappedEvent); ok {
		underlying = wrapped.Event
	}
	event, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
	if !ok {
		return nil
	}
	_, err := h.service.CreateFixAttemptFromCI(ctx, 0, event.PRNodeID, &CreateFixAttemptFromCIRequest{
		RepositoryID: event.RepositoryID,
	})
	if errors.Is(err, domain.ErrNotFound) || errors.Is(err, domain.ErrConflict) {
		return nil
	}
	return err
}

func (h *Handler) handleFixTaskFinished(ctx context.Context, e events.Event) error {
	var underlying any = e
	if wrapped, ok := e.(events.WrappedEvent); ok {
		underlying = wrapped.Event
	}
	event, ok := underlying.(domain.SpecForgeFixTaskFinishedEvent)
	if !ok || event.FixAttemptID == 0 || event.FixAttemptStatus == "" {
		return nil
	}
	err := h.service.UpdateFixAttemptStatus(ctx, event.FixAttemptID, event.FixAttemptStatus)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	return err
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

func (h *Handler) CreateFixAttemptFromCI(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	var req CreateFixAttemptFromCIRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	attempt, err := h.service.CreateFixAttemptFromCI(c.Request.Context(), userID, uint(prNodeID), &req)
	if err != nil {
		response.HandleError(c, "Failed to create fix attempt from CI", err)
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

func (h *Handler) GetEscalationSummary(c *gin.Context) {
	prNodeID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || prNodeID == 0 {
		response.HandleError(c, "Invalid PR node id", err)
		return
	}
	summary, err := h.service.GetEscalationSummary(c.Request.Context(), uint(prNodeID))
	if err != nil {
		response.HandleError(c, "Failed to build escalation summary", err)
		return
	}
	response.Success(c, summary)
}
