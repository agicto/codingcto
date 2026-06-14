package review

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.GET("/pr-nodes/:id/review-decision", h.GetReviewDecision).Name("specforge.pr_nodes.review_decision.show").WhereNumber("id")
		auth.POST("/pr-nodes/:id/review-decision/approve", h.ApproveReviewDecision).Name("specforge.pr_nodes.review_decision.approve").WhereNumber("id")
		auth.POST("/pr-nodes/:id/review-decision/reject", h.RejectReviewDecision).Name("specforge.pr_nodes.review_decision.reject").WhereNumber("id")
		auth.POST("/pr-nodes/:id/review-decision/request-merge", h.RequestMergeReviewDecision).Name("specforge.pr_nodes.review_decision.request_merge").WhereNumber("id")
	})
}
