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

type GitHubAccountConnectionPO struct {
	ID                    uint   `gorm:"primaryKey"`
	WorkspaceID           string `gorm:"size:255;not null;uniqueIndex"`
	UserID                uint   `gorm:"not null;index"`
	GitHubUserID          int64  `gorm:"not null;index"`
	GitHubLogin           string `gorm:"size:255;not null;index"`
	GitHubName            string `gorm:"size:255"`
	GitHubAvatarURL       string `gorm:"size:1000"`
	AccessTokenEncrypted  string `gorm:"type:text;not null"`
	RefreshTokenEncrypted string `gorm:"type:text"`
	ScopeString           string `gorm:"type:text"`
	TokenStatus           string `gorm:"size:50;not null;index"`
	LastVerifiedAt        *time.Time
	LastSyncedAt          *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

func (GitHubAccountConnectionPO) TableName() string {
	return "github_account_connections"
}

type GitHubRepositoryAccessPO struct {
	ID                uint   `gorm:"primaryKey"`
	WorkspaceID       string `gorm:"size:255;not null;uniqueIndex:idx_github_repo_access_workspace_repo,priority:1;index"`
	ConnectionID      uint   `gorm:"not null;index"`
	GitHubRepoID      int64  `gorm:"not null;uniqueIndex:idx_github_repo_access_workspace_repo,priority:2"`
	OwnerLogin        string `gorm:"size:255;not null;index"`
	RepoName          string `gorm:"size:255;not null"`
	FullName          string `gorm:"size:511;not null;index"`
	HTMLURL           string `gorm:"size:1000"`
	DefaultBranch     string `gorm:"size:100;not null"`
	Visibility        string `gorm:"size:50;not null"`
	IsPrivate         bool   `gorm:"not null"`
	SourceType        string `gorm:"size:50;not null;index"`
	OrganizationLogin string `gorm:"size:255;index"`
	PermissionsJSON   string `gorm:"column:permissions_json;type:text"`
	Archived          bool   `gorm:"not null;default:false"`
	Disabled          bool   `gorm:"not null;default:false"`
	LastSeenAt        time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (GitHubRepositoryAccessPO) TableName() string {
	return "github_repository_accesses"
}

type RepositoryPO struct {
	ID                       uint   `gorm:"primaryKey"`
	RepositoryID             string `gorm:"size:255;not null;uniqueIndex"`
	WorkspaceID              string `gorm:"size:255;not null;index"`
	GitHubInstallationID     uint   `gorm:"not null;index"`
	GitHubConnectionID       uint   `gorm:"index"`
	GitHubRepositoryAccessID uint   `gorm:"index"`
	AccessSource             string `gorm:"size:50;not null;default:'legacy_installation';index"`
	GitHubOwner              string `gorm:"size:255;not null;index"`
	GitHubRepo               string `gorm:"size:255;not null;index"`
	DefaultBranch            string `gorm:"size:100;not null"`
	IsPrivate                bool   `gorm:"not null"`
	CreatedBy                uint   `gorm:"not null;index"`
	CreatedAt                time.Time
	UpdatedAt                time.Time
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

type GitHubSettingsPO struct {
	ID                  uint   `gorm:"primaryKey"`
	WorkspaceID         string `gorm:"size:255;not null;uniqueIndex"`
	Enabled             bool   `gorm:"not null"`
	PullRequestSidebar  bool   `gorm:"not null"`
	CoAuthoredByTrailer bool   `gorm:"not null"`
	IssuePRAutoLink     bool   `gorm:"not null"`
	UpdatedBy           uint   `gorm:"not null;index"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (GitHubSettingsPO) TableName() string {
	return "github_settings"
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

func newGitHubAccountConnectionPO(connection *domain.GitHubAccountConnection) *GitHubAccountConnectionPO {
	return &GitHubAccountConnectionPO{
		ID:                    connection.ID,
		WorkspaceID:           connection.WorkspaceID,
		UserID:                connection.UserID,
		GitHubUserID:          connection.GitHubUserID,
		GitHubLogin:           connection.GitHubLogin,
		GitHubName:            connection.GitHubName,
		GitHubAvatarURL:       connection.GitHubAvatarURL,
		AccessTokenEncrypted:  connection.AccessTokenEncrypted,
		RefreshTokenEncrypted: connection.RefreshTokenEncrypted,
		ScopeString:           connection.ScopeString,
		TokenStatus:           connection.TokenStatus,
		LastVerifiedAt:        connection.LastVerifiedAt,
		LastSyncedAt:          connection.LastSyncedAt,
		CreatedAt:             connection.CreatedAt,
		UpdatedAt:             connection.UpdatedAt,
	}
}

func (po *GitHubAccountConnectionPO) toDomain() *domain.GitHubAccountConnection {
	return &domain.GitHubAccountConnection{
		ID:                    po.ID,
		WorkspaceID:           po.WorkspaceID,
		UserID:                po.UserID,
		GitHubUserID:          po.GitHubUserID,
		GitHubLogin:           po.GitHubLogin,
		GitHubName:            po.GitHubName,
		GitHubAvatarURL:       po.GitHubAvatarURL,
		AccessTokenEncrypted:  po.AccessTokenEncrypted,
		RefreshTokenEncrypted: po.RefreshTokenEncrypted,
		ScopeString:           po.ScopeString,
		TokenStatus:           po.TokenStatus,
		LastVerifiedAt:        po.LastVerifiedAt,
		LastSyncedAt:          po.LastSyncedAt,
		CreatedAt:             po.CreatedAt,
		UpdatedAt:             po.UpdatedAt,
	}
}

func newGitHubRepositoryAccessPO(access *domain.GitHubRepositoryAccess) *GitHubRepositoryAccessPO {
	return &GitHubRepositoryAccessPO{
		ID:                access.ID,
		WorkspaceID:       access.WorkspaceID,
		ConnectionID:      access.ConnectionID,
		GitHubRepoID:      access.GitHubRepoID,
		OwnerLogin:        access.OwnerLogin,
		RepoName:          access.RepoName,
		FullName:          access.FullName,
		HTMLURL:           access.HTMLURL,
		DefaultBranch:     access.DefaultBranch,
		Visibility:        access.Visibility,
		IsPrivate:         access.IsPrivate,
		SourceType:        access.SourceType,
		OrganizationLogin: access.OrganizationLogin,
		PermissionsJSON:   encodeBoolPermissions(access.Permissions),
		Archived:          access.Archived,
		Disabled:          access.Disabled,
		LastSeenAt:        access.LastSeenAt,
		CreatedAt:         access.CreatedAt,
		UpdatedAt:         access.UpdatedAt,
	}
}

func (po *GitHubRepositoryAccessPO) toDomain() *domain.GitHubRepositoryAccess {
	return &domain.GitHubRepositoryAccess{
		ID:                po.ID,
		WorkspaceID:       po.WorkspaceID,
		ConnectionID:      po.ConnectionID,
		GitHubRepoID:      po.GitHubRepoID,
		OwnerLogin:        po.OwnerLogin,
		RepoName:          po.RepoName,
		FullName:          po.FullName,
		HTMLURL:           po.HTMLURL,
		DefaultBranch:     po.DefaultBranch,
		Visibility:        po.Visibility,
		IsPrivate:         po.IsPrivate,
		SourceType:        po.SourceType,
		OrganizationLogin: po.OrganizationLogin,
		Permissions:       decodeBoolPermissions(po.PermissionsJSON),
		Archived:          po.Archived,
		Disabled:          po.Disabled,
		LastSeenAt:        po.LastSeenAt,
		CreatedAt:         po.CreatedAt,
		UpdatedAt:         po.UpdatedAt,
	}
}

func newRepositoryPO(repository *domain.Repository) *RepositoryPO {
	accessSource := repository.AccessSource
	if accessSource == "" {
		accessSource = domain.RepositoryAccessSourceLegacyInstallation
	}
	return &RepositoryPO{
		ID:                       repository.ID,
		RepositoryID:             repository.RepositoryID,
		WorkspaceID:              repository.WorkspaceID,
		GitHubInstallationID:     repository.GitHubInstallationID,
		GitHubConnectionID:       repository.GitHubConnectionID,
		GitHubRepositoryAccessID: repository.GitHubRepositoryAccessID,
		AccessSource:             accessSource,
		GitHubOwner:              repository.GitHubOwner,
		GitHubRepo:               repository.GitHubRepo,
		DefaultBranch:            repository.DefaultBranch,
		IsPrivate:                repository.IsPrivate,
		CreatedBy:                repository.CreatedBy,
		CreatedAt:                repository.CreatedAt,
		UpdatedAt:                repository.UpdatedAt,
	}
}

func (po *RepositoryPO) toDomain() *domain.Repository {
	return &domain.Repository{
		ID:                       po.ID,
		RepositoryID:             po.RepositoryID,
		WorkspaceID:              po.WorkspaceID,
		GitHubInstallationID:     po.GitHubInstallationID,
		GitHubConnectionID:       po.GitHubConnectionID,
		GitHubRepositoryAccessID: po.GitHubRepositoryAccessID,
		AccessSource:             po.AccessSource,
		GitHubOwner:              po.GitHubOwner,
		GitHubRepo:               po.GitHubRepo,
		DefaultBranch:            po.DefaultBranch,
		IsPrivate:                po.IsPrivate,
		CreatedBy:                po.CreatedBy,
		CreatedAt:                po.CreatedAt,
		UpdatedAt:                po.UpdatedAt,
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

func newGitHubSettingsPO(settings *domain.GitHubSettings) *GitHubSettingsPO {
	return &GitHubSettingsPO{
		ID:                  settings.ID,
		WorkspaceID:         settings.WorkspaceID,
		Enabled:             settings.Enabled,
		PullRequestSidebar:  settings.PullRequestSidebar,
		CoAuthoredByTrailer: settings.CoAuthoredByTrailer,
		IssuePRAutoLink:     settings.IssuePRAutoLink,
		UpdatedBy:           settings.UpdatedBy,
		CreatedAt:           settings.CreatedAt,
		UpdatedAt:           settings.UpdatedAt,
	}
}

func (po *GitHubSettingsPO) toDomain() *domain.GitHubSettings {
	return &domain.GitHubSettings{
		ID:                  po.ID,
		WorkspaceID:         po.WorkspaceID,
		Enabled:             po.Enabled,
		PullRequestSidebar:  po.PullRequestSidebar,
		CoAuthoredByTrailer: po.CoAuthoredByTrailer,
		IssuePRAutoLink:     po.IssuePRAutoLink,
		UpdatedBy:           po.UpdatedBy,
		CreatedAt:           po.CreatedAt,
		UpdatedAt:           po.UpdatedAt,
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

func encodeBoolPermissions(permissions map[string]bool) string {
	if permissions == nil {
		permissions = map[string]bool{}
	}
	b, _ := json.Marshal(permissions)
	return string(b)
}

func decodeBoolPermissions(value string) map[string]bool {
	if value == "" {
		return map[string]bool{}
	}
	var out map[string]bool
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return map[string]bool{}
	}
	return out
}
