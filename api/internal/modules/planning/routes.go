package planning

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/repositories/:repo_id/ideas", h.CreateIdea).Name("specforge.ideas.store")
		auth.GET("/ideas/:id/plan", h.GetPlan).Name("specforge.ideas.plan").WhereNumber("id")
		auth.POST("/plans/:id/approve", h.ApprovePlan).Name("specforge.plans.approve").WhereNumber("id")
	})
}
