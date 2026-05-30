package verification

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.GET("/pr-nodes/:id/fix-attempts", h.ListFixAttempts).Name("specforge.pr_nodes.fix_attempts.index").WhereNumber("id")
		auth.POST("/pr-nodes/:id/verify-ci", h.VerifyPRNodeCI).Name("specforge.pr_nodes.verify_ci").WhereNumber("id")
		auth.POST("/pr-nodes/:id/fix-attempts", h.CreateFixAttempt).Name("specforge.pr_nodes.fix_attempts.store").WhereNumber("id")
		auth.POST("/pr-nodes/:id/fix-attempts/from-ci", h.CreateFixAttemptFromCI).Name("specforge.pr_nodes.fix_attempts.from_ci").WhereNumber("id")
		auth.GET("/pr-nodes/:id/escalation-summary", h.GetEscalationSummary).Name("specforge.pr_nodes.escalation_summary.show").WhereNumber("id")
	})
}
