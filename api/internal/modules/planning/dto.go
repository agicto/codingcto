package planning

import (
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type CreateIdeaRequest struct {
	Input string `json:"input" binding:"required,min=10,max=5000"`
	Type  string `json:"type" binding:"omitempty,oneof=feature bugfix refactor docs test"`
}

type ApprovePlanRequest struct {
	Approved          bool              `json:"approved"`
	DecisionOverrides map[string]string `json:"decision_overrides"`
}

type CompilePromptRequest struct {
	Type string `json:"type" binding:"omitempty,oneof=implementation fix review_patch"`
}

type GenerateExpertImplementationPlanRequest struct {
	Idea       string                 `json:"idea" binding:"required,min=10,max=8000"`
	Mode       string                 `json:"mode" binding:"omitempty,oneof=mvp standard deep"`
	Repository *ExpertRepositoryInput `json:"repository" binding:"omitempty"`
	Skills     []ExpertSkillInput     `json:"skills" binding:"omitempty,max=12,dive"`
}

type ExpertRepositoryInput struct {
	RepositoryID  string `json:"repository_id" binding:"omitempty,max=200"`
	FullName      string `json:"full_name" binding:"omitempty,max=240"`
	DefaultBranch string `json:"default_branch" binding:"omitempty,max=120"`
}

type ExpertSkillInput struct {
	ID           any      `json:"id,omitempty"`
	Name         string   `json:"name" binding:"required,min=1,max=160"`
	Description  string   `json:"description" binding:"omitempty,max=1000"`
	Content      string   `json:"content" binding:"omitempty,max=6000"`
	TargetAgents []string `json:"target_agents" binding:"omitempty,max=20,dive,max=100"`
}

type UpsertSkillRequest struct {
	Name         string   `json:"name" binding:"required,min=2,max=120"`
	Description  string   `json:"description" binding:"omitempty,max=1000"`
	Content      string   `json:"content" binding:"required,min=3,max=50000"`
	Active       *bool    `json:"active" binding:"omitempty"`
	TargetAgents []string `json:"target_agents" binding:"omitempty,max=20,dive,max=100"`
}

type UpsertProjectSkillRequest struct {
	RepositoryID string   `json:"repository_id" binding:"required,min=1,max=255"`
	Name         string   `json:"name" binding:"required,min=2,max=120"`
	Description  string   `json:"description" binding:"omitempty,max=1000"`
	Content      string   `json:"content" binding:"required,min=3,max=50000"`
	Active       *bool    `json:"active" binding:"omitempty"`
	TargetAgents []string `json:"target_agents" binding:"omitempty,max=20,dive,max=100"`
	SortOrder    int      `json:"sort_order" binding:"omitempty,min=0,max=1000"`
}

type PlanReviewResponse struct {
	Requirement        *domain.SpecForgeRequirement            `json:"requirement,omitempty"`
	Idea               *domain.SpecForgeIdea                   `json:"idea"`
	RepoProfile        *domain.SpecForgeRepoProfile            `json:"repo_profile,omitempty"`
	ProjectContext     *domain.SpecForgeProjectContext         `json:"project_context,omitempty"`
	ContextSnapshot    *domain.SpecForgeProjectContextSnapshot `json:"context_snapshot,omitempty"`
	ExpertPolicy       *domain.SpecForgeProjectExpertPolicy    `json:"expert_policy,omitempty"`
	ProductSpec        *domain.SpecForgeProductSpec            `json:"product_spec"`
	ImplementationPlan *domain.SpecForgeImplementationPlan     `json:"implementation_plan"`
	PRNodes            []*domain.SpecForgePRNode               `json:"pr_nodes"`
	PRDAGReview        []string                                `json:"pr_dag_review"`
}

type CompiledPromptResponse struct {
	Prompt *domain.SpecForgeCompiledPrompt `json:"prompt"`
}

type ExpertImplementationPlanResponse struct {
	Plan     *ExpertImplementationPlan `json:"plan"`
	Markdown string                    `json:"markdown"`
	Provider string                    `json:"provider"`
	Model    string                    `json:"model"`
	ToolCall ExpertToolCallResponse    `json:"tool_call"`
	Usage    map[string]any            `json:"usage"`
}

type ExpertPlanStreamEvent struct {
	Type           string                            `json:"type"`
	Message        string                            `json:"message,omitempty"`
	Phase          string                            `json:"phase,omitempty"`
	ToolName       string                            `json:"tool_name,omitempty"`
	ToolCallID     string                            `json:"tool_call_id,omitempty"`
	ArgumentsBytes int                               `json:"arguments_bytes,omitempty"`
	Details        []string                          `json:"details,omitempty"`
	Response       *ExpertImplementationPlanResponse `json:"response,omitempty"`
	ErrorCode      string                            `json:"error_code,omitempty"`
	Error          string                            `json:"error,omitempty"`
}

type ExpertToolCallResponse struct {
	Name         string `json:"name"`
	ID           string `json:"id,omitempty"`
	FinishReason string `json:"finish_reason,omitempty"`
}

type ExpertImplementationPlan struct {
	Title         string             `json:"title"`
	Summary       string             `json:"summary"`
	Problem       string             `json:"problem"`
	TargetUsers   []string           `json:"target_users"`
	Scope         ExpertPlanScope    `json:"scope"`
	ExpertSkills  []ExpertSkillUse   `json:"expert_skills"`
	Architecture  ExpertArchitecture `json:"architecture"`
	Milestones    []ExpertMilestone  `json:"milestones"`
	Risks         []ExpertPlanRisk   `json:"risks"`
	OpenQuestions []string           `json:"open_questions"`
	NextSteps     []string           `json:"next_steps"`
}

type ExpertPlanScope struct {
	InScope    []string `json:"in_scope"`
	OutOfScope []string `json:"out_of_scope"`
}

type ExpertSkillUse struct {
	Name        string   `json:"name"`
	HowApplied  string   `json:"how_applied"`
	Constraints []string `json:"constraints"`
}

type ExpertArchitecture struct {
	Modules  []string `json:"modules"`
	DataFlow []string `json:"data_flow"`
	APIs     []string `json:"apis"`
	Risks    []string `json:"risks"`
}

type ExpertMilestone struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	Deliverables       []string `json:"deliverables"`
	AcceptanceCriteria []string `json:"acceptance_criteria"`
	Files              []string `json:"files"`
	Tests              []string `json:"tests"`
}

