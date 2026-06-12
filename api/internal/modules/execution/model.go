package execution

import (
	"encoding/json"
	"strings"
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
	ID             uint   `gorm:"primaryKey"`
	RunID          uint   `gorm:"not null;index"`
	PRNodeID       uint   `gorm:"not null;index"`
	Executor       string `gorm:"size:100;not null;index"`
	Status         string `gorm:"size:50;not null;index"`
	PromptType     string `gorm:"size:50;not null;default:implementation;index"`
	ProcessStatus  string `gorm:"size:50;not null;default:pending;index"`
	CurrentPhase   string `gorm:"size:100;index"`
	RuntimeID      string `gorm:"size:100;index"`
	AttemptNumber  int    `gorm:"not null;default:1"`
	ParentTaskID   *uint  `gorm:"index"`
	FixAttemptID   *uint  `gorm:"index"`
	SessionID      string `gorm:"size:255;index"`
	Workdir        string `gorm:"type:text"`
	FailureReason  string `gorm:"size:100;index"`
	LogsURL        string `gorm:"type:text"`
	OutputLog      string `gorm:"type:text"`
	ErrorLog       string `gorm:"type:text"`
	ExitCode       *int
	ProcessRef     string `gorm:"size:255;index"`
	DispatchedAt   *time.Time
	StartedAt      *time.Time
	FinishedAt     *time.Time
	LastProgressAt *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (AgentTaskPO) TableName() string {
	return "specforge_agent_tasks"
}

type RuntimePO struct {
	ID                uint   `gorm:"primaryKey"`
	RuntimeID         string `gorm:"size:100;not null;uniqueIndex"`
	Executor          string `gorm:"size:100;not null;index"`
	Status            string `gorm:"size:50;not null;index"`
	Hostname          string `gorm:"size:255"`
	Version           string `gorm:"size:100"`
	AvailableCLIsJSON string `gorm:"column:available_clis;type:jsonb;not null;default:'[]'"`
	SandboxJSON       string `gorm:"column:sandbox;type:jsonb;not null;default:'{}'"`
	SkillRootsJSON    string `gorm:"column:skill_roots;type:jsonb;not null;default:'[]'"`
	LocalSkillCount   int    `gorm:"not null;default:0"`
	CapabilitiesHash  string `gorm:"size:64;index"`
	LastSeenAt        time.Time
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (RuntimePO) TableName() string {
	return "specforge_runtimes"
}

type ProjectRuntimeBindingPO struct {
	ID           uint   `gorm:"primaryKey"`
	WorkspaceID  string `gorm:"size:255;not null;index"`
	ProjectID    uint   `gorm:"not null;index:idx_specforge_project_runtime_binding"`
	RepositoryID string `gorm:"size:255;not null;index:idx_specforge_project_runtime_binding"`
	RuntimeID    string `gorm:"size:100;not null;index"`
	Executor     string `gorm:"size:100;not null;index"`
	RepoDir      string `gorm:"type:text;not null"`
	Active       bool   `gorm:"not null;default:true;index"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (ProjectRuntimeBindingPO) TableName() string {
	return "specforge_project_runtime_bindings"
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

type DirectAgentTaskPO struct {
	ID             uint   `gorm:"primaryKey"`
	CreatedBy      uint   `gorm:"not null;index"`
	RepositoryID   string `gorm:"size:255;not null;index"`
	Title          string `gorm:"size:255;not null"`
	Prompt         string `gorm:"type:text;not null"`
	Executor       string `gorm:"size:100;not null;index"`
	Status         string `gorm:"size:50;not null;index"`
	RuntimeID      string `gorm:"size:100;index"`
	SessionID      string `gorm:"size:255;index"`
	Workdir        string `gorm:"type:text"`
	ProcessRef     string `gorm:"size:255;index"`
	OutputLog      string `gorm:"type:text"`
	ErrorLog       string `gorm:"type:text"`
	ExitCode       *int
	FailureReason  string `gorm:"size:100;index"`
	DispatchedAt   *time.Time
	StartedAt      *time.Time
	FinishedAt     *time.Time
	LastProgressAt *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (DirectAgentTaskPO) TableName() string {
	return "codingcto_direct_agent_tasks"
}

type DirectTaskEventPO struct {
	ID        uint   `gorm:"primaryKey"`
	TaskID    uint   `gorm:"not null;uniqueIndex:idx_codingcto_direct_task_events_task_seq"`
	Seq       int    `gorm:"not null;uniqueIndex:idx_codingcto_direct_task_events_task_seq"`
	Type      string `gorm:"size:50;not null;index"`
	Tool      string `gorm:"size:100"`
	Content   string `gorm:"type:text"`
	Input     string `gorm:"type:text"`
	Output    string `gorm:"type:text"`
	CreatedAt time.Time
}

func (DirectTaskEventPO) TableName() string {
	return "codingcto_direct_task_events"
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
		ID:             task.ID,
		RunID:          task.RunID,
		PRNodeID:       task.PRNodeID,
		Executor:       task.Executor,
		Status:         task.Status,
		PromptType:     taskPromptType(task),
		ProcessStatus:  normalizeProcessStatus(task.ProcessStatus),
		CurrentPhase:   strings.TrimSpace(task.CurrentPhase),
		RuntimeID:      task.RuntimeID,
		AttemptNumber:  task.AttemptNumber,
		ParentTaskID:   task.ParentTaskID,
		FixAttemptID:   task.FixAttemptID,
		SessionID:      task.SessionID,
		Workdir:        task.Workdir,
		FailureReason:  task.FailureReason,
		LogsURL:        task.LogsURL,
		OutputLog:      task.OutputLog,
		ErrorLog:       task.ErrorLog,
		ExitCode:       task.ExitCode,
		ProcessRef:     task.ProcessRef,
		DispatchedAt:   task.DispatchedAt,
		StartedAt:      task.StartedAt,
		FinishedAt:     task.FinishedAt,
		LastProgressAt: task.LastProgressAt,
		CreatedAt:      task.CreatedAt,
		UpdatedAt:      task.UpdatedAt,
	}
}

func (po *AgentTaskPO) toDomain() *domain.SpecForgeAgentTask {
	return &domain.SpecForgeAgentTask{
		ID:             po.ID,
		RunID:          po.RunID,
		PRNodeID:       po.PRNodeID,
		Executor:       po.Executor,
		Status:         po.Status,
		PromptType:     taskPromptType(&domain.SpecForgeAgentTask{PromptType: po.PromptType}),
		ProcessStatus:  normalizeProcessStatus(po.ProcessStatus),
		CurrentPhase:   strings.TrimSpace(po.CurrentPhase),
		RuntimeID:      po.RuntimeID,
		AttemptNumber:  po.AttemptNumber,
		ParentTaskID:   po.ParentTaskID,
		FixAttemptID:   po.FixAttemptID,
		SessionID:      po.SessionID,
		Workdir:        po.Workdir,
		FailureReason:  po.FailureReason,
		LogsURL:        po.LogsURL,
		OutputLog:      po.OutputLog,
		ErrorLog:       po.ErrorLog,
		ExitCode:       po.ExitCode,
		ProcessRef:     po.ProcessRef,
		DispatchedAt:   po.DispatchedAt,
		StartedAt:      po.StartedAt,
		FinishedAt:     po.FinishedAt,
		LastProgressAt: po.LastProgressAt,
		CreatedAt:      po.CreatedAt,
		UpdatedAt:      po.UpdatedAt,
	}
}

func newRuntimePO(runtime *domain.SpecForgeRuntime) *RuntimePO {
	return &RuntimePO{
		ID:                runtime.ID,
		RuntimeID:         runtime.RuntimeID,
		Executor:          runtime.Executor,
		Status:            runtime.Status,
		Hostname:          runtime.Hostname,
		Version:           runtime.Version,
		AvailableCLIsJSON: mustMarshalRuntimeJSON(runtime.AvailableCLIs, "[]"),
		SandboxJSON:       mustMarshalRuntimeJSON(runtime.Sandbox, "{}"),
		SkillRootsJSON:    mustMarshalRuntimeJSON(runtime.SkillRoots, "[]"),
		LocalSkillCount:   runtime.LocalSkillCount,
		CapabilitiesHash:  runtime.CapabilitiesHash,
		LastSeenAt:        runtime.LastSeenAt,
		CreatedAt:         runtime.CreatedAt,
		UpdatedAt:         runtime.UpdatedAt,
	}
}

func (po *RuntimePO) toDomain() *domain.SpecForgeRuntime {
	var clis []domain.SpecForgeRuntimeCLI
	var skillRoots []domain.SpecForgeRuntimeSkillRoot
	var sandbox *domain.SpecForgeRuntimeSandbox
	unmarshalRuntimeJSON(po.AvailableCLIsJSON, &clis)
	unmarshalRuntimeJSON(po.SkillRootsJSON, &skillRoots)
	if po.SandboxJSON != "" && po.SandboxJSON != "{}" {
		var value domain.SpecForgeRuntimeSandbox
		if unmarshalRuntimeJSON(po.SandboxJSON, &value) {
			sandbox = &value
		}
	}
	return &domain.SpecForgeRuntime{
		ID:               po.ID,
		RuntimeID:        po.RuntimeID,
		Executor:         po.Executor,
		Status:           po.Status,
		Hostname:         po.Hostname,
		Version:          po.Version,
		AvailableCLIs:    clis,
		Sandbox:          sandbox,
		SkillRoots:       skillRoots,
		LocalSkillCount:  po.LocalSkillCount,
		CapabilitiesHash: po.CapabilitiesHash,
		LastSeenAt:       po.LastSeenAt,
		CreatedAt:        po.CreatedAt,
		UpdatedAt:        po.UpdatedAt,
	}
}

func newProjectRuntimeBindingPO(binding *domain.SpecForgeProjectRuntimeBinding) *ProjectRuntimeBindingPO {
	return &ProjectRuntimeBindingPO{
		ID:           binding.ID,
		WorkspaceID:  binding.WorkspaceID,
		ProjectID:    binding.ProjectID,
		RepositoryID: binding.RepositoryID,
		RuntimeID:    binding.RuntimeID,
		Executor:     binding.Executor,
		RepoDir:      binding.RepoDir,
		Active:       binding.Active,
		CreatedBy:    binding.CreatedBy,
		CreatedAt:    binding.CreatedAt,
		UpdatedAt:    binding.UpdatedAt,
	}
}

func (po *ProjectRuntimeBindingPO) toDomain() *domain.SpecForgeProjectRuntimeBinding {
	return &domain.SpecForgeProjectRuntimeBinding{
		ID:           po.ID,
		WorkspaceID:  po.WorkspaceID,
		ProjectID:    po.ProjectID,
		RepositoryID: po.RepositoryID,
		RuntimeID:    po.RuntimeID,
		Executor:     po.Executor,
		RepoDir:      po.RepoDir,
		Active:       po.Active,
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
	}
}

func mustMarshalRuntimeJSON(value any, fallback string) string {
	if value == nil {
		return fallback
	}
	data, err := json.Marshal(value)
	if err != nil {
		return fallback
	}
	return string(data)
}

func unmarshalRuntimeJSON(raw string, out any) bool {
	if raw == "" {
		return false
	}
	if err := json.Unmarshal([]byte(raw), out); err != nil {
		return false
	}
	return true
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

func newDirectAgentTaskPO(task *domain.CodingCTODirectAgentTask) *DirectAgentTaskPO {
	return &DirectAgentTaskPO{
		ID:             task.ID,
		CreatedBy:      task.CreatedBy,
		RepositoryID:   task.RepositoryID,
		Title:          task.Title,
		Prompt:         task.Prompt,
		Executor:       task.Executor,
		Status:         task.Status,
		RuntimeID:      task.RuntimeID,
		SessionID:      task.SessionID,
		Workdir:        task.Workdir,
		ProcessRef:     task.ProcessRef,
		OutputLog:      task.OutputLog,
		ErrorLog:       task.ErrorLog,
		ExitCode:       task.ExitCode,
		FailureReason:  task.FailureReason,
		DispatchedAt:   task.DispatchedAt,
		StartedAt:      task.StartedAt,
		FinishedAt:     task.FinishedAt,
		LastProgressAt: task.LastProgressAt,
		CreatedAt:      task.CreatedAt,
		UpdatedAt:      task.UpdatedAt,
	}
}

func (po *DirectAgentTaskPO) toDomain() *domain.CodingCTODirectAgentTask {
	return &domain.CodingCTODirectAgentTask{
		ID:             po.ID,
		CreatedBy:      po.CreatedBy,
		RepositoryID:   po.RepositoryID,
		Title:          po.Title,
		Prompt:         po.Prompt,
		Executor:       po.Executor,
		Status:         po.Status,
		RuntimeID:      po.RuntimeID,
		SessionID:      po.SessionID,
		Workdir:        po.Workdir,
		ProcessRef:     po.ProcessRef,
		OutputLog:      po.OutputLog,
		ErrorLog:       po.ErrorLog,
		ExitCode:       po.ExitCode,
		FailureReason:  po.FailureReason,
		DispatchedAt:   po.DispatchedAt,
		StartedAt:      po.StartedAt,
		FinishedAt:     po.FinishedAt,
		LastProgressAt: po.LastProgressAt,
		CreatedAt:      po.CreatedAt,
		UpdatedAt:      po.UpdatedAt,
	}
}

func newDirectTaskEventPO(event *domain.CodingCTODirectTaskEvent) *DirectTaskEventPO {
	return &DirectTaskEventPO{
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

func (po *DirectTaskEventPO) toDomain() *domain.CodingCTODirectTaskEvent {
	return &domain.CodingCTODirectTaskEvent{
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
