package githubintegration

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.POST("/webhooks/github", h.ReceiveWebhook).Name("github.webhooks.receive")

	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/github/installations", h.UpsertInstallation).Name("github.installations.store")
		auth.GET("/github/installations/:id", h.GetInstallation).Name("github.installations.show").WhereNumber("id")
		auth.POST("/github/repositories", h.UpsertRepository).Name("github.repositories.store")
		auth.GET("/repositories/:repo_id", h.GetRepository).Name("github.repositories.show")
		auth.POST("/github/pr-nodes/deliver", h.DeliverPRNode).Name("github.pr_nodes.deliver")
	})
}
