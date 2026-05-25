package execution

type StartExecutionRunRequest struct {
	Executor string `json:"executor" binding:"omitempty,max=100"`
}

type DispatchExecutionRunRequest struct {
	MaxTasks int `json:"max_tasks" binding:"omitempty,min=1,max=20"`
}

type ExecuteAgentTaskRequest struct {
	RuntimeID string            `json:"runtime_id" binding:"omitempty,max=100"`
	SessionID string            `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string            `json:"workdir" binding:"required,max=500"`
	Env       map[string]string `json:"env" binding:"omitempty"`
}

type PinAgentTaskSessionRequest struct {
	SessionID string `json:"session_id" binding:"omitempty,max=255"`
	Workdir   string `json:"workdir" binding:"omitempty,max=500"`
}
