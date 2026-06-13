package githubintegration

import "github.com/zgiai/luas/api/internal/domain"

type OAuthStartRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"required,max=255"`
	RedirectTo  string `form:"redirect_to" binding:"omitempty,max=1000"`
}

type OAuthStartResponse struct {
	AuthorizationURL string `json:"authorization_url"`
	State            string `json:"state"`
}

type OAuthCallbackRequest struct {
	Code  string `form:"code" binding:"required"`
	State string `form:"state" binding:"required"`
}

type GetConnectionRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"required,max=255"`
}

type DisconnectConnectionRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"required,max=255"`
}

type GitHubConnectionResponse struct {
	Connection *GitHubConnectionSummary `json:"connection"`
}

type GitHubConnectionSummary struct {
	ID              uint    `json:"id"`
	WorkspaceID     string  `json:"workspace_id"`
	GitHubUserID    int64   `json:"github_user_id"`
	GitHubLogin     string  `json:"github_login"`
	GitHubName      string  `json:"github_name"`
	GitHubAvatarURL string  `json:"github_avatar_url"`
	ScopeString     string  `json:"scope_string"`
	TokenStatus     string  `json:"token_status"`
	LastVerifiedAt  *string `json:"last_verified_at,omitempty"`
	LastSyncedAt    *string `json:"last_synced_at,omitempty"`
}

type SyncRepositoriesRequest struct {
	WorkspaceID string `json:"workspace_id" binding:"required,max=255"`
}

type SyncRepositoriesResponse struct {
	Connection        *GitHubConnectionSummary `json:"connection"`
	RepositoryCount   int                      `json:"repository_count"`
	PersonalCount     int                      `json:"personal_count"`
	OrganizationCount int                      `json:"organization_count"`
	SyncedAt          string                   `json:"synced_at"`
	Repositories      []GitHubRepositoryOption `json:"repositories"`
}

type ListRepositoryAccessesRequest struct {
	WorkspaceID       string `form:"workspace_id" binding:"required,max=255"`
	SourceType        string `form:"source_type" binding:"omitempty,oneof=personal organization"`
	OrganizationLogin string `form:"organization_login" binding:"omitempty,max=255"`
	Query             string `form:"query" binding:"omitempty,max=255"`
}

type ListRepositoryAccessesResponse struct {
	Repositories      []*domain.GitHubRepositoryAccess `json:"repositories"`
	RepositoryCount   int                              `json:"repository_count"`
	PersonalCount     int                              `json:"personal_count"`
	OrganizationCount int                              `json:"organization_count"`
}

type UpsertInstallationRequest struct {
	WorkspaceID    string            `json:"workspace_id" binding:"required,max=255"`
	InstallationID int64             `json:"installation_id" binding:"required"`
	AccountLogin   string            `json:"account_login" binding:"required,max=255"`
	Permissions    map[string]string `json:"permissions"`
}

type UpsertRepositoryRequest struct {
	RepositoryID         string `json:"repository_id" binding:"omitempty,max=255"`
	WorkspaceID          string `json:"workspace_id" binding:"required,max=255"`
	GitHubInstallationID uint   `json:"github_installation_id" binding:"omitempty"`
	GitHubOwner          string `json:"github_owner" binding:"required,max=255"`
	GitHubRepo           string `json:"github_repo" binding:"required,max=255"`
	DefaultBranch        string `json:"default_branch" binding:"omitempty,max=100"`
	IsPrivate            bool   `json:"is_private"`
}

type ListRepositoriesRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"omitempty,max=255"`
}

type ListRepositoriesResponse struct {
	Repositories []*domain.Repository `json:"repositories"`
}

type SyncInstallationRequest struct {
	WorkspaceID    string `json:"workspace_id" binding:"required,max=255"`
	InstallationID int64  `json:"installation_id" binding:"required"`
}

type SyncInstallationByIDRequest struct {
	WorkspaceID string `json:"workspace_id" binding:"required,max=255"`
}

type SyncInstallationResponse struct {
	Installation *domain.GitHubInstallation `json:"installation"`
	Repositories []GitHubRepositoryOption   `json:"repositories"`
}

type GetInstallationStatusRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"required,max=255"`
}

type GitHubInstallationStatusResponse struct {
	WorkspaceID     string                          `json:"workspace_id"`
	RepositoryCount int                             `json:"repository_count"`
	Installations   []*GitHubInstallationStatusItem `json:"installations"`
}

type GitHubInstallationStatusItem struct {
	ID              uint              `json:"id"`
	InstallationID  int64             `json:"installation_id"`
	AccountLogin    string            `json:"account_login"`
	Permissions     map[string]string `json:"permissions"`
	RepositoryCount int               `json:"repository_count"`
	UpdatedAt       string            `json:"updated_at"`
}

type GitHubRepositoryOption struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Owner         string `json:"owner"`
	Repo          string `json:"repo"`
	DefaultBranch string `json:"default_branch"`
	IsPrivate     bool   `json:"is_private"`
	HTMLURL       string `json:"html_url"`
}

type UpsertSettingsRequest struct {
	WorkspaceID         string `json:"workspace_id" binding:"required,max=255"`
	Enabled             *bool  `json:"enabled"`
	PullRequestSidebar  *bool  `json:"pull_request_sidebar"`
	CoAuthoredByTrailer *bool  `json:"co_authored_by_trailer"`
	IssuePRAutoLink     *bool  `json:"issue_pr_auto_link"`
}

type GetSettingsRequest struct {
	WorkspaceID string `form:"workspace_id" binding:"required,max=255"`
}

type GitHubWebhookRequest struct {
	EventType  string
	DeliveryID string
	Signature  string
	Body       []byte
}

type ListWebhookEventsRequest struct {
	Status             string `form:"status" binding:"omitempty,max=50"`
	RepositoryFullName string `form:"repository_full_name" binding:"omitempty,max=511"`
	Limit              int    `form:"limit" binding:"omitempty,min=1,max=100"`
}

type CreateIssueRequest struct {
	RepositoryID string   `json:"repository_id" binding:"required,max=255"`
	Title        string   `json:"title" binding:"required,max=255"`
	Body         string   `json:"body" binding:"omitempty"`
	Labels       []string `json:"labels" binding:"omitempty,dive,max=100"`
}

type GitHubIssueResponse struct {
	RepositoryID string `json:"repository_id"`
	Number       int    `json:"number"`
	HTMLURL      string `json:"html_url"`
	State        string `json:"state"`
	Title        string `json:"title"`
}

type GitHubRepositoryReadinessResponse struct {
	RepositoryID string                 `json:"repository_id"`
	WorkspaceID  string                 `json:"workspace_id"`
	GitHubOwner  string                 `json:"github_owner"`
	GitHubRepo   string                 `json:"github_repo"`
	Ready        bool                   `json:"ready"`
	Checks       []GitHubReadinessCheck `json:"checks"`
}

type GitHubReadinessCheck struct {
	Key      string `json:"key"`
	Status   string `json:"status"`
	Message  string `json:"message"`
	Detail   string `json:"detail,omitempty"`
	Required bool   `json:"required"`
}

type ListRepositoryTreeRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	Ref          string `json:"ref" binding:"omitempty,max=100"`
	Recursive    bool   `json:"recursive"`
}

type RepositoryTreeSnapshot struct {
	RepositoryID string   `json:"repository_id"`
	Ref          string   `json:"ref"`
	Truncated    bool     `json:"truncated"`
	Paths        []string `json:"paths"`
}

type ReadRepositoryFileRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	Path         string `json:"path" binding:"required,max=500"`
	Ref          string `json:"ref" binding:"omitempty,max=100"`
}

type RepositoryFileSnapshot struct {
	RepositoryID string `json:"repository_id"`
	Ref          string `json:"ref"`
	Path         string `json:"path"`
	SHA          string `json:"sha"`
	Content      string `json:"content"`
}

type DeliverPRNodeRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	PRNodeID     uint   `json:"pr_node_id" binding:"required"`
	Title        string `json:"title" binding:"omitempty,max=255"`
	Body         string `json:"body" binding:"omitempty"`
	BaseBranch   string `json:"base_branch" binding:"omitempty,max=100"`
	Draft        *bool  `json:"draft" binding:"omitempty"`
}

type MergePRNodeRequest struct {
	RepositoryID    string `json:"repository_id" binding:"required,max=255"`
	PRNodeID        uint   `json:"pr_node_id" binding:"required"`
	ExpectedHeadSHA string `json:"expected_head_sha" binding:"required,max=255"`
	MergeMethod     string `json:"merge_method" binding:"omitempty,oneof=merge squash rebase"`
	CommitTitle     string `json:"commit_title" binding:"omitempty,max=255"`
	CommitMessage   string `json:"commit_message" binding:"omitempty,max=5000"`
}

type MergePRNodeResponse struct {
	PRNode  *domain.SpecForgePRNode `json:"pr_node"`
	Merged  bool                    `json:"merged"`
	Message string                  `json:"message"`
	SHA     string                  `json:"sha,omitempty"`
}

type PreparePRNodeBranchRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	PRNodeID     uint   `json:"pr_node_id" binding:"required"`
	BaseBranch   string `json:"base_branch" binding:"omitempty,max=100"`
}

type RefreshPRNodeCIRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	PRNodeID     uint   `json:"pr_node_id" binding:"required"`
}

type ReadPRNodeFailureLogRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	PRNodeID     uint   `json:"pr_node_id" binding:"required"`
}

type PRNodeFailureLog struct {
	PRNodeID      uint     `json:"pr_node_id"`
	WorkflowRunID int64    `json:"workflow_run_id"`
	JobID         int64    `json:"job_id"`
	JobName       string   `json:"job_name"`
	HeadSHA       string   `json:"head_sha"`
	LogExcerpt    string   `json:"log_excerpt"`
	FailedSteps   []string `json:"failed_steps"`
}
