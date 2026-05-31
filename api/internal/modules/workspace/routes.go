package workspace

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/workspaces", h.CreateWorkspace).Name("workspaces.store")
		auth.GET("/workspaces", h.ListWorkspaces).Name("workspaces.index")
		auth.GET("/workspaces/:workspace_id", h.GetWorkspace).Name("workspaces.show")
		auth.PATCH("/workspaces/:workspace_id", h.UpdateWorkspace).Name("workspaces.update")
	})
}
