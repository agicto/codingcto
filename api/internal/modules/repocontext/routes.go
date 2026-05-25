package repocontext

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.GET("/repositories/:repo_id/profile", h.GetProfile).Name("specforge.repositories.profile.show")
		auth.POST("/repositories/:repo_id/profile", h.UpsertProfile).Name("specforge.repositories.profile.store")
	})
}
