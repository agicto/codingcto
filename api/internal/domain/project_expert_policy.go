package domain

import "time"

const (
	ProjectMergeStrategySquash = "squash"
	ProjectMergeStrategyRebase = "rebase"
	ProjectMergeStrategyMerge  = "merge"
)

// SpecForgeProjectExpertPolicy stores the active project-level expert and merge contract.
type SpecForgeProjectExpertPolicy struct {
	ID                   uint                               `json:"id"`
	WorkspaceID          string                             `json:"workspace_id"`
	ProjectID            uint                               `json:"project_id"`
	Version              int                                `json:"version"`
	Active               bool                               `json:"active"`
	GoalBoundary         string                             `json:"goal_boundary"`
	AllowedPaths         []string                           `json:"allowed_paths,omitempty"`
	ForbiddenPaths       []string                           `json:"forbidden_paths,omitempty"`
	RequiredTestCommands []string                           `json:"required_test_commands,omitempty"`
	ReviewPolicy         SpecForgeProjectExpertReviewPolicy `json:"review_policy"`
	MergePolicy          SpecForgeProjectExpertMergePolicy  `json:"merge_policy"`
	CreatedBy            uint                               `json:"created_by"`
	CreatedAt            time.Time                          `json:"created_at"`
	UpdatedAt            time.Time                          `json:"updated_at"`
}

type SpecForgeProjectExpertReviewPolicy struct {
	RequiredApprovals       int  `json:"required_approvals"`
	AllowAuthorApproval     bool `json:"allow_author_approval"`
	BlockOnChangesRequested bool `json:"block_on_changes_requested"`
	RequireCIGreen          bool `json:"require_ci_green"`
}

type SpecForgeProjectExpertMergePolicy struct {
	Strategy              string `json:"strategy"`
	RequireManualApproval bool   `json:"require_manual_approval"`
	AllowAutoMerge        bool   `json:"allow_auto_merge"`
}
