package deepwiki

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	httphandler "github.com/zgiai/luas/api/pkg/handler"
	"github.com/zgiai/luas/api/pkg/pagination"
	"github.com/zgiai/luas/api/pkg/response"
)

type Handler struct {
	service Service
}

var (
	_ contracts.Module      = (*Handler)(nil)
	_ contracts.RouteModule = (*Handler)(nil)
)

func NewHandler(service Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Name() string {
	return "deepwiki"
}

func (h *Handler) CreateSource(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	var req CreateSourceRequest
	if !httphandler.BindJSON(c, &req) {
		return
	}
	source, err := h.service.CreateSource(c.Request.Context(), userID, &req)
	if err != nil {
		response.HandleError(c, "Failed to create DeepWiki source", err)
		return
	}
	response.Created(c, sourceResponse(source))
}

func (h *Handler) ListSources(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	page := pagination.FromContext(c)
	filter := domain.DeepWikiSourceFilter{
		SourceType: c.Query("source_type"),
		Status:     c.Query("status"),
	}
	sources, total, err := h.service.ListSources(c.Request.Context(), userID, filter, page.GetPage(), page.GetPerPage())
	if err != nil {
		response.HandleError(c, "Failed to list DeepWiki sources", err)
		return
	}
	paginator := pagination.NewPaginator(sourceResponses(sources), total, page.GetPage(), page.GetPerPage())
	paginator.SetPath(c.Request.URL.Path)
	response.Success(c, paginator)
}

func (h *Handler) GetSource(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	sourceID, ok := httphandler.ParseID(c, "id")
	if !ok {
		return
	}
	source, err := h.service.GetSource(c.Request.Context(), userID, sourceID)
	if err != nil {
		response.HandleError(c, "Failed to get DeepWiki source", err)
		return
	}
	response.Success(c, sourceResponse(source))
}

func (h *Handler) IndexSource(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	sourceID, ok := httphandler.ParseID(c, "id")
	if !ok {
		return
	}
	req := &IndexSourceRequest{}
	if c.Request.ContentLength != 0 {
		if !httphandler.BindJSON(c, req) {
			return
		}
	}
	index, err := h.service.IndexSource(c.Request.Context(), userID, sourceID, req)
	if err != nil {
		response.HandleError(c, "Failed to index DeepWiki source", err)
		return
	}
	response.Success(c, indexResponse(index))
}

func (h *Handler) GetLatestIndex(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	sourceID, ok := httphandler.ParseID(c, "id")
	if !ok {
		return
	}
	index, err := h.service.GetLatestIndex(c.Request.Context(), userID, sourceID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			response.Success(c, nil)
			return
		}
		response.HandleError(c, "Failed to get DeepWiki index", err)
		return
	}
	response.Success(c, indexResponse(index))
}

func (h *Handler) ListPages(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	indexID, ok := httphandler.ParseID(c, "indexId")
	if !ok {
		return
	}
	pages, err := h.service.ListPages(c.Request.Context(), userID, indexID)
	if err != nil {
		response.HandleError(c, "Failed to list DeepWiki pages", err)
		return
	}
	response.Success(c, pageResponses(pages))
}

func (h *Handler) GetPage(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	pageID, ok := httphandler.ParseID(c, "pageId")
	if !ok {
		return
	}
	page, err := h.service.GetPage(c.Request.Context(), userID, pageID)
	if err != nil {
		response.HandleError(c, "Failed to get DeepWiki page", err)
		return
	}
	response.Success(c, pageResponse(page))
}

func (h *Handler) GetPageBySlug(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	indexID, ok := httphandler.ParseID(c, "indexId")
	if !ok {
		return
	}
	page, err := h.service.GetPageByIndexAndSlug(c.Request.Context(), userID, indexID, c.Param("slug"))
	if err != nil {
		response.HandleError(c, "Failed to get DeepWiki page", err)
		return
	}
	response.Success(c, pageResponse(page))
}

func (h *Handler) Search(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	indexID, ok := httphandler.ParseID(c, "indexId")
	if !ok {
		return
	}
	query := c.Query("q")
	results, err := h.service.Search(c.Request.Context(), userID, indexID, query)
	if err != nil {
		response.HandleError(c, "Failed to search DeepWiki index", err)
		return
	}
	response.Success(c, &SearchResponse{Query: query, Results: results})
}

func (h *Handler) SourceSnippet(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	indexID, ok := httphandler.ParseID(c, "indexId")
	if !ok {
		return
	}
	snippet, err := h.service.SourceSnippet(
		c.Request.Context(),
		userID,
		indexID,
		c.Query("path"),
		httphandler.QueryInt(c, "start", 0),
		httphandler.QueryInt(c, "end", 0),
	)
	if err != nil {
		response.HandleError(c, "Failed to read DeepWiki source snippet", err)
		return
	}
	response.Success(c, snippet)
}

func (h *Handler) BrowseLocalDirectories(c *gin.Context) {
	userID, ok := httphandler.GetUserID(c)
	if !ok {
		return
	}
	directories, err := h.service.BrowseLocalDirectories(c.Request.Context(), userID, c.Query("path"))
	if err != nil {
		response.HandleError(c, "Failed to browse local directories", err)
		return
	}
	response.Success(c, directories)
}
