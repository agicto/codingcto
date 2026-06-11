package domain

import (
	"context"
	"time"
)

const (
	DeepWikiSourceTypeGitHubURL = "github_url"
	DeepWikiSourceTypeLocalPath = "local_path"

	DeepWikiStatusQueued     = "queued"
	DeepWikiStatusReading    = "reading"
	DeepWikiStatusFiltering  = "filtering"
	DeepWikiStatusAnalyzing  = "analyzing"
	DeepWikiStatusIndexing   = "indexing"
	DeepWikiStatusPlanning   = "planning"
	DeepWikiStatusGenerating = "generating"
	DeepWikiStatusReady      = "ready"
	DeepWikiStatusFailed     = "failed"

	DeepWikiFailureRead     = "failed_read"
	DeepWikiFailureFilter   = "failed_filter"
	DeepWikiFailureAnalyze  = "failed_analyze"
	DeepWikiFailureIndex    = "failed_index"
	DeepWikiFailurePlan     = "failed_plan"
	DeepWikiFailureGenerate = "failed_generate"
)

// DeepWikiSource stores the user supplied repository source.
type DeepWikiSource struct {
	ID            uint       `json:"id"`
	CreatedBy     uint       `json:"created_by"`
	SourceType    string     `json:"source_type"`
	RepoURL       string     `json:"repo_url,omitempty"`
	LocalPath     string     `json:"local_path,omitempty"`
	Branch        string     `json:"branch,omitempty"`
	PATSecretRef  string     `json:"pat_secret_ref,omitempty"`
	EncryptedPAT  string     `json:"-"`
	Status        string     `json:"status"`
	LastIndexedAt *time.Time `json:"last_indexed_at,omitempty"`
	LastFailure   string     `json:"last_failure,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// DeepWikiIndex stores one immutable-ish indexing result for a source.
type DeepWikiIndex struct {
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

// DeepWikiChunk stores a searchable code or document chunk.
type DeepWikiChunk struct {
	ID          uint      `json:"id"`
	IndexID     uint      `json:"index_id"`
	FilePath    string    `json:"file_path"`
	Language    string    `json:"language"`
	SymbolName  string    `json:"symbol_name,omitempty"`
	StartLine   int       `json:"start_line"`
	EndLine     int       `json:"end_line"`
	Content     string    `json:"content"`
	ContentHash string    `json:"content_hash"`
	Embedding   []float64 `json:"embedding,omitempty"`
	KeywordText string    `json:"keyword_text"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// DeepWikiPage stores a generated wiki page and source evidence.
type DeepWikiPage struct {
	ID           uint                `json:"id"`
	IndexID      uint                `json:"index_id"`
	Slug         string              `json:"slug"`
	Title        string              `json:"title"`
	PageType     string              `json:"page_type"`
	Markdown     string              `json:"markdown"`
	HTML         string              `json:"html,omitempty"`
	Mermaid      string              `json:"mermaid,omitempty"`
	SourceRefs   []DeepWikiSourceRef `json:"source_refs"`
	OrderIndex   int                 `json:"order_index"`
	Status       string              `json:"status"`
	ErrorMessage string              `json:"error_message,omitempty"`
	CreatedAt    time.Time           `json:"created_at"`
	UpdatedAt    time.Time           `json:"updated_at"`
}

// DeepWikiSourceRef points to repository-relative code evidence.
type DeepWikiSourceRef struct {
	Path      string `json:"path"`
	StartLine int    `json:"start_line"`
	EndLine   int    `json:"end_line"`
}

type DeepWikiSourceFilter struct {
	CreatedBy  uint
	SourceType string
	Status     string
}

type DeepWikiSearchResult struct {
	Kind       string              `json:"kind"`
	ID         uint                `json:"id"`
	Title      string              `json:"title"`
	FilePath   string              `json:"file_path,omitempty"`
	Slug       string              `json:"slug,omitempty"`
	Language   string              `json:"language,omitempty"`
	StartLine  int                 `json:"start_line,omitempty"`
	EndLine    int                 `json:"end_line,omitempty"`
	Snippet    string              `json:"snippet"`
	SourceRefs []DeepWikiSourceRef `json:"source_refs,omitempty"`
}

type DeepWikiRepository interface {
	CreateSource(ctx context.Context, source *DeepWikiSource) error
	UpdateSource(ctx context.Context, source *DeepWikiSource) error
	FindSourceByID(ctx context.Context, id uint) (*DeepWikiSource, error)
	ListSources(ctx context.Context, filter DeepWikiSourceFilter, page, pageSize int) ([]*DeepWikiSource, int64, error)

	CreateIndex(ctx context.Context, index *DeepWikiIndex) error
	UpdateIndex(ctx context.Context, index *DeepWikiIndex) error
	FindIndexByID(ctx context.Context, id uint) (*DeepWikiIndex, error)
	FindLatestIndexBySourceID(ctx context.Context, sourceID uint) (*DeepWikiIndex, error)

	CreateChunks(ctx context.Context, chunks []*DeepWikiChunk) error
	ListChunksByIndexID(ctx context.Context, indexID uint) ([]*DeepWikiChunk, error)
	SearchChunks(ctx context.Context, indexID uint, query string, limit int) ([]*DeepWikiChunk, error)

	CreatePages(ctx context.Context, pages []*DeepWikiPage) error
	ListPagesByIndexID(ctx context.Context, indexID uint) ([]*DeepWikiPage, error)
	FindPageByID(ctx context.Context, id uint) (*DeepWikiPage, error)
	FindPageByIndexAndSlug(ctx context.Context, indexID uint, slug string) (*DeepWikiPage, error)
	SearchPages(ctx context.Context, indexID uint, query string, limit int) ([]*DeepWikiPage, error)
}