type ExpertPlanRisk struct {
	Risk       string `json:"risk"`
	Mitigation string `json:"mitigation"`
}

type SkillResponse struct {
	Skill *domain.SpecForgeSkill `json:"skill"`
}

type SkillListResponse struct {
	Skills []*domain.SpecForgeSkill `json:"skills"`
}

type ProjectSkillResponse struct {
	ProjectSkill *domain.SpecForgeProjectSkill `json:"project_skill"`
}

type ProjectSkillListResponse struct {
	ProjectSkills []*domain.SpecForgeProjectSkill `json:"project_skills"`
}

type SkillRunListResponse struct {
	SkillRuns []*domain.SpecForgeSkillRun `json:"skill_runs"`
}

func toPlanReviewResponse(bundle *domain.SpecForgePlanBundle) *PlanReviewResponse {
	if bundle == nil {
		return nil
	}
	return &PlanReviewResponse{
		Requirement:        bundle.Requirement,
		Idea:               bundle.Idea,
		RepoProfile:        bundle.RepoProfile,
		ProjectContext:     bundle.ProjectContext,
		ContextSnapshot:    bundle.ContextSnapshot,
		ExpertPolicy:       bundle.ExpertPolicy,
		ProductSpec:        bundle.ProductSpec,
		ImplementationPlan: bundle.Plan,
		PRNodes:            bundle.PRNodes,
		PRDAGReview:        reviewPRDAG(bundle.PRNodes),
	}
}

func decisionOverridesToStrings(values map[string]string) []string {
	if len(values) == 0 {
		return []string{}
	}
	out := make([]string, 0, len(values))
	for key, value := range values {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		out = append(out, key+"="+value)
	}
	return out
}
