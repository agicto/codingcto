package execution

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/plans/:id/run", h.StartRun).Name("specforge.plans.runs.store").WhereNumber("id")
		auth.GET("/plans/:id/run/latest", h.GetLatestPlanRun).Name("specforge.plans.runs.latest").WhereNumber("id")
		auth.GET("/runs/:id", h.GetRun).Name("specforge.runs.show").WhereNumber("id")
		auth.POST("/runs/:id/dispatch", h.DispatchRun).Name("specforge.runs.dispatch").WhereNumber("id")
		auth.POST("/runs/:id/cancel", h.CancelRun).Name("specforge.runs.cancel").WhereNumber("id")
		auth.GET("/agent-tasks", h.ListDirectAgentTasks).Name("codingcto.agent_tasks.index")
		auth.POST("/agent-tasks", h.CreateDirectAgentTask).Name("codingcto.agent_tasks.store")
		auth.GET("/agent-tasks/:id", h.GetDirectAgentTask).Name("codingcto.agent_tasks.show").WhereNumber("id")
		auth.POST("/agent-tasks/:id/cancel", h.CancelDirectAgentTask).Name("codingcto.agent_tasks.cancel").WhereNumber("id")
		auth.GET("/agent-tasks/:id/events", h.ListDirectTaskEvents).Name("codingcto.agent_tasks.events.index").WhereNumber("id")
		auth.GET("/runtimes", h.ListRuntimes).Name("specforge.runtimes.index")
		auth.POST("/runtimes/sweep", h.SweepStaleRuntimes).Name("specforge.runtimes.sweep")
		auth.GET("/runtimes/:runtime_id/tasks/pending", h.ListRuntimePendingTasks).Name("specforge.runtimes.tasks.pending")
		auth.POST("/tasks/sweep", h.SweepStaleTasks).Name("specforge.tasks.sweep")
		auth.POST("/tasks/:id/session", h.PinTaskSession).Name("specforge.tasks.session.store").WhereNumber("id")
		auth.POST("/tasks/:id/execute", h.ExecuteTask).Name("specforge.tasks.execute").WhereNumber("id")
		auth.POST("/tasks/:id/retry", h.RetryTask).Name("specforge.tasks.retry").WhereNumber("id")
		auth.POST("/tasks/:id/review-patch", h.CreateReviewPatchTask).Name("specforge.tasks.review_patch").WhereNumber("id")
		auth.GET("/tasks/:id/events", h.ListTaskEvents).Name("specforge.tasks.events.index").WhereNumber("id")
		auth.POST("/tasks/:id/complete", h.CompleteTask).Name("specforge.tasks.complete").WhereNumber("id")
	})

	r.Group("", func(runtime *router.Router) {
		runtime.Middleware(RuntimeTokenAuth())

		runtime.POST("/runtimes/heartbeat", h.HeartbeatRuntime).Name("specforge.runtimes.heartbeat")
		runtime.POST("/runtimes/deregister", h.DeregisterRuntimes).Name("specforge.runtimes.deregister")
		runtime.POST("/runtimes/:runtime_id/claim", h.ClaimTask).Name("specforge.runtimes.claim")
		runtime.GET("/runtime/agent-tasks/:id", h.GetDirectAgentTaskForRuntime).Name("codingcto.runtime.agent_tasks.show").WhereNumber("id")
		runtime.POST("/tasks/:id/events", h.CreateTaskEvent).Name("specforge.tasks.events.store").WhereNumber("id")
		runtime.POST("/tasks/:id/result", h.SubmitTaskResult).Name("specforge.tasks.result.store").WhereNumber("id")
		runtime.POST("/agent-tasks/:id/events", h.CreateDirectTaskEvent).Name("codingcto.agent_tasks.events.store").WhereNumber("id")
		runtime.POST("/agent-tasks/:id/result", h.SubmitDirectTaskResult).Name("codingcto.agent_tasks.result.store").WhereNumber("id")
	})
}
