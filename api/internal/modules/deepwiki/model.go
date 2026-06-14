package deepwiki

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type SourcePO struct {
	ID            uint   `gorm:"primaryKey"`
	CreatedBy     uint   `gorm:"not null;index"`
	WorkspaceID   string `gorm:"size:255;index"`
	ProjectID     uint   `gorm:"index"`
	RepositoryID  string `gorm:"size:255;index:idx_deepwiki_source_repository"`
	SourceType    string `gorm:"size:30;not null;index"`
	RepoURL       string `gorm:"size:1000"`
	LocalPath     string `gorm:"size:1000"`
	Branch        string `gorm:"size:120"`
	GitHubOwner   string `gorm:"size:255"`
	GitHubRepo    string `gorm:"size:255"`
	DefaultBranch string `gorm:"size:120"`
	PATSecretRef  string `gorm:"size:255"`
	EncryptedPAT  string `gorm:"type:text"`
	Status        string `gorm:"size:50;not null;index"`
	LastIndexedAt *time.Time
	LastFailure   string `gorm:"size:80"`
	LastError     string `gorm:"type:text"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (SourcePO) TableName() string {
	return "deepwiki_sources"
}

type IndexPO struct {
	ID                  uint   `gorm:"primaryKey"`
	SourceID            uint   `gorm:"not null;index"`
	CommitSHA           string `gorm:"size:100;index"`
	FileCount           int    `gorm:"not null;default:0"`
	ChunkCount          int    `gorm:"not null;default:0"`
	LanguageSummaryJSON string `gorm:"column:language_summary_json;type:text"`
	FileTreeJSON        string `gorm:"column:file_tree_json;type:text"`
	EntrypointsJSON     string `gorm:"column:entrypoints_json;type:text"`
	RoutesJSON          string `gorm:"column:routes_json;type:text"`
	ServicesJSON        string `gorm:"column:services_json;type:text"`
	ModelsJSON          string `gorm:"column:models_json;type:text"`
	ConfigsJSON         string `gorm:"column:configs_json;type:text"`
	FrameworksJSON      string `gorm:"column:frameworks_json;type:text"`
	PackageManager      string `gorm:"size:80"`
	GenerationMode      string `gorm:"size:40;index"`
	GeneratorProvider   string `gorm:"size:80"`
	GeneratorModel      string `gorm:"size:120"`
	PromptVersion       string `gorm:"size:80"`
	Status              string `gorm:"size:50;not null;index"`
	ErrorMessage        string `gorm:"type:text"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (IndexPO) TableName() string {
	return "deepwiki_indexes"
}

type ChunkPO struct {
	ID            uint   `gorm:"primaryKey"`
	IndexID       uint   `gorm:"not null;index"`
	FilePath      string `gorm:"size:1000;not null;index"`
	Language      string `gorm:"size:80;not null;index"`
	SymbolName    string `gorm:"size:255"`
	StartLine     int    `gorm:"not null"`
	EndLine       int    `gorm:"not null"`
	Content       string `gorm:"type:text;not null"`
	ContentHash   string `gorm:"size:64;not null;index"`
	EmbeddingJSON string `gorm:"column:embedding_json;type:text"`
	KeywordText   string `gorm:"type:text"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (ChunkPO) TableName() string {
	return "deepwiki_chunks"
}

type PagePO struct {
	ID             uint   `gorm:"primaryKey"`
	IndexID        uint   `gorm:"not null;uniqueIndex:idx_deepwiki_page_index_slug;index"`
	Slug           string `gorm:"size:160;not null;uniqueIndex:idx_deepwiki_page_index_slug"`
	Title          string `gorm:"size:255;not null"`
	PageType       string `gorm:"size:80;not null;index"`
	Markdown       string `gorm:"type:text;not null"`
	HTML           string `gorm:"type:text"`
	Mermaid        string `gorm:"type:text"`
	SourceRefsJSON string `gorm:"column:source_refs_json;type:text"`
	OrderIndex     int    `gorm:"not null;default:0;index"`
	Status         string `gorm:"size:50;not null;index"`
	ErrorMessage   string `gorm:"type:text"`
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (PagePO) TableName() string {
	return "deepwiki_pages"
}

func newSourcePO(source *domain.DeepWikiSource) *SourcePO {
	return &SourcePO{
		ID:            source.ID,
		CreatedBy:     source.CreatedBy,
		WorkspaceID:   source.WorkspaceID,
		ProjectID:     source.ProjectID,
		RepositoryID:  source.RepositoryID,
		SourceType:    source.SourceType,
		RepoURL:       source.RepoURL,
		LocalPath:     source.LocalPath,
		Branch:        source.Branch,
		GitHubOwner:   source.GitHubOwner,
		GitHubRepo:    source.GitHubRepo,
		DefaultBranch: source.DefaultBranch,
		PATSecretRef:  source.PATSecretRef,
		EncryptedPAT:  source.EncryptedPAT,
		Status:        source.Status,
		LastIndexedAt: source.LastIndexedAt,
		LastFailure:   source.LastFailure,
		LastError:     source.LastError,
		CreatedAt:     source.CreatedAt,
		UpdatedAt:     source.UpdatedAt,
	}
}

func (po *SourcePO) toDomain() *domain.DeepWikiSource {
	return &domain.DeepWikiSource{
		ID:            po.ID,
		CreatedBy:     po.CreatedBy,
		WorkspaceID:   po.WorkspaceID,
		ProjectID:     po.ProjectID,
		RepositoryID:  po.RepositoryID,
		SourceType:    po.SourceType,
		RepoURL:       po.RepoURL,
		LocalPath:     po.LocalPath,
		Branch:        po.Branch,
		GitHubOwner:   po.GitHubOwner,
		GitHubRepo:    po.GitHubRepo,
		DefaultBranch: po.DefaultBranch,
		PATSecretRef:  po.PATSecretRef,
		EncryptedPAT:  po.EncryptedPAT,
		Status:        po.Status,
		LastIndexedAt: po.LastIndexedAt,
		LastFailure:   po.LastFailure,
		LastError:     po.LastError,
		CreatedAt:     po.CreatedAt,
		UpdatedAt:     po.UpdatedAt,
	}
}

func newIndexPO(index *domain.DeepWikiIndex) *IndexPO {
	return &IndexPO{
		ID:                  index.ID,
		SourceID:            index.SourceID,
		CommitSHA:           index.CommitSHA,
		FileCount:           index.FileCount,
		ChunkCount:          index.ChunkCount,
		LanguageSummaryJSON: encodeJSON(index.LanguageSummary),
		FileTreeJSON:        encodeJSON(index.FileTree),
		EntrypointsJSON:     encodeJSON(index.Entrypoints),
		RoutesJSON:          encodeJSON(index.Routes),
		ServicesJSON:        encodeJSON(index.Services),
		ModelsJSON:          encodeJSON(index.Models),
		ConfigsJSON:         encodeJSON(index.Configs),
		FrameworksJSON:      encodeJSON(index.Frameworks),
		PackageManager:      index.PackageManager,
		GenerationMode:      index.GenerationMode,
		GeneratorProvider:   index.GeneratorProvider,
		GeneratorModel:      index.GeneratorModel,
		PromptVersion:       index.PromptVersion,
		Status:              index.Status,
		ErrorMessage:        index.ErrorMessage,
		CreatedAt:           index.CreatedAt,
		UpdatedAt:           index.UpdatedAt,
	}
}

func (po *IndexPO) toDomain() *domain.DeepWikiIndex {
	return &domain.DeepWikiIndex{
		ID:                po.ID,
		SourceID:          po.SourceID,
		CommitSHA:         po.CommitSHA,
		FileCount:         po.FileCount,
		ChunkCount:        po.ChunkCount,
		LanguageSummary:   decodeMapInt(po.LanguageSummaryJSON),
		FileTree:          decodeStrings(po.FileTreeJSON),
		Entrypoints:       decodeStrings(po.EntrypointsJSON),
		Routes:            decodeStrings(po.RoutesJSON),
		Services:          decodeStrings(po.ServicesJSON),
		Models:            decodeStrings(po.ModelsJSON),
		Configs:           decodeStrings(po.ConfigsJSON),
		Frameworks:        decodeStrings(po.FrameworksJSON),
		PackageManager:    po.PackageManager,
		GenerationMode:    po.GenerationMode,
		GeneratorProvider: po.GeneratorProvider,
		GeneratorModel:    po.GeneratorModel,
		PromptVersion:     po.PromptVersion,
		Status:            po.Status,
		ErrorMessage:      po.ErrorMessage,
		CreatedAt:         po.CreatedAt,
		UpdatedAt:         po.UpdatedAt,
	}
}

func newChunkPO(chunk *domain.DeepWikiChunk) *ChunkPO {
	return &ChunkPO{
		ID:            chunk.ID,
		IndexID:       chunk.IndexID,
		FilePath:      chunk.FilePath,
		Language:      chunk.Language,
		SymbolName:    chunk.SymbolName,
		StartLine:     chunk.StartLine,
		EndLine:       chunk.EndLine,
		Content:       chunk.Content,
		ContentHash:   chunk.ContentHash,
		EmbeddingJSON: encodeJSON(chunk.Embedding),
		KeywordText:   chunk.KeywordText,
		CreatedAt:     chunk.CreatedAt,
		UpdatedAt:     chunk.UpdatedAt,
	}
}

func (po *ChunkPO) toDomain() *domain.DeepWikiChunk {
	return &domain.DeepWikiChunk{
		ID:          po.ID,
		IndexID:     po.IndexID,
		FilePath:    po.FilePath,
		Language:    po.Language,
		SymbolName:  po.SymbolName,
		StartLine:   po.StartLine,
		EndLine:     po.EndLine,
		Content:     po.Content,
		ContentHash: po.ContentHash,
		Embedding:   decodeFloat64s(po.EmbeddingJSON),
		KeywordText: po.KeywordText,
		CreatedAt:   po.CreatedAt,
		UpdatedAt:   po.UpdatedAt,
	}
}

func newPagePO(page *domain.DeepWikiPage) *PagePO {
	return &PagePO{
		ID:             page.ID,
		IndexID:        page.IndexID,
		Slug:           page.Slug,
		Title:          page.Title,
		PageType:       page.PageType,
		Markdown:       page.Markdown,
		HTML:           page.HTML,
		Mermaid:        page.Mermaid,
		SourceRefsJSON: encodeJSON(page.SourceRefs),
		OrderIndex:     page.OrderIndex,
		Status:         page.Status,
		ErrorMessage:   page.ErrorMessage,
		CreatedAt:      page.CreatedAt,
		UpdatedAt:      page.UpdatedAt,
	}
}

func (po *PagePO) toDomain() *domain.DeepWikiPage {
	return &domain.DeepWikiPage{
		ID:           po.ID,
		IndexID:      po.IndexID,
		Slug:         po.Slug,
		Title:        po.Title,
		PageType:     po.PageType,
		Markdown:     po.Markdown,
		HTML:         po.HTML,
		Mermaid:      po.Mermaid,
		SourceRefs:   decodeSourceRefs(po.SourceRefsJSON),
		OrderIndex:   po.OrderIndex,
		Status:       po.Status,
		ErrorMessage: po.ErrorMessage,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
	}
}

func encodeJSON(value any) string {
	if value == nil {
		value = []string{}
	}
	b, err := json.Marshal(value)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func decodeStrings(value string) []string {
	out := []string{}
	if value == "" {
		return out
	}
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []string{}
	}
	return out
}

func decodeMapInt(value string) map[string]int {
	out := map[string]int{}
	if value == "" {
		return out
	}
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return map[string]int{}
	}
	return out
}

func decodeFloat64s(value string) []float64 {
	out := []float64{}
	if value == "" {
		return out
	}
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []float64{}
	}
	return out
}

func decodeSourceRefs(value string) []domain.DeepWikiSourceRef {
	out := []domain.DeepWikiSourceRef{}
	if value == "" {
		return out
	}
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []domain.DeepWikiSourceRef{}
	}
	return out
}
