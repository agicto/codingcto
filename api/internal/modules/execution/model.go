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
	RuntimeID     string `gorm:"size:100;index"`
	AttemptNumber int    `gorm:"not null;default:1"`
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
		RuntimeID:     task.RuntimeID,
		AttemptNumber: task.AttemptNumber,
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
		RuntimeID:     po.RuntimeID,
		AttemptNumber: po.AttemptNumber,
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
