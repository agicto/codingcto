package repocontext

import (
	"context"

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

func (r *repository) UpsertProfile(ctx context.Context, profile *domain.SpecForgeRepoProfile) error {
	po := newRepoProfilePO(profile)
	if err := r.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "repository_id"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"default_branch", "stack", "test_commands", "ci_provider", "app_structure",
			"coding_conventions", "risk_areas", "summary", "created_by", "last_indexed_at", "updated_at",
		}),
	}).Create(po).Error; err != nil {
		return err
	}

	saved, err := r.FindProfileByRepositoryID(ctx, profile.RepositoryID)
	if err != nil {
		return err
	}
	*profile = *saved
	return nil
}

func (r *repository) FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	var po RepoProfilePO
	if err := r.db.WithContext(ctx).Where("repository_id = ?", repositoryID).First(&po).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}
