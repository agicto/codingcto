package githubintegration

import (
	"context"
	"errors"

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
