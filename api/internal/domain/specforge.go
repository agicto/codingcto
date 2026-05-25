package domain

import (
	"context"
	"time"
)

const (
	IdeaStatusAwaitingApproval  = "awaiting_approval"
	PlanStatusDraft             = "draft"
	PlanStatusApproved          = "approved"
	PRNodeStatusPlanned         = "planned"
	PRNodeStatusPROpened        = "pr_opened"
	PRNodeStatusCIRunning       = "ci_running"
	PRNodeStatusReadyForReview  = "ready_for_review"
	PRNodeStatusBlocked         = "blocked"
	ExecutionRunStatusQueued    = "queued"
	ExecutionRunStatusRunning   = "running"
	ExecutionRunStatusCompleted = "completed"
	ExecutionRunStatusCancelled = "cancelled"
	RuntimeStatusOnline         = "online"
	RuntimeStatusOffline        = "offline"
	AgentTaskStatusQueued       = "queued"
	AgentTaskStatusDispatched   = "dispatched"
	AgentTaskStatusWaiting      = "waiting_on_dependencies"
	AgentTaskStatusRunning      = "running"
	AgentTaskStatusCompleted    = "completed"
	AgentTaskStatusFailed       = "failed"
	AgentTaskStatusCancelled    = "cancelled"
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
	GitHubPRNumber     *int      `json:"github_pr_number,omitempty"`
	GitHubPRURL        string    `json:"github_pr_url,omitempty"`
	GitHubHeadSHA      string    `json:"github_head_sha,omitempty"`
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

// SpecForgeRuntime tracks a local or hosted executor that can claim agent tasks.
type SpecForgeRuntime struct {
	ID         uint      `json:"id"`
	RuntimeID  string    `json:"runtime_id"`
	Executor   string    `json:"executor"`
	Status     string    `json:"status"`
	Hostname   string    `json:"hostname,omitempty"`
	Version    string    `json:"version,omitempty"`
	LastSeenAt time.Time `json:"last_seen_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// SpecForgeSkill is a reusable repository instruction injected into compiled prompts.
type SpecForgeSkill struct {
	ID           uint      `json:"id"`
	RepositoryID string    `json:"repository_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Content      string    `json:"content"`
	Active       bool      `json:"active"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeExecutionRun is one approved plan execution attempt.
type SpecForgeExecutionRun struct {
	ID          uint       `json:"id"`
	PlanID      uint       `json:"plan_id"`
	Status      string     `json:"status"`
	StartedBy   uint       `json:"started_by"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// SpecForgeAgentTask tracks one executor task for a planned PR node.
type SpecForgeAgentTask struct {
	ID            uint       `json:"id"`
	RunID         uint       `json:"run_id"`
	PRNodeID      uint       `json:"pr_node_id"`
	Executor      string     `json:"executor"`
	Status        string     `json:"status"`
	RuntimeID     string     `json:"runtime_id,omitempty"`
	AttemptNumber int        `json:"attempt_number"`
	ParentTaskID  *uint      `json:"parent_task_id,omitempty"`
	SessionID     string     `json:"session_id,omitempty"`
	Workdir       string     `json:"workdir,omitempty"`
	FailureReason string     `json:"failure_reason,omitempty"`
	LogsURL       string     `json:"logs_url,omitempty"`
	OutputLog     string     `json:"output_log,omitempty"`
	ErrorLog      string     `json:"error_log,omitempty"`
	ExitCode      *int       `json:"exit_code,omitempty"`
	DispatchedAt  *time.Time `json:"dispatched_at,omitempty"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	FinishedAt    *time.Time `json:"finished_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// SpecForgeTaskEvent records ordered runtime output for one agent task.
type SpecForgeTaskEvent struct {
	ID        uint      `json:"id"`
	TaskID    uint      `json:"task_id"`
	Seq       int       `json:"seq"`
	Type      string    `json:"type"`
	Tool      string    `json:"tool,omitempty"`
	Content   string    `json:"content,omitempty"`
	Input     string    `json:"input,omitempty"`
	Output    string    `json:"output,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

// SpecForgeRuntimeSweepResult summarizes stale runtime cleanup work.
type SpecForgeRuntimeSweepResult struct {
	OfflineRuntimes []*SpecForgeRuntime   `json:"offline_runtimes"`
	FailedTasks     []*SpecForgeAgentTask `json:"failed_tasks"`
}

// SpecForgeExecutionBundle is the delivery state returned to run pages.
type SpecForgeExecutionBundle struct {
	Run   *SpecForgeExecutionRun `json:"run"`
	Plan  *SpecForgePlanBundle   `json:"plan,omitempty"`
	Tasks []*SpecForgeAgentTask  `json:"tasks"`
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
	FindPRNodeByBranchName(ctx context.Context, branchName string) (*SpecForgePRNode, error)
	UpdatePRNode(ctx context.Context, node *SpecForgePRNode) error
	CreateCompiledPrompt(ctx context.Context, prompt *SpecForgeCompiledPrompt) error
	FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*SpecForgeCompiledPrompt, error)
	UpdatePlan(ctx context.Context, plan *SpecForgeImplementationPlan) error
}

// SpecForgeRepoProfileRepository persists compact repository intelligence.
type SpecForgeRepoProfileRepository interface {
	UpsertProfile(ctx context.Context, profile *SpecForgeRepoProfile) error
	FindProfileByRepositoryID(ctx context.Context, repositoryID string) (*SpecForgeRepoProfile, error)
}

// SpecForgeSkillRepository persists reusable repo-level prompt instructions.
type SpecForgeSkillRepository interface {
	UpsertSkill(ctx context.Context, skill *SpecForgeSkill) error
	ListActiveSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*SpecForgeSkill, error)
	ListSkillsByRepositoryID(ctx context.Context, repositoryID string) ([]*SpecForgeSkill, error)
}

// SpecForgeExecutionRepository persists execution run state.
type SpecForgeExecutionRepository interface {
	CreateExecutionBundle(ctx context.Context, bundle *SpecForgeExecutionBundle) error
	FindExecutionBundleByRunID(ctx context.Context, runID uint) (*SpecForgeExecutionBundle, error)
	FindAgentTaskByID(ctx context.Context, taskID uint) (*SpecForgeAgentTask, error)
	CreateTaskEvent(ctx context.Context, event *SpecForgeTaskEvent) error
	ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*SpecForgeTaskEvent, error)
	UpsertRuntime(ctx context.Context, runtime *SpecForgeRuntime) error
	MarkStaleRuntimesOffline(ctx context.Context, staleBefore time.Time) ([]*SpecForgeRuntime, error)
	FailTasksForOfflineRuntimes(ctx context.Context) ([]*SpecForgeAgentTask, error)
	CancelActiveTasksByRunID(ctx context.Context, runID uint) ([]*SpecForgeAgentTask, error)
	CreateRetryAgentTask(ctx context.Context, parent *SpecForgeAgentTask, status string, forceFreshSession bool) (*SpecForgeAgentTask, error)
	HasClaimableAgentTask(ctx context.Context, runtimeID, executor string) (bool, error)
	ClaimDispatchedAgentTask(ctx context.Context, runtimeID, executor, sessionID, workdir string) (*SpecForgeAgentTask, error)
	UpdateExecutionRun(ctx context.Context, run *SpecForgeExecutionRun) error
	UpdateAgentTask(ctx context.Context, task *SpecForgeAgentTask) error
}
