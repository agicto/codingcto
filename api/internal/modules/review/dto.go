package review

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type ApproveReviewDecisionRequest struct {
	Reason string `json:"reason" binding:"omitempty,max=5000"`
}

type RejectReviewDecisionRequest struct {
	Reason string `json:"reason" binding:"required,max=5000"`
}

type RequestMergeReviewDecisionRequest struct {
	MergeMethod   string `json:"merge_method" binding:"omitempty,oneof=merge squash rebase"`
	CommitTitle   string `json:"commit_title" binding:"omitempty,max=255"`
	CommitMessage string `json:"commit_message" binding:"omitempty,max=5000"`
}

type ReviewDecisionResponse struct {
	PRNode         *domain.SpecForgePRNode  `json:"pr_node"`
	Decision       *ReviewDecisionDTO       `json:"decision,omitempty"`
	DecisionStatus string                   `json:"decision_status"`
	MergeReady     bool                     `json:"merge_ready"`
	Summary        string                   `json:"summary"`
	NextAction     string                   `json:"next_action"`
	Checks         []ReviewDecisionCheckDTO `json:"checks"`
}

type RequestMergeReviewDecisionResponse struct {
	PRNode         *domain.SpecForgePRNode `json:"pr_node"`
	Decision       *ReviewDecisionDTO      `json:"decision,omitempty"`
	MergeAccepted  bool                    `json:"merge_accepted"`
	MergeMessage   string                  `json:"merge_message"`
	MergeSHA       string                  `json:"merge_sha,omitempty"`
	DecisionStatus string                  `json:"decision_status"`
}

type ReviewDecisionDTO struct {
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

type ReviewDecisionCheckDTO struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Detail   string `json:"detail"`
	Required bool   `json:"required"`
}

func toReviewDecisionDTO(decision *domain.SpecForgeReviewDecision) *ReviewDecisionDTO {
	if decision == nil {
		return nil
	}
	return &ReviewDecisionDTO{
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
