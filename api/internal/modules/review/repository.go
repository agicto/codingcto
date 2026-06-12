package review

import (
	"context"
	"errors"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) CreateReviewDecision(ctx context.Context, decision *domain.SpecForgeReviewDecision) error {
	po := newReviewDecisionPO(decision)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	decision.ID = po.ID
	decision.CreatedAt = po.CreatedAt
	decision.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) UpdateReviewDecision(ctx context.Context, decision *domain.SpecForgeReviewDecision) error {
	if decision == nil || decision.ID == 0 {
		return domain.ErrInvalidInput
	}
	po := newReviewDecisionPO(decision)
	result := r.db.WithContext(ctx).Model(&ReviewDecisionPO{}).Where("id = ?", decision.ID).Updates(po)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *repository) FindLatestReviewDecisionByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeReviewDecision, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var po ReviewDecisionPO
	if err := r.db.WithContext(ctx).
		Where("pr_node_id = ?", prNodeID).
		Order("decided_at DESC, id DESC").
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}
