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

type PlanReviewResponse struct {
	Idea               *domain.SpecForgeIdea               `json:"idea"`
	ProductSpec        *domain.SpecForgeProductSpec        `json:"product_spec"`
	ImplementationPlan *domain.SpecForgeImplementationPlan `json:"implementation_plan"`
	PRNodes            []*domain.SpecForgePRNode           `json:"pr_nodes"`
}

func toPlanReviewResponse(bundle *domain.SpecForgePlanBundle) *PlanReviewResponse {
	if bundle == nil {
		return nil
	}
	return &PlanReviewResponse{
		Idea:               bundle.Idea,
		ProductSpec:        bundle.ProductSpec,
		ImplementationPlan: bundle.Plan,
		PRNodes:            bundle.PRNodes,
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
