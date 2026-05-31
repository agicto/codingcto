package githubintegration

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.POST("/webhooks/github", h.ReceiveWebhook).Name("github.webhooks.receive")

	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/github/installations", h.UpsertInstallation).Name("github.installations.store")
		auth.POST("/github/installations/sync", h.SyncInstallation).Name("github.installations.sync")
		auth.GET("/github/installations/:id", h.GetInstallation).Name("github.installations.show").WhereNumber("id")
		auth.POST("/github/repositories", h.UpsertRepository).Name("github.repositories.store")
		auth.GET("/github/repositories", h.ListRepositories).Name("github.repositories.index")
		auth.GET("/repositories/:repo_id", h.GetRepository).Name("github.repositories.show")
		auth.GET("/github/settings", h.GetSettings).Name("github.settings.show")
		auth.PUT("/github/settings", h.UpsertSettings).Name("github.settings.update")
		auth.GET("/github/webhooks", h.ListWebhookEvents).Name("github.webhooks.index")
		auth.POST("/github/pr-nodes/prepare-branch", h.PreparePRNodeBranch).Name("github.pr_nodes.prepare_branch")
		auth.POST("/github/pr-nodes/deliver", h.DeliverPRNode).Name("github.pr_nodes.deliver")
		auth.POST("/github/pr-nodes/refresh-ci", h.RefreshPRNodeCI).Name("github.pr_nodes.refresh_ci")
		auth.POST("/github/pr-nodes/failure-log", h.ReadPRNodeFailureLog).Name("github.pr_nodes.failure_log")
	})
}
