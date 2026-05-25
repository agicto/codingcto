package execution

type StartExecutionRunRequest struct {
	Executor string `json:"executor" binding:"omitempty,max=100"`
}

type DispatchExecutionRunRequest struct {
	MaxTasks int `json:"max_tasks" binding:"omitempty,min=1,max=20"`
}
