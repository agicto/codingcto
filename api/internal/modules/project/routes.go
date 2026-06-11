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
		auth.DELETE("/projects/:id/repositories/:repository_id", h.UnbindRepository).Name("specforge.project_repositories.destroy").WhereNumber("id")
		auth.GET("/projects/:id/context", h.GetProjectContext).Name("specforge.projects.context").WhereNumber("id")
	})
}
