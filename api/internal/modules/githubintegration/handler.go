package githubintegration

import (
	"io"
	"net/http"
	"os"
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

func (h *Handler) ListWebhookEvents(c *gin.Context) {
	var req ListWebhookEventsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	events, err := h.service.ListWebhookEvents(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to list GitHub webhook events", err)
		return
	}
	response.Success(c, gin.H{"events": events})
}

func (h *Handler) DeliverPRNode(c *gin.Context) {
	var req DeliverPRNodeRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	node, err := h.service.DeliverPRNode(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to deliver PR node", err)
		return
	}
	response.Success(c, node)
}

func (h *Handler) PreparePRNodeBranch(c *gin.Context) {
	var req PreparePRNodeBranchRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	node, err := h.service.PreparePRNodeBranch(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to prepare PR node branch", err)
		return
	}
	response.Success(c, node)
}

func (h *Handler) RefreshPRNodeCI(c *gin.Context) {
	var req RefreshPRNodeCIRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	node, err := h.service.RefreshPRNodeCI(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to refresh PR node CI", err)
		return
	}
	response.Success(c, node)
}

func (h *Handler) ReadPRNodeFailureLog(c *gin.Context) {
	var req ReadPRNodeFailureLogRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	failure, err := h.service.ReadPRNodeFailureLog(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to read PR node failure log", err)
		return
	}
	response.Success(c, failure)
}

func (h *Handler) ReceiveWebhook(c *gin.Context) {
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		response.HandleError(c, "Failed to read GitHub webhook", err)
		return
	}

	signature := c.GetHeader("X-Hub-Signature-256")
	if !verifyGitHubSignature(os.Getenv("GITHUB_WEBHOOK_SECRET"), body, signature) {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "invalid github webhook signature",
			"code":  "GITHUB_WEBHOOK_SIGNATURE_INVALID",
		})
		return
	}

	event, err := h.service.RecordWebhook(c.Request.Context(), &GitHubWebhookRequest{
		EventType:  c.GetHeader("X-GitHub-Event"),
		DeliveryID: c.GetHeader("X-GitHub-Delivery"),
		Signature:  signature,
		Body:       body,
	})
	if err != nil {
		response.HandleError(c, "Failed to record GitHub webhook", err)
		return
	}
	response.Success(c, event)
}
