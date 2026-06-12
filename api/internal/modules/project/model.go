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

type ProjectExpertPolicyPO struct {
	ID                       uint   `gorm:"primaryKey"`
	WorkspaceID              string `gorm:"size:255;not null;index"`
	ProjectID                uint   `gorm:"not null;index"`
	Version                  int    `gorm:"not null;default:1"`
	Active                   bool   `gorm:"not null;default:true;index"`
	GoalBoundary             string `gorm:"type:text"`
	AllowedPathsJSON         string `gorm:"column:allowed_paths_json;type:text"`
	ForbiddenPathsJSON       string `gorm:"column:forbidden_paths_json;type:text"`
	RequiredTestCommandsJSON string `gorm:"column:required_test_commands_json;type:text"`
	ReviewPolicyJSON         string `gorm:"column:review_policy_json;type:text"`
	MergePolicyJSON          string `gorm:"column:merge_policy_json;type:text"`
	CreatedBy                uint   `gorm:"not null;index"`
	CreatedAt                time.Time
	UpdatedAt                time.Time
}

func (ProjectExpertPolicyPO) TableName() string {
	return "specforge_project_expert_policies"
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

func newProjectExpertPolicyPO(policy *domain.SpecForgeProjectExpertPolicy) *ProjectExpertPolicyPO {
	if policy == nil {
		return &ProjectExpertPolicyPO{}
	}
	return &ProjectExpertPolicyPO{
		ID:                       policy.ID,
		WorkspaceID:              policy.WorkspaceID,
		ProjectID:                policy.ProjectID,
		Version:                  policy.Version,
		Active:                   policy.Active,
		GoalBoundary:             policy.GoalBoundary,
		AllowedPathsJSON:         encodeProjectSnapshotJSON(policy.AllowedPaths),
		ForbiddenPathsJSON:       encodeProjectSnapshotJSON(policy.ForbiddenPaths),
		RequiredTestCommandsJSON: encodeProjectSnapshotJSON(policy.RequiredTestCommands),
		ReviewPolicyJSON:         encodeProjectSnapshotJSON(policy.ReviewPolicy),
		MergePolicyJSON:          encodeProjectSnapshotJSON(policy.MergePolicy),
		CreatedBy:                policy.CreatedBy,
		CreatedAt:                policy.CreatedAt,
		UpdatedAt:                policy.UpdatedAt,
	}
}

func (po *ProjectExpertPolicyPO) toDomain() *domain.SpecForgeProjectExpertPolicy {
	if po == nil {
		return nil
	}
	return &domain.SpecForgeProjectExpertPolicy{
		ID:                   po.ID,
		WorkspaceID:          po.WorkspaceID,
		ProjectID:            po.ProjectID,
		Version:              po.Version,
		Active:               po.Active,
		GoalBoundary:         po.GoalBoundary,
		AllowedPaths:         decodeProjectSnapshotStrings(po.AllowedPathsJSON),
		ForbiddenPaths:       decodeProjectSnapshotStrings(po.ForbiddenPathsJSON),
		RequiredTestCommands: decodeProjectSnapshotStrings(po.RequiredTestCommandsJSON),
		ReviewPolicy:         decodeProjectExpertReviewPolicy(po.ReviewPolicyJSON),
		MergePolicy:          decodeProjectExpertMergePolicy(po.MergePolicyJSON),
		CreatedBy:            po.CreatedBy,
		CreatedAt:            po.CreatedAt,
		UpdatedAt:            po.UpdatedAt,
	}
}

func decodeProjectExpertReviewPolicy(value string) domain.SpecForgeProjectExpertReviewPolicy {
	if value == "" {
		return domain.SpecForgeProjectExpertReviewPolicy{}
	}
	var out domain.SpecForgeProjectExpertReviewPolicy
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return domain.SpecForgeProjectExpertReviewPolicy{}
	}
	return out
}

func decodeProjectExpertMergePolicy(value string) domain.SpecForgeProjectExpertMergePolicy {
	if value == "" {
		return domain.SpecForgeProjectExpertMergePolicy{}
	}
	var out domain.SpecForgeProjectExpertMergePolicy
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return domain.SpecForgeProjectExpertMergePolicy{}
	}
	return out
}
