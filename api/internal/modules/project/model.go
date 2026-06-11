package project

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type ProjectPO struct {
	ID          uint   `gorm:"primaryKey"`
	WorkspaceID string `gorm:"size:255;not null;uniqueIndex:idx_specforge_project_workspace_slug;index"`
	Name        string `gorm:"size:120;not null"`
	Slug        string `gorm:"size:100;not null;uniqueIndex:idx_specforge_project_workspace_slug"`
	Description string `gorm:"type:text"`
	Status      string `gorm:"size:30;not null;default:'active';index"`
	CreatedBy   uint   `gorm:"not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (ProjectPO) TableName() string {
	return "specforge_projects"
}

type ProjectRepositoryPO struct {
	ID           uint   `gorm:"primaryKey"`
	WorkspaceID  string `gorm:"size:255;not null;index"`
	ProjectID    uint   `gorm:"not null;uniqueIndex:idx_specforge_project_repository;index"`
	RepositoryID string `gorm:"size:255;not null;uniqueIndex:idx_specforge_project_repository;index"`
	Role         string `gorm:"size:30;not null;index"`
	Active       bool   `gorm:"not null;default:true;index"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (ProjectRepositoryPO) TableName() string {
	return "specforge_project_repositories"
}

type ProjectContextSnapshotPO struct {
	ID                  uint   `gorm:"primaryKey"`
	WorkspaceID         string `gorm:"size:255;not null;index"`
	ProjectID           uint   `gorm:"not null;index"`
	SnapshotStatus      string `gorm:"size:30;not null;default:'attention';index"`
	Summary             string `gorm:"type:text"`
	PrimaryRepositoryID string `gorm:"size:255;index"`
	WarningCount        int    `gorm:"not null;default:0"`
	MissingEvidenceJSON string `gorm:"column:missing_evidence_json;type:text"`
	EvidenceRefsJSON    string `gorm:"column:evidence_refs_json;type:text"`
	RepositoriesJSON    string `gorm:"column:repositories_json;type:text"`
	ReadinessJSON       string `gorm:"column:readiness_json;type:text"`
	ContextContractJSON string `gorm:"column:context_contract_json;type:text"`
	CreatedBy           uint   `gorm:"not null;index"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (ProjectContextSnapshotPO) TableName() string {
	return "specforge_project_context_snapshots"
}

func newProjectContextSnapshotPO(snapshot *domain.SpecForgeProjectContextSnapshot) *ProjectContextSnapshotPO {
	if snapshot == nil {
		return &ProjectContextSnapshotPO{}
	}
	return &ProjectContextSnapshotPO{
		ID:                  snapshot.ID,
		WorkspaceID:         snapshot.WorkspaceID,
		ProjectID:           snapshot.ProjectID,
		SnapshotStatus:      snapshot.SnapshotStatus,
		Summary:             snapshot.Summary,
		PrimaryRepositoryID: snapshot.PrimaryRepositoryID,
		WarningCount:        snapshot.WarningCount,
		MissingEvidenceJSON: encodeProjectSnapshotJSON(snapshot.MissingEvidence),
		EvidenceRefsJSON:    encodeProjectSnapshotJSON(snapshot.EvidenceRefs),
		RepositoriesJSON:    encodeProjectSnapshotJSON(snapshot.Repositories),
		ReadinessJSON:       encodeProjectSnapshotJSON(snapshot.Readiness),
		ContextContractJSON: encodeProjectSnapshotJSON(snapshot.ContextContract),
		CreatedBy:           snapshot.CreatedBy,
		CreatedAt:           snapshot.CreatedAt,
		UpdatedAt:           snapshot.UpdatedAt,
	}
}

func (po *ProjectContextSnapshotPO) toDomain() *domain.SpecForgeProjectContextSnapshot {
	if po == nil {
		return nil
	}
	return &domain.SpecForgeProjectContextSnapshot{
		ID:                  po.ID,
		WorkspaceID:         po.WorkspaceID,
		ProjectID:           po.ProjectID,
		SnapshotStatus:      po.SnapshotStatus,
		Summary:             po.Summary,
		PrimaryRepositoryID: po.PrimaryRepositoryID,
		WarningCount:        po.WarningCount,
		MissingEvidence:     decodeProjectSnapshotStrings(po.MissingEvidenceJSON),
		EvidenceRefs:        decodeProjectSnapshotStrings(po.EvidenceRefsJSON),
		Repositories:        decodeProjectSnapshotRepositories(po.RepositoriesJSON),
		Readiness:           decodeProjectSnapshotReadiness(po.ReadinessJSON),
		ContextContract:     decodeProjectSnapshotContract(po.ContextContractJSON),
		CreatedBy:           po.CreatedBy,
		CreatedAt:           po.CreatedAt,
		UpdatedAt:           po.UpdatedAt,
	}
}

func encodeProjectSnapshotJSON(value any) string {
	if value == nil {
		value = []string{}
	}
	b, _ := json.Marshal(value)
	return string(b)
}

func decodeProjectSnapshotStrings(value string) []string {
	if value == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []string{}
	}
	return out
}

func decodeProjectSnapshotRepositories(value string) []*domain.SpecForgeProjectContextSnapshotRepository {
	if value == "" {
		return []*domain.SpecForgeProjectContextSnapshotRepository{}
	}
	var out []*domain.SpecForgeProjectContextSnapshotRepository
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []*domain.SpecForgeProjectContextSnapshotRepository{}
	}
	return out
}

func decodeProjectSnapshotReadiness(value string) *domain.SpecForgeProjectContextReadiness {
	if value == "" {
		return nil
	}
	var out domain.SpecForgeProjectContextReadiness
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return nil
	}
	return &out
}

func decodeProjectSnapshotContract(value string) *domain.SpecForgeProjectContextContract {
	if value == "" {
		return nil
	}
	var out domain.SpecForgeProjectContextContract
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return nil
	}
	return &out
}
