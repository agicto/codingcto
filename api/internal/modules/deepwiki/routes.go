package deepwiki

import "github.com/zgiai/luas/api/internal/infra/router"

func (h *Handler) RegisterRoutes(r *router.Router) {
	r.Group("", func(auth *router.Router) {
		auth.WithMiddleware("auth")

		auth.POST("/deepwiki/sources", h.CreateSource).Name("deepwiki.sources.store")
		auth.GET("/deepwiki/sources", h.ListSources).Name("deepwiki.sources.index")
		auth.GET("/deepwiki/sources/:id", h.GetSource).Name("deepwiki.sources.show").WhereNumber("id")
		auth.POST("/deepwiki/sources/:id/index", h.IndexSource).Name("deepwiki.sources.index.store").WhereNumber("id")
		auth.GET("/deepwiki/sources/:id/index", h.GetLatestIndex).Name("deepwiki.sources.index.show").WhereNumber("id")

		auth.GET("/deepwiki/indexes/:indexId/pages", h.ListPages).Name("deepwiki.indexes.pages.index").WhereNumber("indexId")
		auth.GET("/deepwiki/indexes/:indexId/pages/:slug", h.GetPageBySlug).Name("deepwiki.indexes.pages.show").WhereNumber("indexId")
		auth.GET("/deepwiki/pages/:pageId", h.GetPage).Name("deepwiki.pages.show").WhereNumber("pageId")
		auth.GET("/deepwiki/indexes/:indexId/search", h.Search).Name("deepwiki.indexes.search").WhereNumber("indexId")
		auth.GET("/deepwiki/indexes/:indexId/source", h.SourceSnippet).Name("deepwiki.indexes.source").WhereNumber("indexId")
		auth.GET("/deepwiki/local-directories", h.BrowseLocalDirectories).Name("deepwiki.local-directories.index")
	})
}
