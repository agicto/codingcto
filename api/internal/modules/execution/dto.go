package execution

import "github.com/zgiai/luas/api/internal/domain"

type StartExecutionRunRequest struct {
	Executor  string `json:"executor" binding:"omitempty,max=100"`
	PRNodeIDs []uint `json:"pr_node_ids" binding:"omitempty,max=5,dive,min=1"`
}

type DispatchExecutionRunRequest struct {
	MaxTasks int `json:"max_tasks" binding:"omitempty,min=1,max=20"`
}

type RuntimeHeartbeatRequest struct {
	RuntimeID string `json:"runtime_id" binding:"required,max=100"`
	Executor  string `json:"executor" binding:"omitempty,max=100"`
	Hostname  string `json:"hostname" binding:"omitempty,max=255"`
	Version   string `json:"version" binding:"omitempty,max=100"`
}

type RuntimeSweepRequest struct {
	StaleSeconds int `json:"stale_seconds" binding:"omitempty,min=1,max=86400"`
}

type RuntimeDeregisterRequest struct {
	RuntimeIDs []string `json:"runtime_ids" binding:"required,min=1,max=100,dive,required,max=100"`
}

type ListRuntimesRequest struct {
	Executor string `form:"executor" binding:"omitempty,max=100"`
	Status   string `form:"status" binding:"omitempty,max=50"`
	Limit    int    `form:"limit" binding:"omitempty,min=1,max=100"`
}

type StaleTaskSweepRequest struct {
	DispatchTimeoutSeconds int `json:"dispatch_timeout_seconds" binding:"omitempty,min=1,max=86400"`
	RunningTimeoutSeconds  int `json:"running_timeout_seconds" binding:"omitempty,min=1,max=86400"`
}

type RetryAgentTaskRequest struct {
	ForceFreshSession bool `json:"force_fresh_session" binding:"omitempty"`
}

type ReviewPatchAgentTaskRequest struct {
	Feedback          string `json:"feedback" binding:"required,max=200000"`
	ForceFreshSession bool   `json:"force_fresh_session" binding:"omitempty"`
}

type FixAgentTaskRequest struct {
	FailureType       string `json:"failure_type" binding:"required,max=100"`
	FixAttemptID      uint   `json:"fix_attempt_id" binding:"omitempty"`
	CILogExcerpt      string `json:"ci_log_excerpt" binding:"omitempty,max=200000"`
	LikelyCause       string `json:"likely_cause" binding:"omitempty,max=5000"`
	RecommendedAction string `json:"recommended_action" binding:"omitempty,max=5000"`
	ForceFreshSession bool   `json:"force_fresh_session" binding:"omitempty"`
}

type ClaimAgentTaskRequest struct {
	Executor  string `json:"executor" binding:"omitempty,max=100"`
	SessionID string `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string `json:"workdir" binding:"omitempty,max=500"`
}

type RuntimeHeartbeatResponse struct {
	Runtime      *domain.SpecForgeRuntime `json:"runtime"`
	ClaimPending bool                     `json:"claim_pending"`
}

type RuntimePendingTasksResponse struct {
	Tasks []*domain.SpecForgeAgentTask `json:"tasks"`
}

type RuntimeListResponse struct {
	Runtimes []*domain.SpecForgeRuntime `json:"runtimes"`
}

type ClaimAgentTaskResponse struct {
	Task             *ClaimedAgentTask            `json:"task,omitempty"`
	PRNode           *ClaimedTaskPRNode           `json:"pr_node,omitempty"`
	Prompt           *ClaimedTaskPrompt           `json:"prompt,omitempty"`
	ExecutionContext *ClaimedTaskExecutionContext `json:"execution_context,omitempty"`
}

type ClaimedAgentTask struct {
	ID            uint   `json:"id"`
	RunID         uint   `json:"run_id"`
	PRNodeID      uint   `json:"pr_node_id"`
	Executor      string `json:"executor"`
	Status        string `json:"status"`
	PromptType    string `json:"prompt_type"`
	RuntimeID     string `json:"runtime_id"`
	AttemptNumber int    `json:"attempt_number"`
	ParentTaskID  *uint  `json:"parent_task_id,omitempty"`
	FixAttemptID  *uint  `json:"fix_attempt_id,omitempty"`
	SessionID     string `json:"session_id,omitempty"`
	Workdir       string `json:"workdir,omitempty"`
}

type ClaimedTaskPRNode struct {
	ID                 uint     `json:"id"`
	RepositoryID       string   `json:"repository_id"`
	NodeKey            string   `json:"node_key"`
	Title              string   `json:"title"`
	Type               string   `json:"type"`
	Goal               string   `json:"goal"`
	DependsOn          []string `json:"depends_on"`
	ExpectedFiles      []string `json:"expected_files"`
	NonGoals           []string `json:"non_goals"`
	AcceptanceCriteria []string `json:"acceptance_criteria"`
	TestCommands       []string `json:"test_commands"`
	BranchName         string   `json:"branch_name"`
	EvidenceRefs       []string `json:"evidence_refs,omitempty"`
}

type ClaimedTaskPrompt struct {
	ID           uint     `json:"id"`
	Version      string   `json:"version"`
	Type         string   `json:"type"`
	PromptText   string   `json:"prompt_text"`
	PromptHash   string   `json:"prompt_hash"`
	EvidenceRefs []string `json:"evidence_refs,omitempty"`
}

type ClaimedTaskExecutionContext struct {
	RepositoryID string `json:"repository_id"`
	BranchName   string `json:"branch_name"`
}

type ExecuteAgentTaskRequest struct {
	RuntimeID string            `json:"runtime_id" binding:"omitempty,max=100"`
	SessionID string            `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string            `json:"workdir" binding:"omitempty,max=500"`
	Env       map[string]string `json:"env" binding:"omitempty"`
}

type SubmitTaskResultRequest struct {
	RuntimeID     string `json:"runtime_id" binding:"omitempty,max=100"`
	SessionID     string `json:"session_id" binding:"omitempty,max=255"`
	Workdir       string `json:"workdir" binding:"omitempty,max=500"`
	Status        string `json:"status" binding:"required,oneof=completed failed timeout"`
	Output        string `json:"output" binding:"omitempty,max=200000"`
	Error         string `json:"error" binding:"omitempty,max=200000"`
	ExitCode      int    `json:"exit_code" binding:"omitempty"`
	FailureReason string `json:"failure_reason" binding:"omitempty,max=100"`
}

type CreateTaskEventRequest struct {
	Type    string `json:"type" binding:"required,max=50"`
	Tool    string `json:"tool" binding:"omitempty,max=100"`
	Content string `json:"content" binding:"omitempty,max=200000"`
	Input   string `json:"input" binding:"omitempty,max=200000"`
	Output  string `json:"output" binding:"omitempty,max=200000"`
}

type TaskEventsResponse struct {
	Events []*domain.SpecForgeTaskEvent `json:"events"`
}

type PinAgentTaskSessionRequest struct {
	SessionID string `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string `json:"workdir" binding:"omitempty,max=500"`
}
