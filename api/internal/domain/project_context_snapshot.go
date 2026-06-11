package domain

import "time"

// SpecForgeProjectContextSnapshot stores one normalized project context snapshot.
type SpecForgeProjectContextSnapshot struct {
	ID                  uint                                         `json:"id"`
	WorkspaceID         string                                       `json:"workspace_id"`
	ProjectID           uint                                         `json:"project_id"`
	SnapshotStatus      string                                       `json:"snapshot_status"`
	Summary             string                                       `json:"summary"`
	PrimaryRepositoryID string                                       `json:"primary_repository_id,omitempty"`
	WarningCount        int                                          `json:"warning_count"`
	MissingEvidence     []string                                     `json:"missing_evidence,omitempty"`
	EvidenceRefs        []string                                     `json:"evidence_refs,omitempty"`
	Repositories        []*SpecForgeProjectContextSnapshotRepository `json:"repositories,omitempty"`
	Readiness           *SpecForgeProjectContextReadiness            `json:"readiness,omitempty"`
	ContextContract     *SpecForgeProjectContextContract             `json:"context_contract,omitempty"`
	CreatedBy           uint                                         `json:"created_by"`
	CreatedAt           time.Time                                    `json:"created_at"`
	UpdatedAt           time.Time                                    `json:"updated_at"`
}

// SpecForgeProjectContextSnapshotRepository stores normalized evidence for one bound repository.
type SpecForgeProjectContextSnapshotRepository struct {
	RepositoryID               string                                  `json:"repository_id"`
	Role                       string                                  `json:"role"`
	Writable                   bool                                    `json:"writable"`
	ProfileSummary             string                                  `json:"profile_summary,omitempty"`
	ProfileSource              string                                  `json:"profile_source,omitempty"`
	ArchitectureSummary        string                                  `json:"architecture_summary,omitempty"`
	ArchitectureSnapshotCommit string                                  `json:"architecture_snapshot_commit,omitempty"`
	ArchitectureStale          bool                                    `json:"architecture_stale"`
	SkillNames                 []string                                `json:"skill_names,omitempty"`
	Warnings                   []string                                `json:"warnings,omitempty"`
	WarningCount               int                                     `json:"warning_count"`
	MissingEvidence            []string                                `json:"missing_evidence,omitempty"`
	DeepWiki                   *SpecForgeProjectContextDeepWikiSummary `json:"deepwiki,omitempty"`
}

// SpecForgeProjectContextDeepWikiSummary is the compact DeepWiki view injected into project context snapshots.
type SpecForgeProjectContextDeepWikiSummary struct {
	SourceID      uint       `json:"source_id"`
	IndexID       uint       `json:"index_id"`
	SourceType    string     `json:"source_type,omitempty"`
	SourceStatus  string     `json:"source_status,omitempty"`
	IndexStatus   string     `json:"index_status,omitempty"`
	RepoURL       string     `json:"repo_url,omitempty"`
	MatchedBy     string     `json:"matched_by,omitempty"`
	LastIndexedAt *time.Time `json:"last_indexed_at,omitempty"`
	FileCount     int        `json:"file_count"`
	ChunkCount    int        `json:"chunk_count"`
	PageCount     int        `json:"page_count"`
	Frameworks    []string   `json:"frameworks,omitempty"`
	Entrypoints   []string   `json:"entrypoints,omitempty"`
	Routes        []string   `json:"routes,omitempty"`
	Services      []string   `json:"services,omitempty"`
	Models        []string   `json:"models,omitempty"`
	TopPages      []string   `json:"top_pages,omitempty"`
	Warnings      []string   `json:"warnings,omitempty"`
}
