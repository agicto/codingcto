package domain

import (
	"context"
	"time"
)

const (
	FixAttemptStatusQueued  = "queued"
	FixAttemptStatusSuccess = "success"
	FixAttemptStatusFailed  = "failed"
)

// SpecForgeFixAttempt records a CI/spec failure diagnosis and repair attempt.
type SpecForgeFixAttempt struct {
	ID                uint      `json:"id"`
	PRNodeID          uint      `json:"pr_node_id"`
	FailureType       string    `json:"failure_type"`
	CILogExcerpt      string    `json:"ci_log_excerpt"`
	AttemptNumber     int       `json:"attempt_number"`
	Status            string    `json:"status"`
	Confidence        float64   `json:"confidence"`
	LikelyCause       string    `json:"likely_cause"`
	RecommendedAction string    `json:"recommended_action"`
	CanAutoFix        bool      `json:"can_auto_fix"`
	CreatedBy         uint      `json:"created_by"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// SpecForgeVerificationRepository persists verification and auto-fix state.
type SpecForgeVerificationRepository interface {
	CreateFixAttempt(ctx context.Context, attempt *SpecForgeFixAttempt) error
	UpdateFixAttemptStatus(ctx context.Context, fixAttemptID uint, status string) error
	ListFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) ([]*SpecForgeFixAttempt, error)
	CountFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) (int, error)
}
