package domain

import (
	"context"
	"strings"
	"time"
)

const (
	IdeaStatusAwaitingApproval        = "awaiting_approval"
	RequirementStatusDraft            = "draft"
	RequirementStatusAwaitingApproval = "awaiting_approval"
	RequirementStatusExecuting        = "executing"
	RequirementStatusCompleted        = "completed"
	RequirementStatusCancelled        = "cancelled"
	RequirementStatusBlocked          = "blocked"
	PlanStatusDraft                   = "draft"
	PlanStatusApproved                = "approved"
	PRNodeStatusPlanned               = "planned"
	PRNodeStatusPROpened              = "pr_opened"
	PRNodeStatusCIRunning             = "ci_running"
	PRNodeStatusReadyForReview        = "ready_for_review"
	PRNodeStatusBlocked               = "blocked"
	PRNodeStatusMerged                = "merged"
	PRNodeStatusClosed                = "closed"
	ExecutionRunStatusQueued          = "queued"
	ExecutionRunStatusRunning         = "running"
	ExecutionRunStatusCompleted       = "completed"
	ExecutionRunStatusBlocked         = "blocked"
	ExecutionRunStatusCancelled       = "cancelled"
	RuntimeStatusOnline               = "online"
	RuntimeStatusOffline              = "offline"
	AgentTaskStatusQueued             = "queued"
	AgentTaskStatusDispatched         = "dispatched"
	AgentTaskStatusWaiting            = "waiting_on_dependencies"
	AgentTaskStatusRunning            = "running"
	AgentTaskStatusCompleted          = "completed"
	AgentTaskStatusFailed             = "failed"
	AgentTaskStatusCancelled          = "cancelled"
	PromptTypeImplementation          = "implementation"
	PromptTypeFix                     = "fix"
	PromptTypeReviewPatch             = "review_patch"
	SkillRunStageProductPlan          = "product_plan"
	SkillRunStageTechnicalPlan        = "technical_plan"
	SkillRunStagePRDAG                = "pr_dag"
	SkillRunStageSelfReview           = "self_review"
	SkillRunStatusCompleted           = "completed"
	SkillRunStatusFailed              = "failed"
	AgentProcessStatusPending         = "pending"
	AgentProcessStatusPreparing       = "preparing"
	AgentProcessStatusRunning         = "running"
	AgentProcessStatusCompleted       = "completed"
	AgentProcessStatusFailed          = "failed"
	AgentProcessStatusTimedOut        = "timed_out"
	AgentProcessStatusCancelled       = "cancelled"
	AgentProcessStatusLost            = "lost"
)

