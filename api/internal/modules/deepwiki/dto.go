package deepwiki

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type CreateSourceRequest struct {
	SourceType string `json:"source_type" binding:"required,oneof=github_url local_path"`
	RepoURL    string `json:"repo_url" binding:"omitempty,max=1000"`
	LocalPath  string `json:"local_path" binding:"omitempty,max=1000"`
	Branch     string `json:"branch" binding:"omitempty,max=120"`
	PAT        string `json:"pat" binding:"omitempty,max=4000"`
}

type SourceResponse struct {
	ID            uint       `json:"id"`
	CreatedBy     uint       `json:"created_by"`
	SourceType    string     `json:"source_type"`
	RepoURL       string     `json:"repo_url,omitempty"`
	LocalPath     string     `json:"local_path,omitempty"`
	Branch        string     `json:"branch,omitempty"`
	Status        string     `json:"status"`
	LastIndexedAt *time.Time `json:"last_indexed_at,omitempty"`
	LastFailure   string     `json:"last_failure,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type SourceListResponse struct {
	Sources []*SourceResponse `json:"sources"`
}

type IndexResponse struct {
	ID              uint           `json:"id"`
	SourceID        uint           `json:"source_id"`
	CommitSHA       string         `json:"commit_sha,omitempty"`
	FileCount       int            `json:"file_count"`
	ChunkCount      int            `json:"chunk_count"`
	LanguageSummary map[string]int `json:"language_summary"`
	FileTree        []string       `json:"file_tree"`
	Entrypoints     []string       `json:"entrypoints"`
	Routes          []string       `json:"routes"`
	Services        []string       `json:"services"`
	Models          []string       `json:"models"`
	Configs         []string       `json:"configs"`
	Frameworks      []string       `json:"frameworks"`
	PackageManager  string         `json:"package_manager,omitempty"`
	Status          string         `json:"status"`
	ErrorMessage    string         `json:"error_message,omitempty"`
	CreatedAt       time.Time      `json:"created_at"`
	UpdatedAt       time.Time      `json:"updated_at"`
}

type PageResponse struct {
	ID           uint                       `json:"id"`
	IndexID      uint                       `json:"index_id"`
	Slug         string                     `json:"slug"`
	Title        string                     `json:"title"`
	PageType     string                     `json:"page_type"`
	Markdown     string                     `json:"markdown"`
	HTML         string                     `json:"html,omitempty"`
	Mermaid      string                     `json:"mermaid,omitempty"`
	SourceRefs   []domain.DeepWikiSourceRef `json:"source_refs"`
	OrderIndex   int                        `json:"order_index"`
	Status       string                     `json:"status"`
	ErrorMessage string                     `json:"error_message,omitempty"`
	CreatedAt    time.Time                  `json:"created_at"`
	UpdatedAt    time.Time                  `json:"updated_at"`
}

type SearchResponse struct {
	Query   string                         `json:"query"`
	Results []*domain.DeepWikiSearchResult `json:"results"`
}

type SourceSnippetResponse struct {
	IndexID   uint   `json:"index_id"`
	Path      string `json:"path"`
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
	Content   string `json:"content"`
}

type LocalDirectoryEntryResponse struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type LocalDirectoryListResponse struct {
	Path       string                         `json:"path"`
	ParentPath string                         `json:"parent_path,omitempty"`
	Entries    []*LocalDirectoryEntryResponse `json:"entries"`
}

func sourceResponse(source *domain.DeepWikiSource) *SourceResponse {
	if source == nil {
		return nil
	}
	return &SourceResponse{
		ID:            source.ID,
		CreatedBy:     source.CreatedBy,
		SourceType:    source.SourceType,
		RepoURL:       source.RepoURL,
		LocalPath:     source.LocalPath,
		Branch:        source.Branch,
		Status:        source.Status,
		LastIndexedAt: source.LastIndexedAt,
		LastFailure:   source.LastFailure,
		LastError:     source.LastError,
		CreatedAt:     source.CreatedAt,
		UpdatedAt:     source.UpdatedAt,
	}
}

func sourceResponses(sources []*domain.DeepWikiSource) []*SourceResponse {
	out := make([]*SourceResponse, len(sources))
	for i, source := range sources {
		out[i] = sourceResponse(source)
	}
	return out
}

func indexResponse(index *domain.DeepWikiIndex) *IndexResponse {
	if index == nil {
		return nil
	}
	return &IndexResponse{
		ID:              index.ID,
		SourceID:        index.SourceID,
		CommitSHA:       index.CommitSHA,
		FileCount:       index.FileCount,
		ChunkCount:      index.ChunkCount,
		LanguageSummary: index.LanguageSummary,
		FileTree:        index.FileTree,
		Entrypoints:     index.Entrypoints,
		Routes:          index.Routes,
		Services:        index.Services,
		Models:          index.Models,
		Configs:         index.Configs,
		Frameworks:      index.Frameworks,
		PackageManager:  index.PackageManager,
		Status:          index.Status,
		ErrorMessage:    index.ErrorMessage,
		CreatedAt:       index.CreatedAt,
		UpdatedAt:       index.UpdatedAt,
	}
}

func pageResponse(page *domain.DeepWikiPage) *PageResponse {
	if page == nil {
		return nil
	}
	return &PageResponse{
		ID:           page.ID,
		IndexID:      page.IndexID,
		Slug:         page.Slug,
		Title:        page.Title,
		PageType:     page.PageType,
		Markdown:     page.Markdown,
		HTML:         page.HTML,
		Mermaid:      page.Mermaid,
		SourceRefs:   page.SourceRefs,
		OrderIndex:   page.OrderIndex,
		Status:       page.Status,
		ErrorMessage: page.ErrorMessage,
		CreatedAt:    page.CreatedAt,
		UpdatedAt:    page.UpdatedAt,
	}
}

func pageResponses(pages []*domain.DeepWikiPage) []*PageResponse {
	out := make([]*PageResponse, len(pages))
	for i, page := range pages {
		out[i] = pageResponse(page)
	}
	return out
}
