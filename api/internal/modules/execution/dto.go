package execution

type StartExecutionRunRequest struct {
	Executor string `json:"executor" binding:"omitempty,max=100"`
}

type DispatchExecutionRunRequest struct {
	MaxTasks int `json:"max_tasks" binding:"omitempty,min=1,max=20"`
}

type ExecuteAgentTaskRequest struct {
	Workdir string            `json:"workdir" binding:"required,max=500"`
	Env     map[string]string `json:"env" binding:"omitempty"`
}
