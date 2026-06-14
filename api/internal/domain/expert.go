package domain

import (
	"context"
	"time"
)

const (
	ExpertStatusActive   = "active"
	ExpertStatusInactive = "inactive"

	ExpertSkillProposalStatusDraft         = "draft"
	ExpertSkillProposalStatusPendingReview = "pending_review"
	ExpertSkillProposalStatusApproved      = "approved"
	ExpertSkillProposalStatusRejected      = "rejected"
	ExpertSkillProposalStatusPromoted      = "promoted"

	ExpertRunStatusCompleted = "completed"
	ExpertRunStatusFailed    = "failed"
)

type CodingCTOExpert struct {
	ID              uint      `json:"id"`
	Key             string    `json:"key"`
	Name            string    `json:"name"`
	Role            string    `json:"role"`
	Description     string    `json:"description"`
	SystemPrompt    string    `json:"system_prompt"`
	DefaultProvider string    `json:"default_provider"`
	DefaultModel    string    `json:"default_model"`
	Active          bool      `json:"active"`
	SortOrder       int       `json:"sort_order"`
	CreatedBy       uint      `json:"created_by"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type CodingCTOExpertSkill struct {
	ID               uint                         `json:"id"`
	ExpertID         uint                         `json:"expert_id"`
	WorkspaceID      string                       `json:"workspace_id,omitempty"`
	ProjectID        *uint                        `json:"project_id,omitempty"`
	RepositoryID     string                       `json:"repository_id,omitempty"`
	Name             string                       `json:"name"`
	Description      string                       `json:"description"`
	Active           bool                         `json:"active"`
	TargetAgents     []string                     `json:"target_agents,omitempty"`
	CurrentVersionID *uint                        `json:"current_version_id,omitempty"`
	CreatedBy        uint                         `json:"created_by"`
	CreatedAt        time.Time                    `json:"created_at"`
	UpdatedAt        time.Time                    `json:"updated_at"`
	Expert           *CodingCTOExpert             `json:"expert,omitempty"`
	CurrentVersion   *CodingCTOExpertSkillVersion `json:"current_version,omitempty"`
}

type CodingCTOExpertSkillVersion struct {
	ID            uint       `json:"id"`
	SkillID       uint       `json:"skill_id"`
	Version       int        `json:"version"`
	Content       string     `json:"content"`
	ContentHash   string     `json:"content_hash"`
	ChangeSummary string     `json:"change_summary"`
	Source        string     `json:"source"`
	CreatedBy     uint       `json:"created_by"`
	PromotedBy    *uint      `json:"promoted_by,omitempty"`
	PromotedAt    *time.Time `json:"promoted_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type CodingCTOExpertRun struct {
	ID               uint             `json:"id"`
	ExpertID         uint             `json:"expert_id"`
	RequirementID    *uint            `json:"requirement_id,omitempty"`
	PlanID           *uint            `json:"plan_id,omitempty"`
	RepositoryID     string           `json:"repository_id,omitempty"`
	InputJSON        string           `json:"input_json"`
	OutputJSON       string           `json:"output_json"`
	Provider         string           `json:"provider"`
	Model            string           `json:"model"`
	Status           string           `json:"status"`
	SkillVersionRefs []string         `json:"skill_version_refs,omitempty"`
	ErrorMessage     string           `json:"error_message,omitempty"`
	StartedAt        *time.Time       `json:"started_at,omitempty"`
	CompletedAt      *time.Time       `json:"completed_at,omitempty"`
	CreatedBy        uint             `json:"created_by"`
	CreatedAt        time.Time        `json:"created_at"`
	UpdatedAt        time.Time        `json:"updated_at"`
	Expert           *CodingCTOExpert `json:"expert,omitempty"`
}

type CodingCTOSkillEvolutionProposal struct {
	ID                  uint       `json:"id"`
	ExpertID            uint       `json:"expert_id"`
	SkillID             uint       `json:"skill_id"`
	BaseVersionID       uint       `json:"base_version_id"`
	ProposedContent     string     `json:"proposed_content"`
	ProposedContentHash string     `json:"proposed_content_hash"`
	Rationale           string     `json:"rationale"`
	EvalNotes           string     `json:"eval_notes"`
	Status              string     `json:"status"`
	ReviewedBy          *uint      `json:"reviewed_by,omitempty"`
	ReviewedAt          *time.Time `json:"reviewed_at,omitempty"`
	CreatedBy           uint       `json:"created_by"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

type SpecForgeExpertPlanningRequest struct {
	ExpertIDs     []uint
	RequirementID *uint
	PlanID        *uint
	ProjectID     *uint
	RepositoryID  string
	Idea          string
	Mode          string
	Context       map[string]any
}

type SpecForgeExpertPlanningBundle struct {
	Runs             []*CodingCTOExpertRun
	SkillVersionRefs []string
	OutputSummaries  []string
}

type SpecForgeExpertPlanningRunner interface {
	RunPlanningExperts(ctx context.Context, userID uint, req *SpecForgeExpertPlanningRequest) (*SpecForgeExpertPlanningBundle, error)
}
