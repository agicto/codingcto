package githubintegration

import (
	"context"
	"errors"
	"strings"

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

func (r *repository) UpsertRepository(ctx context.Context, repository *domain.Repository) error {
	po := newRepositoryPO(repository)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "repository_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"workspace_id", "github_installation_id", "github_owner", "github_repo",
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
