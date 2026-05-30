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

type UpsertSkillRequest struct {
	Name        string `json:"name" binding:"required,min=2,max=120"`
	Description string `json:"description" binding:"omitempty,max=1000"`
	Content     string `json:"content" binding:"required,min=3,max=50000"`
	Active      *bool  `json:"active" binding:"omitempty"`
}

type PlanReviewResponse struct {
	Requirement        *domain.SpecForgeRequirement        `json:"requirement,omitempty"`
	Idea               *domain.SpecForgeIdea               `json:"idea"`
	RepoProfile        *domain.SpecForgeRepoProfile        `json:"repo_profile,omitempty"`
	ProjectContext     *domain.SpecForgeProjectContext     `json:"project_context,omitempty"`
	ProductSpec        *domain.SpecForgeProductSpec        `json:"product_spec"`
	ImplementationPlan *domain.SpecForgeImplementationPlan `json:"implementation_plan"`
	PRNodes            []*domain.SpecForgePRNode           `json:"pr_nodes"`
	PRDAGReview        []string                            `json:"pr_dag_review"`
}

type CompiledPromptResponse struct {
	Prompt *domain.SpecForgeCompiledPrompt `json:"prompt"`
}

type SkillResponse struct {
	Skill *domain.SpecForgeSkill `json:"skill"`
}

type SkillListResponse struct {
	Skills []*domain.SpecForgeSkill `json:"skills"`
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
