package agent

import "time"

type PlanGenerationEventType string

const (
	PlanGenerationStarted     PlanGenerationEventType = "plan_generation.started"
	PlanGenerationCompleted   PlanGenerationEventType = "plan_generation.completed"
	PlanGenerationFailed      PlanGenerationEventType = "plan_generation.failed"
	PlanExpertSelected        PlanGenerationEventType = "expert.selected"
	PlanExpertRunStarted      PlanGenerationEventType = "expert_run.started"
	PlanExpertRunCompleted    PlanGenerationEventType = "expert_run.completed"
	PlanSkillVersionUsed      PlanGenerationEventType = "skill_version.used"
	PlanToolCallStarted       PlanGenerationEventType = "tool_call.started"
	PlanToolCallCompleted     PlanGenerationEventType = "tool_call.completed"
	PlanCreated               PlanGenerationEventType = "plan.created"
	PlanEvolutionProposalMade PlanGenerationEventType = "evolution_proposal.created"
	AgentTaskDispatched       PlanGenerationEventType = "agent_task.dispatched"
	AgentTaskCompleted        PlanGenerationEventType = "agent_task.completed"
)

type Actor struct {
	Type string `json:"type"`
	ID   string `json:"id,omitempty"`
	Name string `json:"name,omitempty"`
}

// PlanGenerationEvent is the canonical item shape for plan/expert/agent timelines.
// It intentionally stores refs and provider payloads without deciding persistence.
type PlanGenerationEvent struct {
	ID               string                  `json:"id,omitempty"`
	SessionID        string                  `json:"session_id,omitempty"`
	Type             PlanGenerationEventType `json:"type"`
	ProjectID        *uint                   `json:"project_id,omitempty"`
	RequirementID    *uint                   `json:"requirement_id,omitempty"`
	PlanID           *uint                   `json:"plan_id,omitempty"`
	RepositoryID     string                  `json:"repository_id,omitempty"`
	Actor            *Actor                  `json:"actor,omitempty"`
	ExpertRunRefs    []string                `json:"expert_run_refs,omitempty"`
	SkillVersionRefs []string                `json:"skill_version_refs,omitempty"`
	ToolCall         *ToolCall               `json:"tool_call,omitempty"`
	ToolResult       *ToolResult             `json:"tool_result,omitempty"`
	Payload          map[string]any          `json:"payload,omitempty"`
	CreatedAt        time.Time               `json:"created_at"`
}
