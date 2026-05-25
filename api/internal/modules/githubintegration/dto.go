package githubintegration

type UpsertInstallationRequest struct {
	WorkspaceID    string            `json:"workspace_id" binding:"required,max=255"`
	InstallationID int64             `json:"installation_id" binding:"required"`
	AccountLogin   string            `json:"account_login" binding:"required,max=255"`
	Permissions    map[string]string `json:"permissions"`
}

type UpsertRepositoryRequest struct {
	RepositoryID         string `json:"repository_id" binding:"omitempty,max=255"`
	WorkspaceID          string `json:"workspace_id" binding:"required,max=255"`
	GitHubInstallationID uint   `json:"github_installation_id" binding:"required"`
	GitHubOwner          string `json:"github_owner" binding:"required,max=255"`
	GitHubRepo           string `json:"github_repo" binding:"required,max=255"`
	DefaultBranch        string `json:"default_branch" binding:"omitempty,max=100"`
	IsPrivate            bool   `json:"is_private"`
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

type DeliverPRNodeRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	PRNodeID     uint   `json:"pr_node_id" binding:"required"`
	Title        string `json:"title" binding:"omitempty,max=255"`
	Body         string `json:"body" binding:"omitempty"`
	BaseBranch   string `json:"base_branch" binding:"omitempty,max=100"`
	Draft        *bool  `json:"draft" binding:"omitempty"`
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
