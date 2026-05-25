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
