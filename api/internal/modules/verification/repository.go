package verification

import (
	"context"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) CreateFixAttempt(ctx context.Context, attempt *domain.SpecForgeFixAttempt) error {
	po := newFixAttemptPO(attempt)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	attempt.ID = po.ID
	attempt.CreatedAt = po.CreatedAt
	attempt.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) ListFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	var pos []*FixAttemptPO
	if err := r.db.WithContext(ctx).Where("pr_node_id = ?", prNodeID).Order("attempt_number ASC, id ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeFixAttempt, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func (r *repository) CountFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) (int, error) {
	var count int64
	if err := r.db.WithContext(ctx).Model(&FixAttemptPO{}).Where("pr_node_id = ?", prNodeID).Count(&count).Error; err != nil {
		return 0, err
	}
	return int(count), nil
}
