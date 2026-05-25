package execution

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/plans/:id/run", h.StartRun).Name("specforge.plans.runs.store").WhereNumber("id")
		auth.GET("/runs/:id", h.GetRun).Name("specforge.runs.show").WhereNumber("id")
		auth.POST("/runs/:id/dispatch", h.DispatchRun).Name("specforge.runs.dispatch").WhereNumber("id")
		auth.POST("/runs/:id/cancel", h.CancelRun).Name("specforge.runs.cancel").WhereNumber("id")
		auth.POST("/runtimes/heartbeat", h.HeartbeatRuntime).Name("specforge.runtimes.heartbeat")
		auth.POST("/runtimes/sweep", h.SweepStaleRuntimes).Name("specforge.runtimes.sweep")
		auth.POST("/runtimes/:runtime_id/claim", h.ClaimTask).Name("specforge.runtimes.claim")
		auth.POST("/tasks/sweep", h.SweepStaleTasks).Name("specforge.tasks.sweep")
		auth.POST("/tasks/:id/session", h.PinTaskSession).Name("specforge.tasks.session.store").WhereNumber("id")
		auth.POST("/tasks/:id/execute", h.ExecuteTask).Name("specforge.tasks.execute").WhereNumber("id")
		auth.POST("/tasks/:id/retry", h.RetryTask).Name("specforge.tasks.retry").WhereNumber("id")
		auth.GET("/tasks/:id/events", h.ListTaskEvents).Name("specforge.tasks.events.index").WhereNumber("id")
		auth.POST("/tasks/:id/events", h.CreateTaskEvent).Name("specforge.tasks.events.store").WhereNumber("id")
		auth.POST("/tasks/:id/result", h.SubmitTaskResult).Name("specforge.tasks.result.store").WhereNumber("id")
		auth.POST("/tasks/:id/complete", h.CompleteTask).Name("specforge.tasks.complete").WhereNumber("id")
	})
}
