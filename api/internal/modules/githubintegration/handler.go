package githubintegration

import (
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"

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

func (h *Handler) StartOAuth(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req OAuthStartRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	result, err := h.service.StartOAuth(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to start GitHub OAuth", err)
		return
	}
	response.Success(c, result)
}

func (h *Handler) HandleOAuthCallback(c *gin.Context) {
	var req OAuthCallbackRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	connection, redirectTo, err := h.service.HandleOAuthCallback(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to connect GitHub account", err)
		return
	}
	if strings.TrimSpace(redirectTo) != "" {
		c.Redirect(http.StatusFound, appendOAuthResult(redirectTo, "connected"))
		return
	}
	response.Success(c, &GitHubConnectionResponse{Connection: connection})
}

func (h *Handler) GetConnection(c *gin.Context) {
	var req GetConnectionRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	connection, err := h.service.GetConnection(c.Request.Context(), req.WorkspaceID)
	if err != nil {
		response.HandleError(c, "Failed to get GitHub connection", err)
		return
	}
	response.Success(c, &GitHubConnectionResponse{Connection: connection})
}

func (h *Handler) DisconnectConnection(c *gin.Context) {
	var req DisconnectConnectionRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	if err := h.service.DisconnectConnection(c.Request.Context(), req.WorkspaceID); err != nil {
		response.HandleError(c, "Failed to disconnect GitHub account", err)
		return
	}
	response.Success(c, gin.H{"disconnected": true})
}

func (h *Handler) SyncRepositories(c *gin.Context) {
	var req SyncRepositoriesRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	result, err := h.service.SyncRepositories(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to sync GitHub repositories", err)
		return
	}
	response.Success(c, result)
}

func (h *Handler) ListRepositoryAccesses(c *gin.Context) {
	var req ListRepositoryAccessesRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	result, err := h.service.ListRepositoryAccesses(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to list GitHub repository access", err)
		return
	}
	response.Success(c, result)
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

func (h *Handler) SyncInstallation(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req SyncInstallationRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	result, err := h.service.SyncInstallation(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to sync GitHub installation", err)
		return
	}
	response.Success(c, result)
}

func (h *Handler) SyncInstallationByID(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	installationID, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || installationID == 0 {
		response.HandleError(c, "Invalid installation id", err)
		return
	}
	var req SyncInstallationByIDRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	result, err := h.service.SyncInstallationByID(c.Request.Context(), userID, installationID, &req)
	if err != nil {
		response.HandleError(c, "Failed to sync GitHub installation", err)
		return
	}
	response.Success(c, result)
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

func (h *Handler) GetInstallationStatus(c *gin.Context) {
	var req GetInstallationStatusRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	status, err := h.service.GetInstallationStatus(c.Request.Context(), req.WorkspaceID)
	if err != nil {
		response.HandleError(c, "Failed to get GitHub installation status", err)
		return
	}
	response.Success(c, status)
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

func (h *Handler) ListRepositories(c *gin.Context) {
	var req ListRepositoriesRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	repositories, err := h.service.ListRepositories(c.Request.Context(), req.WorkspaceID)
	if err != nil {
		response.HandleError(c, "Failed to list repositories", err)
		return
	}
	response.Success(c, &ListRepositoriesResponse{Repositories: repositories})
}

func (h *Handler) CheckRepositoryReadiness(c *gin.Context) {
	readiness, err := h.service.CheckRepositoryReadiness(c.Request.Context(), c.Param("repo_id"))
	if err != nil {
		response.HandleError(c, "Failed to check repository readiness", err)
		return
	}
	response.Success(c, readiness)
}

func (h *Handler) GetSettings(c *gin.Context) {
	var req GetSettingsRequest
	if err := c.ShouldBindQuery(&req); err != nil {
		response.BadRequest(c, "Invalid request parameters", err)
		return
	}
	settings, err := h.service.GetSettings(c.Request.Context(), req.WorkspaceID)
	if err != nil {
		response.HandleError(c, "Failed to get GitHub settings", err)
		return
	}
	response.Success(c, settings)
}

func (h *Handler) UpsertSettings(c *gin.Context) {
	userID, ok := handler.GetUserID(c)
	if !ok {
		return
	}
	var req UpsertSettingsRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	settings, err := h.service.UpsertSettings(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to save GitHub settings", err)
		return
	}
	response.Success(c, settings)
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

func (h *Handler) CreateIssue(c *gin.Context) {
	var req CreateIssueRequest
	if !handler.BindJSON(c, &req) {
		return
	}
	issue, err := h.service.CreateIssue(c.Request.Context(), &req)
	if err != nil {
		response.HandleError(c, "Failed to create GitHub issue", err)
		return
	}
	response.Success(c, issue)
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

func appendOAuthResult(rawURL, status string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return rawURL
	}
	separator := "?"
	if strings.Contains(rawURL, "?") {
		separator = "&"
	}
	return rawURL + separator + "github=" + status
}
