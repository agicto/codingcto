package project

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/projects", h.CreateProject).Name("specforge.projects.store")
		auth.GET("/projects", h.ListProjects).Name("specforge.projects.index")
		auth.GET("/projects/:id", h.GetProject).Name("specforge.projects.show").WhereNumber("id")
		auth.PATCH("/projects/:id", h.UpdateProject).Name("specforge.projects.update").WhereNumber("id")
		auth.DELETE("/projects/:id", h.DeleteProject).Name("specforge.projects.destroy").WhereNumber("id")
		auth.POST("/projects/:id/repositories", h.BindRepository).Name("specforge.project_repositories.store").WhereNumber("id")
		auth.GET("/projects/:id/repositories", h.ListRepositories).Name("specforge.project_repositories.index").WhereNumber("id")
		auth.GET("/projects/:id/repositories/options", h.ListRepositoryOptions).Name("specforge.project_repositories.options").WhereNumber("id")
		auth.DELETE("/projects/:id/repositories/:repository_id", h.UnbindRepository).Name("specforge.project_repositories.destroy").WhereNumber("id")
		auth.GET("/projects/:id/readiness", h.GetProjectReadiness).Name("specforge.projects.readiness").WhereNumber("id")
		auth.GET("/projects/:id/context", h.GetProjectContext).Name("specforge.projects.context").WhereNumber("id")
		auth.POST("/projects/:id/context/reindex", h.RefreshProjectContext).Name("specforge.projects.context.reindex").WhereNumber("id")
		auth.GET("/projects/:id/deepwiki", h.ListProjectDeepWiki).Name("specforge.projects.deepwiki.index").WhereNumber("id")
		auth.POST("/projects/:id/repositories/:repository_id/deepwiki/reindex", h.ReindexProjectRepositoryDeepWiki).Name("specforge.projects.repositories.deepwiki.reindex").WhereNumber("id")
		auth.DELETE("/projects/:id/repositories/:repository_id/deepwiki", h.DeleteProjectRepositoryDeepWiki).Name("specforge.projects.repositories.deepwiki.destroy").WhereNumber("id")
		auth.GET("/projects/:id/runtime-bindings", h.ListProjectRuntimeBindings).Name("specforge.projects.runtime_bindings.index").WhereNumber("id")
		auth.POST("/projects/:id/runtime-bindings", h.CreateProjectRuntimeBinding).Name("specforge.projects.runtime_bindings.store").WhereNumber("id")
		auth.PATCH("/projects/:id/runtime-bindings/:binding_id", h.UpdateProjectRuntimeBinding).Name("specforge.projects.runtime_bindings.update").WhereNumber("id").WhereNumber("binding_id")
		auth.GET("/projects/:id/expert-policy", h.GetProjectExpertPolicy).Name("specforge.projects.expert_policy.show").WhereNumber("id")
		auth.POST("/projects/:id/expert-policy", h.CreateProjectExpertPolicy).Name("specforge.projects.expert_policy.store").WhereNumber("id")
		auth.PATCH("/projects/:id/expert-policy/:policy_id", h.UpdateProjectExpertPolicy).Name("specforge.projects.expert_policy.update").WhereNumber("id").WhereNumber("policy_id")
	})
}
