package expert

import "github.com/zgiai/luas/api/internal/domain"

type UpsertExpertRequest struct {
	Key             string `json:"key" binding:"required,min=2,max=120"`
	Name            string `json:"name" binding:"required,min=2,max=160"`
	Role            string `json:"role" binding:"required,min=2,max=80"`
	Description     string `json:"description" binding:"omitempty,max=1000"`
	SystemPrompt    string `json:"system_prompt" binding:"required,min=10,max=50000"`
	DefaultProvider string `json:"default_provider" binding:"omitempty,max=80"`
	DefaultModel    string `json:"default_model" binding:"omitempty,max=120"`
	Active          *bool  `json:"active" binding:"omitempty"`
	SortOrder       int    `json:"sort_order" binding:"omitempty,min=0,max=1000"`
}

type UpsertExpertSkillRequest struct {
	WorkspaceID   string   `json:"workspace_id" binding:"omitempty,max=255"`
	ProjectID     *uint    `json:"project_id" binding:"omitempty"`
	RepositoryID  string   `json:"repository_id" binding:"omitempty,max=255"`
	Name          string   `json:"name" binding:"required,min=2,max=160"`
	Description   string   `json:"description" binding:"omitempty,max=1000"`
	Content       string   `json:"content" binding:"required,min=3,max=50000"`
	ChangeSummary string   `json:"change_summary" binding:"omitempty,max=1000"`
	Active        *bool    `json:"active" binding:"omitempty"`
	TargetAgents  []string `json:"target_agents" binding:"omitempty,max=20,dive,max=100"`
}

type CreateExpertSkillVersionRequest struct {
	Content       string `json:"content" binding:"required,min=3,max=50000"`
	ChangeSummary string `json:"change_summary" binding:"omitempty,max=1000"`
	Source        string `json:"source" binding:"omitempty,max=60"`
	Promote       *bool  `json:"promote" binding:"omitempty"`
}

type CreateEvolutionProposalRequest struct {
	ProposedContent string `json:"proposed_content" binding:"required,min=3,max=50000"`
	Rationale       string `json:"rationale" binding:"required,min=3,max=5000"`
	EvalNotes       string `json:"eval_notes" binding:"omitempty,max=5000"`
}

type ReviewEvolutionProposalRequest struct {
	Notes string `json:"notes" binding:"omitempty,max=5000"`
}

type ListExpertsResponse struct {
	Experts []*domain.CodingCTOExpert `json:"experts"`
}

type ExpertResponse struct {
	Expert *domain.CodingCTOExpert `json:"expert"`
}

type ListExpertSkillsResponse struct {
	Skills []*domain.CodingCTOExpertSkill `json:"skills"`
}

type ExpertSkillResponse struct {
	Skill *domain.CodingCTOExpertSkill `json:"skill"`
}

type ListExpertSkillVersionsResponse struct {
	Versions []*domain.CodingCTOExpertSkillVersion `json:"versions"`
}

type ExpertSkillVersionResponse struct {
	Version *domain.CodingCTOExpertSkillVersion `json:"version"`
}

type ListExpertRunsResponse struct {
	Runs []*domain.CodingCTOExpertRun `json:"runs"`
}

type ExpertRunResponse struct {
	Run *domain.CodingCTOExpertRun `json:"run"`
}

type ListEvolutionProposalsResponse struct {
	Proposals []*domain.CodingCTOSkillEvolutionProposal `json:"proposals"`
}

type EvolutionProposalResponse struct {
	Proposal *domain.CodingCTOSkillEvolutionProposal `json:"proposal"`
}
