package githubintegration

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) UpsertInstallation(ctx context.Context, installation *domain.GitHubInstallation) error {
	po := newGitHubInstallationPO(installation)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "installation_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"workspace_id", "account_login", "permissions", "created_by", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}
	saved, err := r.FindInstallationByGitHubID(ctx, installation.InstallationID)
	if err != nil {
		return err
	}
	*installation = *saved
	return nil
}

func (r *repository) FindInstallationByID(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	var po GitHubInstallationPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindInstallationByGitHubID(ctx context.Context, installationID int64) (*domain.GitHubInstallation, error) {
	var po GitHubInstallationPO
	if err := r.db.WithContext(ctx).Where("installation_id = ?", installationID).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListInstallationsByWorkspaceID(ctx context.Context, workspaceID string) ([]*domain.GitHubInstallation, error) {
	var rows []*GitHubInstallationPO
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("updated_at DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.GitHubInstallation, len(rows))
	for index, row := range rows {
		out[index] = row.toDomain()
	}
	return out, nil
}

func (r *repository) UpsertAccountConnection(ctx context.Context, connection *domain.GitHubAccountConnection) error {
	po := newGitHubAccountConnectionPO(connection)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "workspace_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"user_id", "git_hub_user_id", "git_hub_login", "git_hub_name", "git_hub_avatar_url",
			"access_token_encrypted", "refresh_token_encrypted", "scope_string", "token_status",
			"last_verified_at", "last_synced_at", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}
	saved, err := r.FindAccountConnectionByWorkspaceID(ctx, connection.WorkspaceID)
	if err != nil {
		return err
	}
	*connection = *saved
	return nil
}

func (r *repository) FindAccountConnectionByWorkspaceID(ctx context.Context, workspaceID string) (*domain.GitHubAccountConnection, error) {
	var po GitHubAccountConnectionPO
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", strings.TrimSpace(workspaceID)).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) DeleteAccountConnectionByWorkspaceID(ctx context.Context, workspaceID string) error {
	result := r.db.WithContext(ctx).Where("workspace_id = ?", strings.TrimSpace(workspaceID)).Delete(&GitHubAccountConnectionPO{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *repository) TouchAccountConnectionSyncedAt(ctx context.Context, workspaceID string, syncedAt time.Time) error {
	result := r.db.WithContext(ctx).
		Model(&GitHubAccountConnectionPO{}).
		Where("workspace_id = ?", strings.TrimSpace(workspaceID)).
		Updates(map[string]any{
			"last_synced_at": syncedAt,
			"updated_at":     time.Now().UTC(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *repository) UpsertRepositoryAccess(ctx context.Context, access *domain.GitHubRepositoryAccess) error {
	po := newGitHubRepositoryAccessPO(access)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "workspace_id"}, {Name: "git_hub_repo_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"connection_id", "owner_login", "repo_name", "full_name", "html_url",
			"default_branch", "visibility", "is_private", "source_type", "organization_login",
			"permissions_json", "archived", "disabled", "last_seen_at", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}
	saved, err := r.FindRepositoryAccessByWorkspaceAndGitHubRepoID(ctx, access.WorkspaceID, access.GitHubRepoID)
	if err != nil {
		return err
	}
	*access = *saved
	return nil
}

func (r *repository) FindRepositoryAccessByWorkspaceAndGitHubRepoID(ctx context.Context, workspaceID string, githubRepoID int64) (*domain.GitHubRepositoryAccess, error) {
	var po GitHubRepositoryAccessPO
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ? AND git_hub_repo_id = ?", strings.TrimSpace(workspaceID), githubRepoID).
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindRepositoryAccessByID(ctx context.Context, id uint) (*domain.GitHubRepositoryAccess, error) {
	var po GitHubRepositoryAccessPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListRepositoryAccesses(ctx context.Context, workspaceID, sourceType, organizationLogin, query string) ([]*domain.GitHubRepositoryAccess, error) {
	db := r.db.WithContext(ctx).Model(&GitHubRepositoryAccessPO{}).
		Where("workspace_id = ?", strings.TrimSpace(workspaceID))
	if strings.TrimSpace(sourceType) != "" {
		db = db.Where("source_type = ?", strings.TrimSpace(sourceType))
	}
	if strings.TrimSpace(organizationLogin) != "" {
		db = db.Where("organization_login = ?", strings.TrimSpace(organizationLogin))
	}
	if strings.TrimSpace(query) != "" {
		like := "%" + strings.ToLower(strings.TrimSpace(query)) + "%"
		db = db.Where("LOWER(full_name) LIKE ? OR LOWER(owner_login) LIKE ? OR LOWER(repo_name) LIKE ?", like, like, like)
	}
	var rows []*GitHubRepositoryAccessPO
	if err := db.Order("source_type ASC, organization_login ASC, full_name ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.GitHubRepositoryAccess, len(rows))
	for index, row := range rows {
		out[index] = row.toDomain()
	}
	return out, nil
}

func (r *repository) UpsertRepository(ctx context.Context, repository *domain.Repository) error {
	po := newRepositoryPO(repository)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "repository_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"workspace_id", "git_hub_installation_id", "git_hub_connection_id",
			"git_hub_repository_access_id", "access_source", "git_hub_owner", "git_hub_repo",
			"default_branch", "is_private", "created_by", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}
	saved, err := r.FindRepositoryByRepositoryID(ctx, repository.RepositoryID)
	if err != nil {
		return err
	}
	*repository = *saved
	return nil
}

func (r *repository) FindRepositoryByRepositoryID(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	var po RepositoryPO
	if err := r.db.WithContext(ctx).Where("repository_id = ?", repositoryID).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListRepositoriesByWorkspaceID(ctx context.Context, workspaceID string) ([]*domain.Repository, error) {
	var pos []*RepositoryPO
	query := r.db.WithContext(ctx).Model(&RepositoryPO{})
	if strings.TrimSpace(workspaceID) != "" {
		query = query.Where("workspace_id = ?", strings.TrimSpace(workspaceID))
	}
	if err := query.Order("updated_at DESC, id DESC").Find(&pos).Error; err != nil {
		return nil, err
	}
	repositories := make([]*domain.Repository, len(pos))
	for i, po := range pos {
		repositories[i] = po.toDomain()
	}
	return repositories, nil
}

func (r *repository) UpsertSettings(ctx context.Context, settings *domain.GitHubSettings) error {
	po := newGitHubSettingsPO(settings)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "workspace_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"enabled", "pull_request_sidebar", "co_authored_by_trailer", "issue_pr_auto_link",
			"updated_by", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}
	saved, err := r.FindSettingsByWorkspaceID(ctx, settings.WorkspaceID)
	if err != nil {
		return err
	}
	*settings = *saved
	return nil
}

func (r *repository) FindSettingsByWorkspaceID(ctx context.Context, workspaceID string) (*domain.GitHubSettings, error) {
	var po GitHubSettingsPO
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) CreateWebhookEvent(ctx context.Context, event *domain.GitHubWebhookEvent) error {
	po := newGitHubWebhookEventPO(event)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	event.ID = po.ID
	event.CreatedAt = po.CreatedAt
	event.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) FindWebhookEventByDeliveryID(ctx context.Context, deliveryID string) (*domain.GitHubWebhookEvent, error) {
	var po GitHubWebhookEventPO
	if err := r.db.WithContext(ctx).Where("delivery_id = ?", deliveryID).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListWebhookEvents(ctx context.Context, status, repositoryFullName string, limit int) ([]*domain.GitHubWebhookEvent, error) {
	status = strings.TrimSpace(status)
	repositoryFullName = strings.TrimSpace(repositoryFullName)
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := r.db.WithContext(ctx).Model(&GitHubWebhookEventPO{})
	if status != "" {
		query = query.Where("status = ?", status)
	}
	if repositoryFullName != "" {
		query = query.Where("repository_full_name = ?", repositoryFullName)
	}
	var pos []*GitHubWebhookEventPO
	if err := query.Order("received_at DESC, id DESC").Limit(limit).Find(&pos).Error; err != nil {
		return nil, err
	}
	events := make([]*domain.GitHubWebhookEvent, len(pos))
	for i, po := range pos {
		events[i] = po.toDomain()
	}
	return events, nil
}

func (r *repository) UpdateWebhookEventStatus(ctx context.Context, deliveryID, status string) error {
	deliveryID = strings.TrimSpace(deliveryID)
	status = strings.TrimSpace(status)
	if deliveryID == "" || status == "" {
		return domain.ErrInvalidInput
	}
	result := r.db.WithContext(ctx).
		Model(&GitHubWebhookEventPO{}).
		Where("delivery_id = ?", deliveryID).
		Update("status", status)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
