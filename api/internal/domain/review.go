package domain

import (
	"context"
	"time"
)

const (
	ReviewDecisionStatusApproved = "approved"
	ReviewDecisionStatusRejected = "rejected"
	ReviewDecisionStatusExpired  = "expired"
)

// SpecForgeReviewDecision records CodingCTO-side approval state for one PR node head SHA.
type SpecForgeReviewDecision struct {
	ID        uint       `json:"id"`
	PRNodeID  uint       `json:"pr_node_id"`
	Status    string     `json:"status"`
	HeadSHA   string     `json:"head_sha"`
	Reason    string     `json:"reason,omitempty"`
	DecidedBy uint       `json:"decided_by"`
	DecidedAt time.Time  `json:"decided_at"`
	ExpiredAt *time.Time `json:"expired_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

// SpecForgeReviewDecisionRepository persists review decision state for PR nodes.
type SpecForgeReviewDecisionRepository interface {
	CreateReviewDecision(ctx context.Context, decision *SpecForgeReviewDecision) error
	UpdateReviewDecision(ctx context.Context, decision *SpecForgeReviewDecision) error
	FindLatestReviewDecisionByPRNodeID(ctx context.Context, prNodeID uint) (*SpecForgeReviewDecision, error)
}
