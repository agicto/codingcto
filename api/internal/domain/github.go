package domain

import (
	"context"
	"time"
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

// Repository stores the GitHub repository metadata SpecForge works against.
type Repository struct {
	ID                   uint      `json:"id"`
	RepositoryID         string    `json:"repository_id"`
	WorkspaceID          string    `json:"workspace_id"`
	GitHubInstallationID uint      `json:"github_installation_id"`
	GitHubOwner          string    `json:"github_owner"`
	GitHubRepo           string    `json:"github_repo"`
	DefaultBranch        string    `json:"default_branch"`
	IsPrivate            bool      `json:"is_private"`
	CreatedBy            uint      `json:"created_by"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
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
	UpsertRepository(ctx context.Context, repository *Repository) error
	FindRepositoryByRepositoryID(ctx context.Context, repositoryID string) (*Repository, error)
	CreateWebhookEvent(ctx context.Context, event *GitHubWebhookEvent) error
	FindWebhookEventByDeliveryID(ctx context.Context, deliveryID string) (*GitHubWebhookEvent, error)
	ListWebhookEvents(ctx context.Context, status, repositoryFullName string, limit int) ([]*GitHubWebhookEvent, error)
	UpdateWebhookEventStatus(ctx context.Context, deliveryID, status string) error
}
