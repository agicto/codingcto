package repocontext

import (
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type RepoProfilePO struct {
	ID                uint   `gorm:"primaryKey"`
	RepositoryID      string `gorm:"size:255;not null;uniqueIndex"`
	DefaultBranch     string `gorm:"size:100;not null"`
	Stack             string `gorm:"type:text"`
	TestCommands      string `gorm:"type:text"`
	CIProvider        string `gorm:"column:ci_provider;size:100;not null"`
	AppStructure      string `gorm:"type:text"`
	CodingConventions string `gorm:"type:text"`
	RiskAreas         string `gorm:"type:text"`
	Summary           string `gorm:"type:text"`
	Source            string `gorm:"size:100;not null;default:manual"`
	Warnings          string `gorm:"type:text"`
	CreatedBy         uint   `gorm:"not null;index"`
	LastIndexedAt     time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (RepoProfilePO) TableName() string {
	return "specforge_repo_profiles"
}

type RepoArchitectureSnapshotPO struct {
	ID           uint   `gorm:"primaryKey"`
	RepositoryID string `gorm:"size:255;not null;index"`
	CommitSHA    string `gorm:"size:100;not null;index"`
	Stack        string `gorm:"type:text"`
	Modules      string `gorm:"type:text"`
	Entrypoints  string `gorm:"type:text"`
	TestCommands string `gorm:"type:text"`
	CIWorkflows  string `gorm:"type:text"`
	RiskAreas    string `gorm:"type:text"`
	Summary      string `gorm:"type:text"`
	GeneratedBy  string `gorm:"size:100;not null;default:repo_context_service"`
	Warnings     string `gorm:"type:text"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (RepoArchitectureSnapshotPO) TableName() string {
	return "specforge_repo_architecture_snapshots"
}

func newRepoProfilePO(profile *domain.SpecForgeRepoProfile) *RepoProfilePO {
	return &RepoProfilePO{
		ID:                profile.ID,
		RepositoryID:      profile.RepositoryID,
		DefaultBranch:     profile.DefaultBranch,
		Stack:             encodeStrings(profile.Stack),
		TestCommands:      encodeStrings(profile.TestCommands),
		CIProvider:        profile.CIProvider,
		AppStructure:      encodeStrings(profile.AppStructure),
		CodingConventions: encodeStrings(profile.CodingConventions),
		RiskAreas:         encodeStrings(profile.RiskAreas),
		Summary:           profile.Summary,
		Source:            profile.Source,
		Warnings:          encodeStrings(profile.Warnings),
		CreatedBy:         profile.CreatedBy,
		LastIndexedAt:     profile.LastIndexedAt,
		CreatedAt:         profile.CreatedAt,
		UpdatedAt:         profile.UpdatedAt,
	}
}

func newRepoArchitectureSnapshotPO(snapshot *domain.SpecForgeRepoArchitectureSnapshot) *RepoArchitectureSnapshotPO {
	return &RepoArchitectureSnapshotPO{
		ID:           snapshot.ID,
		RepositoryID: snapshot.RepositoryID,
		CommitSHA:    snapshot.CommitSHA,
		Stack:        encodeStrings(snapshot.Stack),
		Modules:      encodeStrings(snapshot.Modules),
		Entrypoints:  encodeStrings(snapshot.Entrypoints),
		TestCommands: encodeStrings(snapshot.TestCommands),
		CIWorkflows:  encodeStrings(snapshot.CIWorkflows),
		RiskAreas:    encodeStrings(snapshot.RiskAreas),
		Summary:      snapshot.Summary,
		GeneratedBy:  snapshot.GeneratedBy,
		Warnings:     encodeStrings(snapshot.Warnings),
		CreatedBy:    snapshot.CreatedBy,
		CreatedAt:    snapshot.CreatedAt,
		UpdatedAt:    snapshot.UpdatedAt,
	}
}

func (po *RepoArchitectureSnapshotPO) toDomain() *domain.SpecForgeRepoArchitectureSnapshot {
	return &domain.SpecForgeRepoArchitectureSnapshot{
		ID:           po.ID,
		RepositoryID: po.RepositoryID,
		CommitSHA:    po.CommitSHA,
		Stack:        decodeStrings(po.Stack),
		Modules:      decodeStrings(po.Modules),
		Entrypoints:  decodeStrings(po.Entrypoints),
		TestCommands: decodeStrings(po.TestCommands),
		CIWorkflows:  decodeStrings(po.CIWorkflows),
		RiskAreas:    decodeStrings(po.RiskAreas),
		Summary:      po.Summary,
		GeneratedBy:  po.GeneratedBy,
		Warnings:     decodeStrings(po.Warnings),
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
	}
}

func (po *RepoProfilePO) toDomain() *domain.SpecForgeRepoProfile {
	return &domain.SpecForgeRepoProfile{
		ID:                po.ID,
		RepositoryID:      po.RepositoryID,
		DefaultBranch:     po.DefaultBranch,
		Stack:             decodeStrings(po.Stack),
		TestCommands:      decodeStrings(po.TestCommands),
		CIProvider:        po.CIProvider,
		AppStructure:      decodeStrings(po.AppStructure),
		CodingConventions: decodeStrings(po.CodingConventions),
		RiskAreas:         decodeStrings(po.RiskAreas),
		Summary:           po.Summary,
		Source:            po.Source,
		Warnings:          decodeStrings(po.Warnings),
		CreatedBy:         po.CreatedBy,
		LastIndexedAt:     po.LastIndexedAt,
		CreatedAt:         po.CreatedAt,
		UpdatedAt:         po.UpdatedAt,
	}
}

func encodeStrings(values []string) string {
	if values == nil {
		values = []string{}
	}
	b, _ := json.Marshal(values)
	return string(b)
}

func decodeStrings(value string) []string {
	if value == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(value), &out); err != nil {
		return []string{}
	}
	return out
}