// SpecForgeIdea captures the original product intent submitted for a repository.
type SpecForgeIdea struct {
	ID            uint      `json:"id"`
	RequirementID *uint     `json:"requirement_id,omitempty"`
	ProjectID     *uint     `json:"project_id,omitempty"`
	RepositoryID  string    `json:"repository_id"`
	CreatedBy     uint      `json:"created_by"`
	RawInput      string    `json:"raw_input"`
	Type          string    `json:"type"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// SpecForgeRequirement is the stable user intent record that can produce multiple plan versions.
type SpecForgeRequirement struct {
	ID          uint      `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	ProjectID   uint      `json:"project_id"`
	CreatedBy   uint      `json:"created_by"`
	RawInput    string    `json:"raw_input"`
	Type        string    `json:"type"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
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
	ID                   uint       `json:"id"`
	RequirementID        *uint      `json:"requirement_id,omitempty"`
	IdeaID               uint       `json:"idea_id"`
	ProductSpecID        uint       `json:"product_spec_id"`
	Version              int        `json:"version"`
	TechnicalSummary     string     `json:"technical_summary"`
	AffectedAreas        []string   `json:"affected_areas"`
	DataModelChanges     []string   `json:"data_model_changes"`
	APIChanges           []string   `json:"api_changes"`
	UIChanges            []string   `json:"ui_changes"`
	TestStrategy         []string   `json:"test_strategy"`
	SecurityRisks        []string   `json:"security_risks"`
	MigrationRisks       []string   `json:"migration_risks"`
	Status               string     `json:"status"`
	ApprovedBy           *uint      `json:"approved_by,omitempty"`
	ApprovedAt           *time.Time `json:"approved_at,omitempty"`
	ApprovedSnapshotHash string     `json:"approved_snapshot_hash,omitempty"`
	ApprovedSnapshotAt   *time.Time `json:"approved_snapshot_at,omitempty"`
	DecisionOverrides    []string   `json:"decision_overrides,omitempty"`
	EvidenceRefs         []string   `json:"evidence_refs,omitempty"`
	CreatedAt            time.Time  `json:"created_at"`
	UpdatedAt            time.Time  `json:"updated_at"`
}

// SpecForgePRNode is a review-sized pull request node in the planned DAG.
type SpecForgePRNode struct {
	ID                 uint      `json:"id"`
	PlanID             uint      `json:"plan_id"`
	RepositoryID       string    `json:"repository_id"`
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
	EvidenceRefs       []string  `json:"evidence_refs,omitempty"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// SpecForgeCompiledPrompt records the exact prompt generated for a PR node.
type SpecForgeCompiledPrompt struct {
	ID           uint      `json:"id"`
	PRNodeID     uint      `json:"pr_node_id"`
	PlanID       uint      `json:"plan_id"`
	Type         string    `json:"type"`
	Version      string    `json:"version"`
	PromptText   string    `json:"prompt_text"`
	PromptHash   string    `json:"prompt_hash"`
	EvidenceRefs []string  `json:"evidence_refs,omitempty"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
}

// SpecForgeRuntime tracks a local or hosted executor that can claim agent tasks.
type SpecForgeRuntime struct {
	ID               uint                        `json:"id"`
	RuntimeID        string                      `json:"runtime_id"`
	Executor         string                      `json:"executor"`
	Status           string                      `json:"status"`
	Hostname         string                      `json:"hostname,omitempty"`
	Version          string                      `json:"version,omitempty"`
	AvailableCLIs    []SpecForgeRuntimeCLI       `json:"available_clis,omitempty"`
	Sandbox          *SpecForgeRuntimeSandbox    `json:"sandbox,omitempty"`
	SkillRoots       []SpecForgeRuntimeSkillRoot `json:"skill_roots,omitempty"`
	LocalSkillCount  int                         `json:"local_skill_count"`
	MaxConcurrency   int                         `json:"max_concurrency,omitempty"`
	RunningCount     int                         `json:"running_count,omitempty"`
	CapabilitiesHash string                      `json:"capabilities_hash,omitempty"`
	LastSeenAt       time.Time                   `json:"last_seen_at"`
	CreatedAt        time.Time                   `json:"created_at"`
	UpdatedAt        time.Time                   `json:"updated_at"`
}

type SpecForgeRuntimeCLI struct {
	Name      string `json:"name"`
	Command   string `json:"command"`
	Path      string `json:"path,omitempty"`
	Version   string `json:"version,omitempty"`
	Available bool   `json:"available"`
}

type SpecForgeRuntimeSandbox struct {
	Provider       string `json:"provider,omitempty"`
	Mode           string `json:"mode,omitempty"`
	NetworkAccess  bool   `json:"network_access"`
	Writable       bool   `json:"writable"`
	ApprovalPolicy string `json:"approval_policy,omitempty"`
	Reason         string `json:"reason,omitempty"`
}

type SpecForgeRuntimeSkillRoot struct {
	Provider string `json:"provider"`
	Path     string `json:"path"`
	Writable bool   `json:"writable"`
}

// SpecForgeSkill is a reusable repository instruction injected into compiled prompts.
type SpecForgeSkill struct {
	ID           uint      `json:"id"`
	RepositoryID string    `json:"repository_id"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Content      string    `json:"content"`
	Active       bool      `json:"active"`
	TargetAgents []string  `json:"target_agents,omitempty"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeProjectSkill pins a repository skill into a project planning pipeline.
type SpecForgeProjectSkill struct {
	ID           uint            `json:"id"`
	WorkspaceID  string          `json:"workspace_id"`
	ProjectID    uint            `json:"project_id"`
	RepositoryID string          `json:"repository_id"`
	SkillID      uint            `json:"skill_id"`
	Active       bool            `json:"active"`
	SortOrder    int             `json:"sort_order"`
	CreatedBy    uint            `json:"created_by"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"updated_at"`
	Skill        *SpecForgeSkill `json:"skill,omitempty"`
}

// SpecForgeSkillRun records one grounded planning skill execution.
type SpecForgeSkillRun struct {
	ID            uint       `json:"id"`
	RequirementID *uint      `json:"requirement_id,omitempty"`
	PlanID        *uint      `json:"plan_id,omitempty"`
	ProjectID     *uint      `json:"project_id,omitempty"`
	SkillID       *uint      `json:"skill_id,omitempty"`
	Stage         string     `json:"stage"`
	Status        string     `json:"status"`
	InputSummary  string     `json:"input_summary"`
	OutputSummary string     `json:"output_summary"`
	OutputJSON    string     `json:"output_json,omitempty"`
	EvidenceRefs  []string   `json:"evidence_refs,omitempty"`
	ErrorMessage  string     `json:"error_message,omitempty"`
	StartedAt     *time.Time `json:"started_at,omitempty"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	CreatedBy     uint       `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
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
	ID             uint       `json:"id"`
	RunID          uint       `json:"run_id"`
	PRNodeID       uint       `json:"pr_node_id"`
	Executor       string     `json:"executor"`
	Status         string     `json:"status"`
	PromptType     string     `json:"prompt_type"`
	ProcessStatus  string     `json:"process_status,omitempty"`
	CurrentPhase   string     `json:"current_phase,omitempty"`
	RuntimeID      string     `json:"runtime_id,omitempty"`
	AttemptNumber  int        `json:"attempt_number"`
	ParentTaskID   *uint      `json:"parent_task_id,omitempty"`
	FixAttemptID   *uint      `json:"fix_attempt_id,omitempty"`
	SessionID      string     `json:"session_id,omitempty"`
	Workdir        string     `json:"workdir,omitempty"`
	FailureReason  string     `json:"failure_reason,omitempty"`
	LogsURL        string     `json:"logs_url,omitempty"`
	OutputLog      string     `json:"output_log,omitempty"`
	ErrorLog       string     `json:"error_log,omitempty"`
	ExitCode       *int       `json:"exit_code,omitempty"`
	ProcessRef     string     `json:"process_ref,omitempty"`
	DispatchedAt   *time.Time `json:"dispatched_at,omitempty"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	FinishedAt     *time.Time `json:"finished_at,omitempty"`
	LastProgressAt *time.Time `json:"last_progress_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
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

// CodingCTODirectAgentTask is an ad-hoc user prompt dispatched to a local runtime.
type CodingCTODirectAgentTask struct {
	ID             uint       `json:"id"`
	CreatedBy      uint       `json:"created_by"`
	RepositoryID   string     `json:"repository_id"`
	Title          string     `json:"title"`
	Prompt         string     `json:"prompt"`
	Executor       string     `json:"executor"`
	Status         string     `json:"status"`
	RuntimeID      string     `json:"runtime_id,omitempty"`
	SessionID      string     `json:"session_id,omitempty"`
	Workdir        string     `json:"workdir,omitempty"`
	ProcessRef     string     `json:"process_ref,omitempty"`
	OutputLog      string     `json:"output_log,omitempty"`
	ErrorLog       string     `json:"error_log,omitempty"`
	ExitCode       *int       `json:"exit_code,omitempty"`
	FailureReason  string     `json:"failure_reason,omitempty"`
	DispatchedAt   *time.Time `json:"dispatched_at,omitempty"`
	StartedAt      *time.Time `json:"started_at,omitempty"`
	FinishedAt     *time.Time `json:"finished_at,omitempty"`
	LastProgressAt *time.Time `json:"last_progress_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// CodingCTODirectTaskEvent records ordered output for an ad-hoc agent task.
type CodingCTODirectTaskEvent struct {
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

// SpecForgeTaskSweepResult summarizes stale task cleanup work.
type SpecForgeTaskSweepResult struct {
	FailedTasks []*SpecForgeAgentTask `json:"failed_tasks"`
}

// SpecForgeExecutionBundle is the delivery state returned to run pages.
type SpecForgeExecutionBundle struct {
	Run               *SpecForgeExecutionRun `json:"run"`
	Plan              *SpecForgePlanBundle   `json:"plan,omitempty"`
	Tasks             []*SpecForgeAgentTask  `json:"tasks"`
	SelectedPRNodeIDs []uint                 `json:"selected_pr_node_ids"`
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
	Source            string    `json:"source"`
	Warnings          []string  `json:"warnings"`
	CreatedBy         uint      `json:"created_by"`
	LastIndexedAt     time.Time `json:"last_indexed_at"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

// SpecForgeRepoArchitectureSnapshot records the evidence behind an inferred repo profile.
type SpecForgeRepoArchitectureSnapshot struct {
	ID           uint      `json:"id"`
	RepositoryID string    `json:"repository_id"`
	CommitSHA    string    `json:"commit_sha"`
	Stack        []string  `json:"stack"`
	Modules      []string  `json:"modules"`
	Entrypoints  []string  `json:"entrypoints"`
	TestCommands []string  `json:"test_commands"`
	CIWorkflows  []string  `json:"ci_workflows"`
	RiskAreas    []string  `json:"risk_areas"`
	Summary      string    `json:"summary"`
	GeneratedBy  string    `json:"generated_by"`
	Warnings     []string  `json:"warnings"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func SpecForgeRepoArchitectureSnapshotStaleness(snapshot *SpecForgeRepoArchitectureSnapshot, now time.Time) (bool, []string) {
	if snapshot == nil {
		return true, []string{"No architecture snapshot has been generated yet."}
	}
	reasons := []string{}
	if strings.TrimSpace(snapshot.CommitSHA) == "" {
		reasons = append(reasons, "Architecture snapshot has no commit or ref recorded.")
	}
	if snapshot.CreatedAt.IsZero() {
		reasons = append(reasons, "Architecture snapshot has no creation timestamp.")
	} else if now.Sub(snapshot.CreatedAt) > 24*time.Hour {
		reasons = append(reasons, "Architecture snapshot is older than 24 hours.")
	}
	return len(reasons) > 0, reasons
}

// SpecForgePlanBundle is the aggregate returned to plan review screens.
type SpecForgePlanBundle struct {
	Requirement    *SpecForgeRequirement        `json:"requirement,omitempty"`
	Idea           *SpecForgeIdea               `json:"idea"`
	RepoProfile    *SpecForgeRepoProfile        `json:"repo_profile,omitempty"`
	ProjectContext *SpecForgeProjectContext     `json:"project_context,omitempty"`
	ProductSpec    *SpecForgeProductSpec        `json:"product_spec"`
	Plan           *SpecForgeImplementationPlan `json:"implementation_plan"`
	PRNodes        []*SpecForgePRNode           `json:"pr_nodes"`
}

// SpecForgePlanningRepository persists the idea-to-plan aggregate.
type SpecForgePlanningRepository interface {
	CreatePlanBundle(ctx context.Context, bundle *SpecForgePlanBundle) error
	CreateRequirement(ctx context.Context, requirement *SpecForgeRequirement) error
	FindRequirementByID(ctx context.Context, requirementID uint) (*SpecForgeRequirement, error)
	UpdateRequirement(ctx context.Context, requirement *SpecForgeRequirement) error
	FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*SpecForgePlanBundle, error)
	FindLatestPlanBundleByRequirementID(ctx context.Context, requirementID uint) (*SpecForgePlanBundle, error)
	FindPlanBundleByPlanID(ctx context.Context, planID uint) (*SpecForgePlanBundle, error)
	NextPlanVersionByRequirementID(ctx context.Context, requirementID uint) (int, error)
	FindPRNodeByID(ctx context.Context, prNodeID uint) (*SpecForgePRNode, error)
	FindPRNodeByBranchName(ctx context.Context, branchName string) (*SpecForgePRNode, error)
	FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*SpecForgePRNode, error)
	UpdatePRNode(ctx context.Context, node *SpecForgePRNode) error
	CreateCompiledPrompt(ctx context.Context, prompt *SpecForgeCompiledPrompt) error
	FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*SpecForgeCompiledPrompt, error)
	FindLatestCompiledPromptByPRNodeIDAndType(ctx context.Context, prNodeID uint, promptType string) (*SpecForgeCompiledPrompt, error)
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

// SpecForgeSkillPipelineRepository persists project skill selections and planning pipeline history.
type SpecForgeSkillPipelineRepository interface {
	UpsertProjectSkill(ctx context.Context, projectSkill *SpecForgeProjectSkill) error
	ListProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*SpecForgeProjectSkill, error)
	ListActiveProjectSkillsByProjectID(ctx context.Context, projectID uint) ([]*SpecForgeProjectSkill, error)
	CreateSkillRun(ctx context.Context, run *SpecForgeSkillRun) error
	ListSkillRunsByRequirementID(ctx context.Context, requirementID uint) ([]*SpecForgeSkillRun, error)
	ListSkillRunsByPlanID(ctx context.Context, planID uint) ([]*SpecForgeSkillRun, error)
}

// SpecForgeExecutionRepository persists execution run state.
type SpecForgeExecutionRepository interface {
	CreateExecutionBundle(ctx context.Context, bundle *SpecForgeExecutionBundle) error
	FindExecutionBundleByRunID(ctx context.Context, runID uint) (*SpecForgeExecutionBundle, error)
	FindLatestActiveExecutionBundleByPlanID(ctx context.Context, planID uint) (*SpecForgeExecutionBundle, error)
	FindAgentTaskByID(ctx context.Context, taskID uint) (*SpecForgeAgentTask, error)
	FindLatestTerminalAgentTaskByPRNodeID(ctx context.Context, prNodeID uint) (*SpecForgeAgentTask, error)
	ListPendingAgentTasksByRuntime(ctx context.Context, runtimeID, executor string) ([]*SpecForgeAgentTask, error)
	CreateTaskEvent(ctx context.Context, event *SpecForgeTaskEvent) error
	ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*SpecForgeTaskEvent, error)
	UpsertRuntime(ctx context.Context, runtime *SpecForgeRuntime) error
	ListRuntimes(ctx context.Context, executor, status string, limit int) ([]*SpecForgeRuntime, error)
	MarkStaleRuntimesOffline(ctx context.Context, staleBefore time.Time) ([]*SpecForgeRuntime, error)
	MarkRuntimesOfflineByRuntimeIDs(ctx context.Context, runtimeIDs []string) ([]*SpecForgeRuntime, error)
	FailTasksForOfflineRuntimes(ctx context.Context) ([]*SpecForgeAgentTask, error)
	FailTasksForRuntimeIDs(ctx context.Context, runtimeIDs []string, reason, errorLine string) ([]*SpecForgeAgentTask, error)
	FailStaleAgentTasks(ctx context.Context, dispatchBefore, runningBefore time.Time) ([]*SpecForgeAgentTask, error)
	CancelActiveTasksByRunID(ctx context.Context, runID uint) ([]*SpecForgeAgentTask, error)
	CreateRetryAgentTask(ctx context.Context, parent *SpecForgeAgentTask, status string, forceFreshSession bool) (*SpecForgeAgentTask, error)
	HasClaimableAgentTask(ctx context.Context, runtimeID, executor string) (bool, error)
	ClaimDispatchedAgentTask(ctx context.Context, runtimeID, executor, sessionID, workdir string) (*SpecForgeAgentTask, error)
	UpdateExecutionRun(ctx context.Context, run *SpecForgeExecutionRun) error
	UpdateAgentTask(ctx context.Context, task *SpecForgeAgentTask) error
	CreateDirectAgentTask(ctx context.Context, task *CodingCTODirectAgentTask) error
	FindDirectAgentTaskByID(ctx context.Context, taskID uint) (*CodingCTODirectAgentTask, error)
	ListDirectAgentTasks(ctx context.Context, createdBy uint, repositoryID, executor, runtimeID string, limit int) ([]*CodingCTODirectAgentTask, error)
	HasClaimableDirectAgentTask(ctx context.Context, runtimeID, executor, repositoryID string) (bool, error)
	ClaimDirectAgentTask(ctx context.Context, runtimeID, executor, repositoryID, sessionID, workdir string) (*CodingCTODirectAgentTask, error)
	UpdateDirectAgentTask(ctx context.Context, task *CodingCTODirectAgentTask) error
	CountRunningTasksByRuntimeIDs(ctx context.Context, runtimeIDs []string) (map[string]int, error)
	CreateDirectTaskEvent(ctx context.Context, event *CodingCTODirectTaskEvent) error
	ListDirectTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*CodingCTODirectTaskEvent, error)
}
