package domain

import (
	"context"
	"time"
)

const (
	IdeaStatusAwaitingApproval = "awaiting_approval"
	PlanStatusDraft            = "draft"
	PlanStatusApproved         = "approved"
	PRNodeStatusPlanned        = "planned"
)

// SpecForgeIdea captures the original product intent submitted for a repository.
type SpecForgeIdea struct {
	ID           uint      `json:"id"`
	RepositoryID string    `json:"repository_id"`
	CreatedBy    uint      `json:"created_by"`
	RawInput     string    `json:"raw_input"`
	Type         string    `json:"type"`
	Status       string    `json:"status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeProductSpec is the lightweight PRD generated from an idea.
type SpecForgeProductSpec struct {
	ID                 uint      `json:"id"`
	IdeaID             uint      `json:"idea_id"`
	Goals              []string  `json:"goals"`
	UserStories        []string  `json:"user_stories"`
	BusinessRules      []string  `json:"business_rules"`
	PermissionRules    []string  `json:"permission_rules"`
	EdgeCases          []string  `json:"edge_cases"`
	NonGoals           []string  `json:"non_goals"`
	AcceptanceCriteria []string  `json:"acceptance_criteria"`
	Assumptions        []string  `json:"assumptions"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// SpecForgeImplementationPlan turns the product spec into an engineering plan.
type SpecForgeImplementationPlan struct {
	ID                uint       `json:"id"`
	IdeaID            uint       `json:"idea_id"`
	ProductSpecID     uint       `json:"product_spec_id"`
	TechnicalSummary  string     `json:"technical_summary"`
	AffectedAreas     []string   `json:"affected_areas"`
	DataModelChanges  []string   `json:"data_model_changes"`
	APIChanges        []string   `json:"api_changes"`
	UIChanges         []string   `json:"ui_changes"`
	TestStrategy      []string   `json:"test_strategy"`
	SecurityRisks     []string   `json:"security_risks"`
	MigrationRisks    []string   `json:"migration_risks"`
	Status            string     `json:"status"`
	ApprovedBy        *uint      `json:"approved_by,omitempty"`
	ApprovedAt        *time.Time `json:"approved_at,omitempty"`
	DecisionOverrides []string   `json:"decision_overrides,omitempty"`
	CreatedAt         time.Time  `json:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at"`
}

// SpecForgePRNode is a review-sized pull request node in the planned DAG.
type SpecForgePRNode struct {
	ID                 uint      `json:"id"`
	PlanID             uint      `json:"plan_id"`
	NodeKey            string    `json:"node_key"`
	Order              int       `json:"order"`
	Title              string    `json:"title"`
	Type               string    `json:"type"`
	Goal               string    `json:"goal"`
	DependsOn          []string  `json:"depends_on"`
	EstimatedRisk      string    `json:"estimated_risk"`
	ExpectedFiles      []string  `json:"expected_files"`
	NonGoals           []string  `json:"non_goals"`
	AcceptanceCriteria []string  `json:"acceptance_criteria"`
	TestCommands       []string  `json:"test_commands"`
	BranchName         string    `json:"branch_name"`
	Status             string    `json:"status"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// SpecForgeCompiledPrompt records the exact prompt generated for a PR node.
type SpecForgeCompiledPrompt struct {
	ID         uint      `json:"id"`
	PRNodeID   uint      `json:"pr_node_id"`
	PlanID     uint      `json:"plan_id"`
	Type       string    `json:"type"`
	Version    string    `json:"version"`
	PromptText string    `json:"prompt_text"`
	PromptHash string    `json:"prompt_hash"`
	CreatedBy  uint      `json:"created_by"`
	CreatedAt  time.Time `json:"created_at"`
}

// SpecForgeRepoProfile is the compact repository context used by planners.
type SpecForgeRepoProfile struct {
	ID                uint      `json:"id"`
	RepositoryID      string    `json:"repository_id"`
	DefaultBranch     string    `json:"default_branch"`
	Stack             []string  `json:"stack"`
	TestCommands      []string  `json:"test_commands"`
	CIProvider        string    `json:"ci_provider"`
	AppStructure      []string  `json:"app_structure"`
	CodingConventions []string  `json:"coding_conventions"`
	RiskAreas         []string  `json:"risk_areas"`
	Summary           string    `json:"summary"`
	CreatedBy         uint      `json:"created_by"`
	LastIndexedAt     time.Time `json:"last_indexed_at"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// SpecForgePlanBundle is the aggregate returned to plan review screens.
type SpecForgePlanBundle struct {
	Idea        *SpecForgeIdea               `json:"idea"`
	RepoProfile *SpecForgeRepoProfile        `json:"repo_profile,omitempty"`
	ProductSpec *SpecForgeProductSpec        `json:"product_spec"`
	Plan        *SpecForgeImplementationPlan `json:"implementation_plan"`
	PRNodes     []*SpecForgePRNode           `json:"pr_nodes"`
}

// SpecForgePlanningRepository persists the idea-to-plan aggregate.
type SpecForgePlanningRepository interface {
	CreatePlanBundle(ctx context.Context, bundle *SpecForgePlanBundle) error
	FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*SpecForgePlanBundle, error)
	FindPlanBundleByPlanID(ctx context.Context, planID uint) (*SpecForgePlanBundle, error)
	FindPRNodeByID(ctx context.Context, prNodeID uint) (*SpecForgePRNode, error)
	CreateCompiledPrompt(ctx context.Context, prompt *SpecForgeCompiledPrompt) error
	UpdatePlan(ctx context.Context, plan *SpecForgeImplementationPlan) error
}

// SpecForgeRepoProfileRepository persists compact repository intelligence.
type SpecForgeRepoProfileRepository interface {
	UpsertProfile(ctx context.Context, profile *SpecForgeRepoProfile) error
	FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*SpecForgeRepoProfile, error)
}
