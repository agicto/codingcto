package domain

import (
	"context"
	"time"
)

const (
	GitHubConnectionStatusConnected         = "connected"
	GitHubConnectionStatusExpired           = "expired"
	GitHubConnectionStatusRevoked           = "revoked"
	GitHubConnectionStatusInsufficientScope = "insufficient_scope"

	GitHubRepositoryAccessSourcePersonal     = "personal"
	GitHubRepositoryAccessSourceOrganization = "organization"

	RepositoryAccessSourceOAuthUser          = "oauth_user"
	RepositoryAccessSourceLegacyInstallation = "legacy_installation"
)

// GitHubInstallation stores GitHub App installation metadata for a workspace.
type GitHubInstallation struct {
	ID             uint              `json:"id"`
	WorkspaceID    string            `json:"workspace_id"`
	InstallationID int64             `json:"installation_id"`
	AccountLogin   string            `json:"account_login"`
	Permissions    map[string]string `json:"permissions"`
	CreatedBy      uint              `json:"created_by"`
	CreatedAt      time.Time         `json:"created_at"`
	UpdatedAt      time.Time         `json:"updated_at"`
}

// GitHubAccountConnection stores the active OAuth account binding for a workspace.
type GitHubAccountConnection struct {
	ID                    uint       `json:"id"`
	WorkspaceID           string     `json:"workspace_id"`
	UserID                uint       `json:"user_id"`
	GitHubUserID          int64      `json:"github_user_id"`
	GitHubLogin           string     `json:"github_login"`
	GitHubName            string     `json:"github_name"`
	GitHubAvatarURL       string     `json:"github_avatar_url"`
	AccessTokenEncrypted  string     `json:"-"`
	RefreshTokenEncrypted string     `json:"-"`
	ScopeString           string     `json:"scope_string"`
	TokenStatus           string     `json:"token_status"`
	LastVerifiedAt        *time.Time `json:"last_verified_at,omitempty"`
	LastSyncedAt          *time.Time `json:"last_synced_at,omitempty"`
	CreatedAt             time.Time  `json:"created_at"`
	UpdatedAt             time.Time  `json:"updated_at"`
}

// GitHubRepositoryAccess stores one repository visible to the connected GitHub account.
type GitHubRepositoryAccess struct {
	ID                uint            `json:"id"`
	WorkspaceID       string          `json:"workspace_id"`
	ConnectionID      uint            `json:"connection_id"`
	GitHubRepoID      int64           `json:"github_repo_id"`
	OwnerLogin        string          `json:"owner_login"`
	RepoName          string          `json:"repo_name"`
	FullName          string          `json:"full_name"`
	HTMLURL           string          `json:"html_url"`
	DefaultBranch     string          `json:"default_branch"`
	Visibility        string          `json:"visibility"`
	IsPrivate         bool            `json:"is_private"`
	SourceType        string          `json:"source_type"`
	OrganizationLogin string          `json:"organization_login"`
	Permissions       map[string]bool `json:"permissions"`
	Archived          bool            `json:"archived"`
	Disabled          bool            `json:"disabled"`
	LastSeenAt        time.Time       `json:"last_seen_at"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// Repository stores the GitHub repository metadata SpecForge works against.
type Repository struct {
	ID                       uint      `json:"id"`
	RepositoryID             string    `json:"repository_id"`
	WorkspaceID              string    `json:"workspace_id"`
	GitHubInstallationID     uint      `json:"github_installation_id"`
	GitHubConnectionID       uint      `json:"github_connection_id,omitempty"`
	GitHubRepositoryAccessID uint      `json:"github_repository_access_id,omitempty"`
	AccessSource             string    `json:"access_source,omitempty"`
	GitHubOwner              string    `json:"github_owner"`
	GitHubRepo               string    `json:"github_repo"`
	DefaultBranch            string    `json:"default_branch"`
	IsPrivate                bool      `json:"is_private"`
	CreatedBy                uint      `json:"created_by"`
	CreatedAt                time.Time `json:"created_at"`
	UpdatedAt                time.Time `json:"updated_at"`
}

// GitHubSettings stores workspace-level GitHub integration behavior flags.
type GitHubSettings struct {
	ID                  uint      `json:"id"`
	WorkspaceID         string    `json:"workspace_id"`
	Enabled             bool      `json:"enabled"`
	PullRequestSidebar  bool      `json:"pull_request_sidebar"`
	CoAuthoredByTrailer bool      `json:"co_authored_by_trailer"`
	IssuePRAutoLink     bool      `json:"issue_pr_auto_link"`
	UpdatedBy           uint      `json:"updated_by"`
	CreatedAt           time.Time `json:"created_at"`
	UpdatedAt           time.Time `json:"updated_at"`
}

// GitHubWebhookEvent stores an idempotent raw GitHub webhook delivery.
type GitHubWebhookEvent struct {
	ID                 uint      `json:"id"`
	DeliveryID         string    `json:"delivery_id"`
	EventType          string    `json:"event_type"`
	Action             string    `json:"action"`
	InstallationID     int64     `json:"installation_id"`
	RepositoryFullName string    `json:"repository_full_name"`
	Payload            string    `json:"payload"`
	Signature          string    `json:"signature"`
	Status             string    `json:"status"`
	ReceivedAt         time.Time `json:"received_at"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// GitHubIntegrationRepository persists GitHub App integration state.
type GitHubIntegrationRepository interface {
	UpsertInstallation(ctx context.Context, installation *GitHubInstallation) error
	FindInstallationByID(ctx context.Context, id uint) (*GitHubInstallation, error)
	FindInstallationByGitHubID(ctx context.Context, installationID int64) (*GitHubInstallation, error)
	ListInstallationsByWorkspaceID(ctx context.Context, workspaceID string) ([]*GitHubInstallation, error)
	UpsertRepository(ctx context.Context, repository *Repository) error
	FindRepositoryByRepositoryID(ctx context.Context, repositoryID string) (*Repository, error)
	ListRepositoriesByWorkspaceID(ctx context.Context, workspaceID string) ([]*Repository, error)
	UpsertSettings(ctx context.Context, settings *GitHubSettings) error
	FindSettingsByWorkspaceID(ctx context.Context, workspaceID string) (*GitHubSettings, error)
	CreateWebhookEvent(ctx context.Context, event *GitHubWebhookEvent) error
	FindWebhookEventByDeliveryID(ctx context.Context, deliveryID string) (*GitHubWebhookEvent, error)
	ListWebhookEvents(ctx context.Context, status, repositoryFullName string, limit int) ([]*GitHubWebhookEvent, error)
	UpdateWebhookEventStatus(ctx context.Context, deliveryID, status string) error
}
