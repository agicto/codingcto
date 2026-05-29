package execution

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type ExecutionRunPO struct {
	ID          uint   `gorm:"primaryKey"`
	PlanID      uint   `gorm:"not null;index"`
	Status      string `gorm:"size:50;not null;index"`
	StartedBy   uint   `gorm:"not null;index"`
	StartedAt   time.Time
	CompletedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (ExecutionRunPO) TableName() string {
	return "specforge_execution_runs"
}

type AgentTaskPO struct {
	ID            uint   `gorm:"primaryKey"`
	RunID         uint   `gorm:"not null;index"`
	PRNodeID      uint   `gorm:"not null;index"`
	Executor      string `gorm:"size:100;not null;index"`
	Status        string `gorm:"size:50;not null;index"`
	PromptType    string `gorm:"size:50;not null;default:implementation;index"`
	RuntimeID     string `gorm:"size:100;index"`
	AttemptNumber int    `gorm:"not null;default:1"`
	ParentTaskID  *uint  `gorm:"index"`
	SessionID     string `gorm:"size:255;index"`
	Workdir       string `gorm:"type:text"`
	FailureReason string `gorm:"size:100;index"`
	LogsURL       string `gorm:"type:text"`
	OutputLog     string `gorm:"type:text"`
	ErrorLog      string `gorm:"type:text"`
	ExitCode      *int
	DispatchedAt  *time.Time
	StartedAt     *time.Time
	FinishedAt    *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (AgentTaskPO) TableName() string {
	return "specforge_agent_tasks"
}

type RuntimePO struct {
	ID         uint   `gorm:"primaryKey"`
	RuntimeID  string `gorm:"size:100;not null;uniqueIndex"`
	Executor   string `gorm:"size:100;not null;index"`
	Status     string `gorm:"size:50;not null;index"`
	Hostname   string `gorm:"size:255"`
	Version    string `gorm:"size:100"`
	LastSeenAt time.Time
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (RuntimePO) TableName() string {
	return "specforge_runtimes"
}

type TaskEventPO struct {
	ID        uint   `gorm:"primaryKey"`
	TaskID    uint   `gorm:"not null;uniqueIndex:idx_specforge_task_events_task_seq"`
	Seq       int    `gorm:"not null;uniqueIndex:idx_specforge_task_events_task_seq"`
	Type      string `gorm:"size:50;not null;index"`
	Tool      string `gorm:"size:100"`
	Content   string `gorm:"type:text"`
	Input     string `gorm:"type:text"`
	Output    string `gorm:"type:text"`
	CreatedAt time.Time
}

func (TaskEventPO) TableName() string {
	return "specforge_task_events"
}

func newExecutionRunPO(run *domain.SpecForgeExecutionRun) *ExecutionRunPO {
	return &ExecutionRunPO{
		ID:          run.ID,
		PlanID:      run.PlanID,
		Status:      run.Status,
		StartedBy:   run.StartedBy,
		StartedAt:   run.StartedAt,
		CompletedAt: run.CompletedAt,
		CreatedAt:   run.CreatedAt,
		UpdatedAt:   run.UpdatedAt,
	}
}

func (po *ExecutionRunPO) toDomain() *domain.SpecForgeExecutionRun {
	return &domain.SpecForgeExecutionRun{
		ID:          po.ID,
		PlanID:      po.PlanID,
		Status:      po.Status,
		StartedBy:   po.StartedBy,
		StartedAt:   po.StartedAt,
		CompletedAt: po.CompletedAt,
		CreatedAt:   po.CreatedAt,
		UpdatedAt:   po.UpdatedAt,
	}
}

func newAgentTaskPO(task *domain.SpecForgeAgentTask) *AgentTaskPO {
	return &AgentTaskPO{
		ID:            task.ID,
		RunID:         task.RunID,
		PRNodeID:      task.PRNodeID,
		Executor:      task.Executor,
		Status:        task.Status,
		PromptType:    taskPromptType(task),
		RuntimeID:     task.RuntimeID,
		AttemptNumber: task.AttemptNumber,
		ParentTaskID:  task.ParentTaskID,
		SessionID:     task.SessionID,
		Workdir:       task.Workdir,
		FailureReason: task.FailureReason,
		LogsURL:       task.LogsURL,
		OutputLog:     task.OutputLog,
		ErrorLog:      task.ErrorLog,
		ExitCode:      task.ExitCode,
		DispatchedAt:  task.DispatchedAt,
		StartedAt:     task.StartedAt,
		FinishedAt:    task.FinishedAt,
		CreatedAt:     task.CreatedAt,
		UpdatedAt:     task.UpdatedAt,
	}
}

func (po *AgentTaskPO) toDomain() *domain.SpecForgeAgentTask {
	return &domain.SpecForgeAgentTask{
		ID:            po.ID,
		RunID:         po.RunID,
		PRNodeID:      po.PRNodeID,
		Executor:      po.Executor,
		Status:        po.Status,
		PromptType:    taskPromptType(&domain.SpecForgeAgentTask{PromptType: po.PromptType}),
		RuntimeID:     po.RuntimeID,
		AttemptNumber: po.AttemptNumber,
		ParentTaskID:  po.ParentTaskID,
		SessionID:     po.SessionID,
		Workdir:       po.Workdir,
		FailureReason: po.FailureReason,
		LogsURL:       po.LogsURL,
		OutputLog:     po.OutputLog,
		ErrorLog:      po.ErrorLog,
		ExitCode:      po.ExitCode,
		DispatchedAt:  po.DispatchedAt,
		StartedAt:     po.StartedAt,
		FinishedAt:    po.FinishedAt,
		CreatedAt:     po.CreatedAt,
		UpdatedAt:     po.UpdatedAt,
	}
}

func newRuntimePO(runtime *domain.SpecForgeRuntime) *RuntimePO {
	return &RuntimePO{
		ID:         runtime.ID,
		RuntimeID:  runtime.RuntimeID,
		Executor:   runtime.Executor,
		Status:     runtime.Status,
		Hostname:   runtime.Hostname,
		Version:    runtime.Version,
		LastSeenAt: runtime.LastSeenAt,
		CreatedAt:  runtime.CreatedAt,
		UpdatedAt:  runtime.UpdatedAt,
	}
}

func (po *RuntimePO) toDomain() *domain.SpecForgeRuntime {
	return &domain.SpecForgeRuntime{
		ID:         po.ID,
		RuntimeID:  po.RuntimeID,
		Executor:   po.Executor,
		Status:     po.Status,
		Hostname:   po.Hostname,
		Version:    po.Version,
		LastSeenAt: po.LastSeenAt,
		CreatedAt:  po.CreatedAt,
		UpdatedAt:  po.UpdatedAt,
	}
}

func newTaskEventPO(event *domain.SpecForgeTaskEvent) *TaskEventPO {
	return &TaskEventPO{
		ID:        event.ID,
		TaskID:    event.TaskID,
		Seq:       event.Seq,
		Type:      event.Type,
		Tool:      event.Tool,
		Content:   event.Content,
		Input:     event.Input,
		Output:    event.Output,
		CreatedAt: event.CreatedAt,
	}
}

func (po *TaskEventPO) toDomain() *domain.SpecForgeTaskEvent {
	return &domain.SpecForgeTaskEvent{
		ID:        po.ID,
		TaskID:    po.TaskID,
		Seq:       po.Seq,
		Type:      po.Type,
		Tool:      po.Tool,
		Content:   po.Content,
		Input:     po.Input,
		Output:    po.Output,
		CreatedAt: po.CreatedAt,
	}
}
