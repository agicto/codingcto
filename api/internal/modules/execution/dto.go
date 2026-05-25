package execution

import "github.com/zgiai/luas/api/internal/domain"

type StartExecutionRunRequest struct {
	Executor string `json:"executor" binding:"omitempty,max=100"`
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

type ClaimAgentTaskRequest struct {
	Executor  string `json:"executor" binding:"omitempty,max=100"`
	SessionID string `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string `json:"workdir" binding:"omitempty,max=500"`
}

type RuntimeHeartbeatResponse struct {
	Runtime      *domain.SpecForgeRuntime `json:"runtime"`
	ClaimPending bool                     `json:"claim_pending"`
}

type ClaimAgentTaskResponse struct {
	Task *ClaimedAgentTask `json:"task,omitempty"`
}

type ClaimedAgentTask struct {
	ID            uint   `json:"id"`
	RunID         uint   `json:"run_id"`
	PRNodeID      uint   `json:"pr_node_id"`
	Executor      string `json:"executor"`
	Status        string `json:"status"`
	RuntimeID     string `json:"runtime_id"`
	AttemptNumber int    `json:"attempt_number"`
	SessionID     string `json:"session_id,omitempty"`
	Workdir       string `json:"workdir,omitempty"`
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
