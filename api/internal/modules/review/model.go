package review

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type ReviewDecisionPO struct {
	ID        uint   `gorm:"primaryKey"`
	PRNodeID  uint   `gorm:"not null;index"`
	Status    string `gorm:"size:50;not null;index"`
	HeadSHA   string `gorm:"size:255;not null;index"`
	Reason    string `gorm:"type:text"`
	DecidedBy uint   `gorm:"not null;index"`
	DecidedAt time.Time
	ExpiredAt *time.Time
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (ReviewDecisionPO) TableName() string {
	return "review_decisions"
}

func newReviewDecisionPO(decision *domain.SpecForgeReviewDecision) *ReviewDecisionPO {
	return &ReviewDecisionPO{
		ID:        decision.ID,
		PRNodeID:  decision.PRNodeID,
		Status:    decision.Status,
		HeadSHA:   decision.HeadSHA,
		Reason:    decision.Reason,
		DecidedBy: decision.DecidedBy,
		DecidedAt: decision.DecidedAt,
		ExpiredAt: decision.ExpiredAt,
		CreatedAt: decision.CreatedAt,
		UpdatedAt: decision.UpdatedAt,
	}
}

func (po *ReviewDecisionPO) toDomain() *domain.SpecForgeReviewDecision {
	return &domain.SpecForgeReviewDecision{
		ID:        po.ID,
		PRNodeID:  po.PRNodeID,
		Status:    po.Status,
		HeadSHA:   po.HeadSHA,
		Reason:    po.Reason,
		DecidedBy: po.DecidedBy,
		DecidedAt: po.DecidedAt,
		ExpiredAt: po.ExpiredAt,
		CreatedAt: po.CreatedAt,
		UpdatedAt: po.UpdatedAt,
	}
}
