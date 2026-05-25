package githubintegration

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type GitHubInstallationPO struct {
	ID             uint   `gorm:"primaryKey"`
	WorkspaceID    string `gorm:"size:255;not null;index"`
	InstallationID int64  `gorm:"not null;uniqueIndex"`
	AccountLogin   string `gorm:"size:255;not null;index"`
	Permissions    string `gorm:"type:text"`
	CreatedBy      uint   `gorm:"not null;index"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (GitHubInstallationPO) TableName() string {
	return "github_installations"
}

type RepositoryPO struct {
	ID                   uint   `gorm:"primaryKey"`
	RepositoryID         string `gorm:"size:255;not null;uniqueIndex"`
	WorkspaceID          string `gorm:"size:255;not null;index"`
	GitHubInstallationID uint   `gorm:"not null;index"`
	GitHubOwner          string `gorm:"size:255;not null;index"`
	GitHubRepo           string `gorm:"size:255;not null;index"`
	DefaultBranch        string `gorm:"size:100;not null"`
	IsPrivate            bool   `gorm:"not null"`
	CreatedBy            uint   `gorm:"not null;index"`
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

func (RepositoryPO) TableName() string {
	return "repositories"
}

type GitHubWebhookEventPO struct {
	ID                 uint   `gorm:"primaryKey"`
	DeliveryID         string `gorm:"size:255;not null;uniqueIndex"`
	EventType          string `gorm:"size:100;not null;index"`
	Action             string `gorm:"size:100;index"`
	InstallationID     int64  `gorm:"index"`
	RepositoryFullName string `gorm:"size:511;index"`
	Payload            string `gorm:"type:text;not null"`
	Signature          string `gorm:"size:255"`
	Status             string `gorm:"size:50;not null;index"`
	ReceivedAt         time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
}

func (GitHubWebhookEventPO) TableName() string {
	return "github_webhook_events"
}

func newGitHubInstallationPO(installation *domain.GitHubInstallation) *GitHubInstallationPO {
	return &GitHubInstallationPO{
		ID:             installation.ID,
		WorkspaceID:    installation.WorkspaceID,
		InstallationID: installation.InstallationID,
		AccountLogin:   installation.AccountLogin,
		Permissions:    encodePermissions(installation.Permissions),
		CreatedBy:      installation.CreatedBy,
		CreatedAt:      installation.CreatedAt,
		UpdatedAt:      installation.UpdatedAt,
	}
}

func (po *GitHubInstallationPO) toDomain() *domain.GitHubInstallation {
	return &domain.GitHubInstallation{
		ID:             po.ID,
		WorkspaceID:    po.WorkspaceID,
		InstallationID: po.InstallationID,
		AccountLogin:   po.AccountLogin,
		Permissions:    decodePermissions(po.Permissions),
		CreatedBy:      po.CreatedBy,
		CreatedAt:      po.CreatedAt,
		UpdatedAt:      po.UpdatedAt,
	}
}

func newRepositoryPO(repository *domain.Repository) *RepositoryPO {
	return &RepositoryPO{
		ID:                   repository.ID,
		RepositoryID:         repository.RepositoryID,
		WorkspaceID:          repository.WorkspaceID,
		GitHubInstallationID: repository.GitHubInstallationID,
		GitHubOwner:          repository.GitHubOwner,
		GitHubRepo:           repository.GitHubRepo,
		DefaultBranch:        repository.DefaultBranch,
		IsPrivate:            repository.IsPrivate,
		CreatedBy:            repository.CreatedBy,
		CreatedAt:            repository.CreatedAt,
		UpdatedAt:            repository.UpdatedAt,
	}
}

func (po *RepositoryPO) toDomain() *domain.Repository {
	return &domain.Repository{
		ID:                   po.ID,
		RepositoryID:         po.RepositoryID,
		WorkspaceID:          po.WorkspaceID,
		GitHubInstallationID: po.GitHubInstallationID,
		GitHubOwner:          po.GitHubOwner,
		GitHubRepo:           po.GitHubRepo,
		DefaultBranch:        po.DefaultBranch,
		IsPrivate:            po.IsPrivate,
		CreatedBy:            po.CreatedBy,
		CreatedAt:            po.CreatedAt,
		UpdatedAt:            po.UpdatedAt,
	}
}

func newGitHubWebhookEventPO(event *domain.GitHubWebhookEvent) *GitHubWebhookEventPO {
	return &GitHubWebhookEventPO{
		ID:                 event.ID,
		DeliveryID:         event.DeliveryID,
		EventType:          event.EventType,
		Action:             event.Action,
		InstallationID:     event.InstallationID,
		RepositoryFullName: event.RepositoryFullName,
		Payload:            event.Payload,
		Signature:          event.Signature,
		Status:             event.Status,
		ReceivedAt:         event.ReceivedAt,
		CreatedAt:          event.CreatedAt,
		UpdatedAt:          event.UpdatedAt,
	}
}

func (po *GitHubWebhookEventPO) toDomain() *domain.GitHubWebhookEvent {
	return &domain.GitHubWebhookEvent{
		ID:                 po.ID,
		DeliveryID:         po.DeliveryID,
		EventType:          po.EventType,
		Action:             po.Action,
		InstallationID:     po.InstallationID,
		RepositoryFullName: po.RepositoryFullName,
		Payload:            po.Payload,
		Signature:          po.Signature,
		Status:             po.Status,
		ReceivedAt:         po.ReceivedAt,
		CreatedAt:          po.CreatedAt,
		UpdatedAt:          po.UpdatedAt,
	}
}

func encodePermissions(permissions map[string]string) string {
	if permissions == nil {
		permissions = map[string]string{}
	}
	b, _ := json.Marshal(permissions)
	return string(b)
}

func decodePermissions(value string) map[string]string {
	if value == "" {
		return map[string]string{}
	}
	var out map[string]string
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return map[string]string{}
	}
	return out
}
