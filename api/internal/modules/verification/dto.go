package verification

type CreateFixAttemptRequest struct {
	FailureType       string  `json:"failure_type" binding:"required,max=100"`
	CILogExcerpt      string  `json:"ci_log_excerpt" binding:"omitempty,max=20000"`
	Status            string  `json:"status" binding:"omitempty,max=50"`
	Confidence        float64 `json:"confidence" binding:"omitempty,min=0,max=1"`
	LikelyCause       string  `json:"likely_cause" binding:"omitempty,max=5000"`
	RecommendedAction string  `json:"recommended_action" binding:"omitempty,max=5000"`
	CanAutoFix        bool    `json:"can_auto_fix"`
}

type CreateFixAttemptFromCIRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
}

type EscalationSummary struct {
	PRNodeID           uint     `json:"pr_node_id"`
	Status             string   `json:"status"`
	AttemptsUsed       int      `json:"attempts_used"`
	MaxAttempts        int      `json:"max_attempts"`
	FailureTypes       []string `json:"failure_types"`
	Reason             string   `json:"reason"`
	RecommendedOption  string   `json:"recommended_option"`
	DecisionOptions    []string `json:"decision_options"`
	LatestFailureType  string   `json:"latest_failure_type"`
	LatestLikelyCause  string   `json:"latest_likely_cause"`
	LatestAction       string   `json:"latest_action"`
	CanContinueAutoFix bool     `json:"can_continue_auto_fix"`
}
