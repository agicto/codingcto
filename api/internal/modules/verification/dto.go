package verification

import "github.com/zgiai/luas/api/internal/domain"

type CreateFixAttemptRequest struct {
	FailureType       string  `json:"failure_type" binding:"required,max=100"`
	CILogExcerpt      string  `json:"ci_log_excerpt" binding:"omitempty,max=20000"`
	Status            string  `json:"status" binding:"omitempty,max=50"`
	Confidence        float64 `json:"confidence" binding:"omitempty,min=0,max=1"`
	LikelyCause       string  `json:"likely_cause" binding:"omitempty,max=5000"`
	RecommendedAction string  `json:"recommended_action" binding:"omitempty,max=5000"`
	CanAutoFix        bool    `json:"can_auto_fix"`
	RiskLevel         string  `json:"risk_level" binding:"omitempty,max=30"`
	ActionKind        string  `json:"action_kind" binding:"omitempty,max=50"`
	BlockedReason     string  `json:"blocked_reason" binding:"omitempty,max=5000"`
	WorkflowRunID     int64   `json:"workflow_run_id" binding:"omitempty"`
	WorkflowRunURL    string  `json:"workflow_run_url" binding:"omitempty,max=500"`
	Conclusion        string  `json:"conclusion" binding:"omitempty,max=100"`
}

type CreateFixAttemptFromCIRequest struct {
	RepositoryID   string `json:"repository_id" binding:"required,max=255"`
	WorkflowRunID  int64  `json:"workflow_run_id" binding:"omitempty"`
	WorkflowRunURL string `json:"workflow_run_url" binding:"omitempty,max=500"`
	Conclusion     string `json:"conclusion" binding:"omitempty,max=100"`
}

type VerifyPRNodeCIRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
}

type VerifyPRNodeCIResponse struct {
	PRNode            *domain.SpecForgePRNode     `json:"pr_node"`
	FixAttempt        *domain.SpecForgeFixAttempt `json:"fix_attempt,omitempty"`
	EscalationSummary *EscalationSummary          `json:"escalation_summary,omitempty"`
	VerificationState string                      `json:"verification_state"`
	NextAction        string                      `json:"next_action"`
}

type EscalationSummary struct {
	PRNodeID            uint     `json:"pr_node_id"`
	Status              string   `json:"status"`
	AttemptsUsed        int      `json:"attempts_used"`
	MaxAttempts         int      `json:"max_attempts"`
	FailureTypes        []string `json:"failure_types"`
	Reason              string   `json:"reason"`
	RecommendedOption   string   `json:"recommended_option"`
	DecisionOptions     []string `json:"decision_options"`
	LatestFailureType   string   `json:"latest_failure_type"`
	LatestLikelyCause   string   `json:"latest_likely_cause"`
	LatestAction        string   `json:"latest_action"`
	LatestRiskLevel     string   `json:"latest_risk_level"`
	LatestActionKind    string   `json:"latest_action_kind"`
	LatestBlockedReason string   `json:"latest_blocked_reason"`
	CanContinueAutoFix  bool     `json:"can_continue_auto_fix"`
}
