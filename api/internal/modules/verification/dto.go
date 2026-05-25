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
