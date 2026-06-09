package planning

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/projects/:id/requirements", h.CreateProjectRequirement).Name("specforge.projects.requirements.store").WhereNumber("id")
		auth.POST("/projects/:id/ideas", h.CreateProjectIdea).Name("specforge.projects.ideas.store").WhereNumber("id")
		auth.GET("/projects/:id/specforge/latest-plan", h.GetLatestProjectPlan).Name("specforge.projects.latest_plan").WhereNumber("id")
		auth.GET("/projects/:id/skills", h.ListProjectSkills).Name("specforge.projects.skills.index").WhereNumber("id")
		auth.POST("/projects/:id/skills", h.UpsertProjectSkill).Name("specforge.projects.skills.store").WhereNumber("id")
		auth.POST("/repositories/:repo_id/ideas", h.CreateIdea).Name("specforge.ideas.store")
		auth.GET("/repositories/:repo_id/skills", h.ListSkills).Name("specforge.skills.index")
		auth.POST("/repositories/:repo_id/skills", h.UpsertSkill).Name("specforge.skills.store")
		auth.GET("/requirements/:id/plan", h.GetRequirementPlan).Name("specforge.requirements.plan").WhereNumber("id")
		auth.POST("/requirements/:id/generate-plan", h.GenerateRequirementPlan).Name("specforge.requirements.plan.generate").WhereNumber("id")
		auth.GET("/requirements/:id/skill-runs", h.ListRequirementSkillRuns).Name("specforge.requirements.skill_runs.index").WhereNumber("id")
		auth.GET("/ideas/:id/plan", h.GetPlan).Name("specforge.ideas.plan").WhereNumber("id")
		auth.GET("/plans/:id", h.GetPlanByID).Name("specforge.plans.show").WhereNumber("id")
		auth.POST("/plans/:id/approve", h.ApprovePlan).Name("specforge.plans.approve").WhereNumber("id")
		auth.GET("/plans/:id/skill-runs", h.ListPlanSkillRuns).Name("specforge.plans.skill_runs.index").WhereNumber("id")
		auth.POST("/experts/implementation-plan", h.GenerateExpertImplementationPlan).Name("specforge.experts.implementation_plan")
		auth.POST("/experts/implementation-plan/stream", h.StreamExpertImplementationPlan).Name("specforge.experts.implementation_plan.stream")
		auth.POST("/pr-nodes/:id/prompts", h.CompilePrompt).Name("specforge.pr_nodes.prompts.store").WhereNumber("id")
	})
}
