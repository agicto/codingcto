package verification

import (
	"context"
	"errors"
	"strings"

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

func (r *repository) UpdateFixAttemptStatus(ctx context.Context, fixAttemptID uint, status string) error {
	status = strings.TrimSpace(status)
	if fixAttemptID == 0 || status == "" {
		return domain.ErrInvalidInput
	}
	result := r.db.WithContext(ctx).
		Model(&FixAttemptPO{}).
		Where("id = ?", fixAttemptID).
		Update("status", status)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *repository) FindFixAttemptByPRNodeIDAndWorkflowRunID(ctx context.Context, prNodeID uint, workflowRunID int64) (*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 || workflowRunID <= 0 {
		return nil, domain.ErrInvalidInput
	}
	var po FixAttemptPO
	if err := r.db.WithContext(ctx).
		Where("pr_node_id = ? AND workflow_run_id = ?", prNodeID, workflowRunID).
		Order("id ASC").
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
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
