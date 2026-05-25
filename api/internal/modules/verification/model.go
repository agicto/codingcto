package verification

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type FixAttemptPO struct {
	ID                uint    `gorm:"primaryKey"`
	PRNodeID          uint    `gorm:"not null;index"`
	FailureType       string  `gorm:"size:100;not null;index"`
	CILogExcerpt      string  `gorm:"type:text"`
	AttemptNumber     int     `gorm:"not null"`
	Status            string  `gorm:"size:50;not null;index"`
	Confidence        float64 `gorm:"not null"`
	LikelyCause       string  `gorm:"type:text"`
	RecommendedAction string  `gorm:"type:text"`
	CanAutoFix        bool    `gorm:"not null"`
	CreatedBy         uint    `gorm:"not null;index"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (FixAttemptPO) TableName() string {
	return "specforge_fix_attempts"
}

func newFixAttemptPO(attempt *domain.SpecForgeFixAttempt) *FixAttemptPO {
	return &FixAttemptPO{
		ID:                attempt.ID,
		PRNodeID:          attempt.PRNodeID,
		FailureType:       attempt.FailureType,
		CILogExcerpt:      attempt.CILogExcerpt,
		AttemptNumber:     attempt.AttemptNumber,
		Status:            attempt.Status,
		Confidence:        attempt.Confidence,
		LikelyCause:       attempt.LikelyCause,
		RecommendedAction: attempt.RecommendedAction,
		CanAutoFix:        attempt.CanAutoFix,
		CreatedBy:         attempt.CreatedBy,
		CreatedAt:         attempt.CreatedAt,
		UpdatedAt:         attempt.UpdatedAt,
	}
}

func (po *FixAttemptPO) toDomain() *domain.SpecForgeFixAttempt {
	return &domain.SpecForgeFixAttempt{
		ID:                po.ID,
		PRNodeID:          po.PRNodeID,
		FailureType:       po.FailureType,
		CILogExcerpt:      po.CILogExcerpt,
		AttemptNumber:     po.AttemptNumber,
		Status:            po.Status,
		Confidence:        po.Confidence,
		LikelyCause:       po.LikelyCause,
		RecommendedAction: po.RecommendedAction,
		CanAutoFix:        po.CanAutoFix,
		CreatedBy:         po.CreatedBy,
		CreatedAt:         po.CreatedAt,
		UpdatedAt:         po.UpdatedAt,
	}
}
