package expert

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.GET("/experts", h.ListExperts).Name("codingcto.experts.index")
		auth.POST("/experts", h.UpsertExpert).Name("codingcto.experts.store")
		auth.GET("/experts/:id", h.GetExpert).Name("codingcto.experts.show").WhereNumber("id")
		auth.PATCH("/experts/:id", h.UpsertExpert).Name("codingcto.experts.update").WhereNumber("id")
		auth.GET("/experts/:id/skills", h.ListExpertSkills).Name("codingcto.experts.skills.index").WhereNumber("id")
		auth.POST("/experts/:id/skills", h.UpsertExpertSkill).Name("codingcto.experts.skills.store").WhereNumber("id")
		auth.GET("/experts/:id/runs", h.ListExpertRuns).Name("codingcto.experts.runs.index").WhereNumber("id")

		auth.GET("/expert-skills/:id/versions", h.ListSkillVersions).Name("codingcto.expert_skills.versions.index").WhereNumber("id")
		auth.POST("/expert-skills/:id/versions", h.CreateSkillVersion).Name("codingcto.expert_skills.versions.store").WhereNumber("id")
		auth.GET("/expert-skills/:id/evolution-proposals", h.ListEvolutionProposals).Name("codingcto.expert_skills.evolution_proposals.index").WhereNumber("id")
		auth.POST("/expert-skills/:id/evolution-proposals", h.CreateEvolutionProposal).Name("codingcto.expert_skills.evolution_proposals.store").WhereNumber("id")

		auth.POST("/skill-evolution-proposals/:id/approve", h.ApproveEvolutionProposal).Name("codingcto.skill_evolution_proposals.approve").WhereNumber("id")
		auth.POST("/skill-evolution-proposals/:id/reject", h.RejectEvolutionProposal).Name("codingcto.skill_evolution_proposals.reject").WhereNumber("id")
		auth.POST("/skill-evolution-proposals/:id/promote", h.PromoteEvolutionProposal).Name("codingcto.skill_evolution_proposals.promote").WhereNumber("id")
	})
}
