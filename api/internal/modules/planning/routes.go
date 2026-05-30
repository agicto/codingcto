package planning

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/projects/:id/ideas", h.CreateProjectIdea).Name("specforge.projects.ideas.store").WhereNumber("id")
		auth.POST("/repositories/:repo_id/ideas", h.CreateIdea).Name("specforge.ideas.store")
		auth.GET("/repositories/:repo_id/skills", h.ListSkills).Name("specforge.skills.index")
		auth.POST("/repositories/:repo_id/skills", h.UpsertSkill).Name("specforge.skills.store")
		auth.GET("/ideas/:id/plan", h.GetPlan).Name("specforge.ideas.plan").WhereNumber("id")
		auth.POST("/plans/:id/approve", h.ApprovePlan).Name("specforge.plans.approve").WhereNumber("id")
		auth.POST("/pr-nodes/:id/prompts", h.CompilePrompt).Name("specforge.pr_nodes.prompts.store").WhereNumber("id")
	})
}
