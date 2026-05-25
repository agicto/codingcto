package execution

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
	return "execution"
}

func (h *Handler) StartRun(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}

	planID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || planID == 0 {
		response.HandleError(c, "Invalid plan id", err)
		return
	}

	var req StartExecutionRunRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}

	run, err := h.service.StartRun(c.Request.Context(), userID, uint(planID), &req)
	if err != nil {
		response.HandleError(c, "Failed to start execution run", err)
		return
	}

	response.Success(c, run)
}

func (h *Handler) GetRun(c *gin.Context) {
	runID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || runID == 0 {
		response.HandleError(c, "Invalid run id", err)
		return
	}

	run, err := h.service.GetRun(c.Request.Context(), uint(runID))
	if err != nil {
		response.HandleError(c, "Failed to get execution run", err)
		return
	}

	response.Success(c, run)
}

func (h *Handler) DispatchRun(c *gin.Context) {
	runID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || runID == 0 {
		response.HandleError(c, "Invalid run id", err)
		return
	}

	var req DispatchExecutionRunRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}

	run, err := h.service.DispatchRun(c.Request.Context(), uint(runID), &req)
	if err != nil {
		response.HandleError(c, "Failed to dispatch execution run", err)
		return
	}

	response.Success(c, run)
}

func (h *Handler) HeartbeatRuntime(c *gin.Context) {
	var req RuntimeHeartbeatRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	heartbeat, err := h.service.HeartbeatRuntime(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to record runtime heartbeat", err)
		return
	}

	response.Success(c, heartbeat)
}

func (h *Handler) ClaimTask(c *gin.Context) {
	runtimeID := c.Param("runtime_id")

	var req ClaimAgentTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}

	claim, err := h.service.ClaimTask(c.Request.Context(), runtimeID, &req)
	if err != nil {
		response.HandleError(c, "Failed to claim agent task", err)
		return
	}

	response.Success(c, claim)
}

func (h *Handler) CompleteTask(c *gin.Context) {
	taskID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || taskID == 0 {
		response.HandleError(c, "Invalid task id", err)
		return
	}

	run, err := h.service.CompleteTask(c.Request.Context(), uint(taskID))
	if err != nil {
		response.HandleError(c, "Failed to complete agent task", err)
		return
	}

	response.Success(c, run)
}

func (h *Handler) PinTaskSession(c *gin.Context) {
	taskID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || taskID == 0 {
		response.HandleError(c, "Invalid task id", err)
		return
	}

	var req PinAgentTaskSessionRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	run, err := h.service.PinTaskSession(c.Request.Context(), uint(taskID), &req)
	if err != nil {
		response.HandleError(c, "Failed to pin agent task session", err)
		return
	}

	response.Success(c, run)
}

func (h *Handler) ExecuteTask(c *gin.Context) {
	taskID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || taskID == 0 {
		response.HandleError(c, "Invalid task id", err)
		return
	}

	var req ExecuteAgentTaskRequest
	if !handler.BindJSON(c, &req) {
		return
	}

	run, err := h.service.ExecuteTask(c.Request.Context(), uint(taskID), &req)
	if err != nil {
		response.HandleError(c, "Failed to execute agent task", err)
		return
	}

	response.Success(c, run)
}
