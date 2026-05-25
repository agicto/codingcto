package execution

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/plans/:id/run", h.StartRun).Name("specforge.plans.runs.store").WhereNumber("id")
		auth.GET("/runs/:id", h.GetRun).Name("specforge.runs.show").WhereNumber("id")
	})
}
