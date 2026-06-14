package expert

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type ExpertPO struct {
	ID              uint   `gorm:"primaryKey"`
	Key             string `gorm:"size:120;not null;uniqueIndex"`
	Name            string `gorm:"size:160;not null"`
	Role            string `gorm:"size:80;not null;index"`
	Description     string `gorm:"type:text"`
	SystemPrompt    string `gorm:"type:text;not null"`
	DefaultProvider string `gorm:"size:80;not null;default:'deepseek'"`
	DefaultModel    string `gorm:"size:120"`
	Active          bool   `gorm:"not null;default:true;index"`
	SortOrder       int    `gorm:"not null;default:0;index"`
	CreatedBy       uint   `gorm:"not null;index"`
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

func (ExpertPO) TableName() string { return "codingcto_experts" }

type ExpertSkillPO struct {
	ID               uint   `gorm:"primaryKey"`
	ExpertID         uint   `gorm:"not null;index"`
	WorkspaceID      string `gorm:"size:255;index"`
	ProjectID        *uint  `gorm:"index"`
	RepositoryID     string `gorm:"size:255;index"`
	Name             string `gorm:"size:160;not null;index"`
	Description      string `gorm:"type:text"`
	Active           bool   `gorm:"not null;default:true;index"`
	TargetAgents     string `gorm:"column:target_agents;type:text;not null;default:'[]'"`
	CurrentVersionID *uint  `gorm:"index"`
	CreatedBy        uint   `gorm:"not null;index"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Expert           *ExpertPO             `gorm:"foreignKey:ExpertID"`
	CurrentVersion   *ExpertSkillVersionPO `gorm:"foreignKey:CurrentVersionID"`
}

func (ExpertSkillPO) TableName() string { return "codingcto_expert_skills" }

type ExpertSkillVersionPO struct {
	ID            uint   `gorm:"primaryKey"`
	SkillID       uint   `gorm:"not null;index:idx_codingcto_skill_version,unique"`
	Version       int    `gorm:"not null;index:idx_codingcto_skill_version,unique"`
	Content       string `gorm:"type:text;not null"`
	ContentHash   string `gorm:"size:64;not null;index"`
	ChangeSummary string `gorm:"type:text"`
	Source        string `gorm:"size:60;not null;index"`
	CreatedBy     uint   `gorm:"not null;index"`
	PromotedBy    *uint
	PromotedAt    *time.Time
	CreatedAt     time.Time
}

func (ExpertSkillVersionPO) TableName() string { return "codingcto_expert_skill_versions" }

type ExpertRunPO struct {
	ID               uint   `gorm:"primaryKey"`
	ExpertID         uint   `gorm:"not null;index"`
	RequirementID    *uint  `gorm:"index"`
	PlanID           *uint  `gorm:"index"`
	RepositoryID     string `gorm:"size:255;index"`
	InputJSON        string `gorm:"type:text"`
	OutputJSON       string `gorm:"type:text"`
	Provider         string `gorm:"size:80;not null"`
	Model            string `gorm:"size:120"`
	Status           string `gorm:"size:50;not null;index"`
	SkillVersionRefs string `gorm:"type:text;not null;default:'[]'"`
	ErrorMessage     string `gorm:"type:text"`
	StartedAt        *time.Time
	CompletedAt      *time.Time
	CreatedBy        uint `gorm:"not null;index"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
	Expert           *ExpertPO `gorm:"foreignKey:ExpertID"`
}

func (ExpertRunPO) TableName() string { return "codingcto_expert_runs" }

type SkillEvolutionProposalPO struct {
	ID                  uint   `gorm:"primaryKey"`
	ExpertID            uint   `gorm:"not null;index"`
	SkillID             uint   `gorm:"not null;index"`
	BaseVersionID       uint   `gorm:"not null;index"`
	ProposedContent     string `gorm:"type:text;not null"`
	ProposedContentHash string `gorm:"size:64;not null;index"`
	Rationale           string `gorm:"type:text;not null"`
	EvalNotes           string `gorm:"type:text"`
	Status              string `gorm:"size:50;not null;index"`
	ReviewedBy          *uint
	ReviewedAt          *time.Time
	CreatedBy           uint `gorm:"not null;index"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

func (SkillEvolutionProposalPO) TableName() string {
	return "codingcto_skill_evolution_proposals"
}

func newExpertPO(expert *domain.CodingCTOExpert) *ExpertPO {
	return &ExpertPO{
		ID: expert.ID, Key: expert.Key, Name: expert.Name, Role: expert.Role, Description: expert.Description,
		SystemPrompt: expert.SystemPrompt, DefaultProvider: expert.DefaultProvider, DefaultModel: expert.DefaultModel,
		Active: expert.Active, SortOrder: expert.SortOrder, CreatedBy: expert.CreatedBy,
		CreatedAt: expert.CreatedAt, UpdatedAt: expert.UpdatedAt,
	}
}

func (po *ExpertPO) toDomain() *domain.CodingCTOExpert {
	return &domain.CodingCTOExpert{
		ID: po.ID, Key: po.Key, Name: po.Name, Role: po.Role, Description: po.Description,
		SystemPrompt: po.SystemPrompt, DefaultProvider: po.DefaultProvider, DefaultModel: po.DefaultModel,
		Active: po.Active, SortOrder: po.SortOrder, CreatedBy: po.CreatedBy,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func newExpertSkillPO(skill *domain.CodingCTOExpertSkill) *ExpertSkillPO {
	return &ExpertSkillPO{
		ID: skill.ID, ExpertID: skill.ExpertID, WorkspaceID: skill.WorkspaceID, ProjectID: skill.ProjectID,
		RepositoryID: skill.RepositoryID, Name: skill.Name, Description: skill.Description, Active: skill.Active,
		TargetAgents: encodeStrings(skill.TargetAgents), CurrentVersionID: skill.CurrentVersionID, CreatedBy: skill.CreatedBy,
		CreatedAt: skill.CreatedAt, UpdatedAt: skill.UpdatedAt,
	}
}

func (po *ExpertSkillPO) toDomain() *domain.CodingCTOExpertSkill {
	skill := &domain.CodingCTOExpertSkill{
		ID: po.ID, ExpertID: po.ExpertID, WorkspaceID: po.WorkspaceID, ProjectID: po.ProjectID,
		RepositoryID: po.RepositoryID, Name: po.Name, Description: po.Description, Active: po.Active,
		TargetAgents: decodeStrings(po.TargetAgents), CurrentVersionID: po.CurrentVersionID, CreatedBy: po.CreatedBy,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
	if po.Expert != nil {
		skill.Expert = po.Expert.toDomain()
	}
	if po.CurrentVersion != nil {
		skill.CurrentVersion = po.CurrentVersion.toDomain()
	}
	return skill
}

func newExpertSkillVersionPO(version *domain.CodingCTOExpertSkillVersion) *ExpertSkillVersionPO {
	return &ExpertSkillVersionPO{
		ID: version.ID, SkillID: version.SkillID, Version: version.Version, Content: version.Content,
		ContentHash: version.ContentHash, ChangeSummary: version.ChangeSummary, Source: version.Source,
		CreatedBy: version.CreatedBy, PromotedBy: version.PromotedBy, PromotedAt: version.PromotedAt,
		CreatedAt: version.CreatedAt,
	}
}

func (po *ExpertSkillVersionPO) toDomain() *domain.CodingCTOExpertSkillVersion {
	return &domain.CodingCTOExpertSkillVersion{
		ID: po.ID, SkillID: po.SkillID, Version: po.Version, Content: po.Content,
		ContentHash: po.ContentHash, ChangeSummary: po.ChangeSummary, Source: po.Source,
		CreatedBy: po.CreatedBy, PromotedBy: po.PromotedBy, PromotedAt: po.PromotedAt,
		CreatedAt: po.CreatedAt,
	}
}

func newExpertRunPO(run *domain.CodingCTOExpertRun) *ExpertRunPO {
	return &ExpertRunPO{
		ID: run.ID, ExpertID: run.ExpertID, RequirementID: run.RequirementID, PlanID: run.PlanID,
		RepositoryID: run.RepositoryID, InputJSON: run.InputJSON, OutputJSON: run.OutputJSON,
		Provider: run.Provider, Model: run.Model, Status: run.Status, SkillVersionRefs: encodeStrings(run.SkillVersionRefs),
		ErrorMessage: run.ErrorMessage, StartedAt: run.StartedAt, CompletedAt: run.CompletedAt, CreatedBy: run.CreatedBy,
		CreatedAt: run.CreatedAt, UpdatedAt: run.UpdatedAt,
	}
}

func (po *ExpertRunPO) toDomain() *domain.CodingCTOExpertRun {
	run := &domain.CodingCTOExpertRun{
		ID: po.ID, ExpertID: po.ExpertID, RequirementID: po.RequirementID, PlanID: po.PlanID,
		RepositoryID: po.RepositoryID, InputJSON: po.InputJSON, OutputJSON: po.OutputJSON,
		Provider: po.Provider, Model: po.Model, Status: po.Status, SkillVersionRefs: decodeStrings(po.SkillVersionRefs),
		ErrorMessage: po.ErrorMessage, StartedAt: po.StartedAt, CompletedAt: po.CompletedAt, CreatedBy: po.CreatedBy,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
	if po.Expert != nil {
		run.Expert = po.Expert.toDomain()
	}
	return run
}

func newSkillEvolutionProposalPO(proposal *domain.CodingCTOSkillEvolutionProposal) *SkillEvolutionProposalPO {
	return &SkillEvolutionProposalPO{
		ID: proposal.ID, ExpertID: proposal.ExpertID, SkillID: proposal.SkillID, BaseVersionID: proposal.BaseVersionID,
		ProposedContent: proposal.ProposedContent, ProposedContentHash: proposal.ProposedContentHash,
		Rationale: proposal.Rationale, EvalNotes: proposal.EvalNotes, Status: proposal.Status,
		ReviewedBy: proposal.ReviewedBy, ReviewedAt: proposal.ReviewedAt, CreatedBy: proposal.CreatedBy,
		CreatedAt: proposal.CreatedAt, UpdatedAt: proposal.UpdatedAt,
	}
}

func (po *SkillEvolutionProposalPO) toDomain() *domain.CodingCTOSkillEvolutionProposal {
	return &domain.CodingCTOSkillEvolutionProposal{
		ID: po.ID, ExpertID: po.ExpertID, SkillID: po.SkillID, BaseVersionID: po.BaseVersionID,
		ProposedContent: po.ProposedContent, ProposedContentHash: po.ProposedContentHash,
		Rationale: po.Rationale, EvalNotes: po.EvalNotes, Status: po.Status,
		ReviewedBy: po.ReviewedBy, ReviewedAt: po.ReviewedAt, CreatedBy: po.CreatedBy,
		CreatedAt: po.CreatedAt, UpdatedAt: po.UpdatedAt,
	}
}

func contentHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

func encodeStrings(values []string) string {
	if values == nil {
		values = []string{}
	}
	body, err := json.Marshal(values)
	if err != nil {
		return "[]"
	}
	return string(body)
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
