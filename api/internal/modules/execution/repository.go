package execution

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) CreateExecutionBundle(ctx context.Context, bundle *domain.SpecForgeExecutionBundle) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		runPO := newExecutionRunPO(bundle.Run)
		if err := tx.Create(runPO).Error; err != nil {
			return err
		}
		bundle.Run.ID = runPO.ID
		bundle.Run.CreatedAt = runPO.CreatedAt
		bundle.Run.UpdatedAt = runPO.UpdatedAt

		for _, task := range bundle.Tasks {
			task.RunID = bundle.Run.ID
			taskPO := newAgentTaskPO(task)
			if err := tx.Create(taskPO).Error; err != nil {
				return err
			}
			task.ID = taskPO.ID
			task.CreatedAt = taskPO.CreatedAt
			task.UpdatedAt = taskPO.UpdatedAt
		}
		return nil
	})
}

func (r *repository) FindExecutionBundleByRunID(ctx context.Context, runID uint) (*domain.SpecForgeExecutionBundle, error) {
	var runPO ExecutionRunPO
	if err := r.db.WithContext(ctx).First(&runPO, runID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	var taskPOs []*AgentTaskPO
	if err := r.db.WithContext(ctx).Where("run_id = ?", runPO.ID).Order("id ASC").Find(&taskPOs).Error; err != nil {
		return nil, err
	}
	tasks := make([]*domain.SpecForgeAgentTask, len(taskPOs))
	for i, taskPO := range taskPOs {
		tasks[i] = taskPO.toDomain()
	}

	return &domain.SpecForgeExecutionBundle{
		Run:   runPO.toDomain(),
		Tasks: tasks,
	}, nil
}

func (r *repository) FindAgentTaskByID(ctx context.Context, taskID uint) (*domain.SpecForgeAgentTask, error) {
	var po AgentTaskPO
	if err := r.db.WithContext(ctx).First(&po, taskID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) CreateTaskEvent(ctx context.Context, event *domain.SpecForgeTaskEvent) error {
	if event == nil || event.TaskID == 0 || strings.TrimSpace(event.Type) == "" {
		return domain.ErrInvalidInput
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var maxSeq int
		if err := tx.Model(&TaskEventPO{}).
			Where("task_id = ?", event.TaskID).
			Select("COALESCE(MAX(seq), 0)").
			Scan(&maxSeq).Error; err != nil {
			return err
		}
		event.Seq = maxSeq + 1
		po := newTaskEventPO(event)
		if err := tx.Create(po).Error; err != nil {
			return err
		}
		event.ID = po.ID
		event.CreatedAt = po.CreatedAt
		return nil
	})
}

func (r *repository) ListTaskEvents(ctx context.Context, taskID uint, afterSeq int) ([]*domain.SpecForgeTaskEvent, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	query := r.db.WithContext(ctx).Where("task_id = ?", taskID)
	if afterSeq > 0 {
		query = query.Where("seq > ?", afterSeq)
	}
	var pos []*TaskEventPO
	if err := query.Order("seq ASC").Find(&pos).Error; err != nil {
		return nil, err
	}
	events := make([]*domain.SpecForgeTaskEvent, len(pos))
	for i, po := range pos {
		events[i] = po.toDomain()
	}
	return events, nil
}

func (r *repository) UpsertRuntime(ctx context.Context, runtime *domain.SpecForgeRuntime) error {
	if runtime == nil || strings.TrimSpace(runtime.RuntimeID) == "" || strings.TrimSpace(runtime.Executor) == "" {
		return domain.ErrInvalidInput
	}
	var existing RuntimePO
	query := r.db.WithContext(ctx).Where("runtime_id = ?", runtime.RuntimeID).First(&existing)
	if query.Error != nil && !errors.Is(query.Error, gorm.ErrRecordNotFound) {
		return query.Error
	}
	po := newRuntimePO(runtime)
	if query.Error == nil {
		po.ID = existing.ID
		po.CreatedAt = existing.CreatedAt
	}
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	runtime.ID = po.ID
	runtime.CreatedAt = po.CreatedAt
	runtime.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) MarkStaleRuntimesOffline(ctx context.Context, staleBefore time.Time) ([]*domain.SpecForgeRuntime, error) {
	var pos []*RuntimePO
	if err := r.db.WithContext(ctx).
		Where("status = ? AND last_seen_at < ?", domain.RuntimeStatusOnline, staleBefore).
		Order("last_seen_at ASC, id ASC").
		Find(&pos).Error; err != nil {
		return nil, err
	}
	if len(pos) == 0 {
		return []*domain.SpecForgeRuntime{}, nil
	}
	now := time.Now()
	ids := make([]uint, len(pos))
	for i, po := range pos {
		ids[i] = po.ID
		po.Status = domain.RuntimeStatusOffline
		po.UpdatedAt = now
	}
	if err := r.db.WithContext(ctx).Model(&RuntimePO{}).
		Where("id IN ?", ids).
		Updates(map[string]any{
			"status":     domain.RuntimeStatusOffline,
			"updated_at": now,
		}).Error; err != nil {
		return nil, err
	}
	runtimes := make([]*domain.SpecForgeRuntime, len(pos))
	for i, po := range pos {
		runtimes[i] = po.toDomain()
	}
	return runtimes, nil
}

func (r *repository) FailTasksForOfflineRuntimes(ctx context.Context) ([]*domain.SpecForgeAgentTask, error) {
	var runtimes []*RuntimePO
	if err := r.db.WithContext(ctx).
		Where("status = ?", domain.RuntimeStatusOffline).
		Find(&runtimes).Error; err != nil {
		return nil, err
	}
	if len(runtimes) == 0 {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	runtimeIDs := make([]string, 0, len(runtimes))
	for _, runtime := range runtimes {
		if strings.TrimSpace(runtime.RuntimeID) != "" {
			runtimeIDs = append(runtimeIDs, runtime.RuntimeID)
		}
	}
	if len(runtimeIDs) == 0 {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	var taskPOs []*AgentTaskPO
	activeStatuses := []string{domain.AgentTaskStatusDispatched, domain.AgentTaskStatusRunning}
	if err := r.db.WithContext(ctx).
		Where("status IN ? AND runtime_id IN ?", activeStatuses, runtimeIDs).
		Order("id ASC").
		Find(&taskPOs).Error; err != nil {
		return nil, err
	}
	if len(taskPOs) == 0 {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	now := time.Now()
	for _, taskPO := range taskPOs {
		taskPO.Status = domain.AgentTaskStatusFailed
		taskPO.FailureReason = "runtime_offline"
		taskPO.FinishedAt = &now
		taskPO.ErrorLog = appendLogLine(taskPO.ErrorLog, "runtime went offline")
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, taskPO := range taskPOs {
			if err := tx.Save(taskPO).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	tasks := make([]*domain.SpecForgeAgentTask, len(taskPOs))
	for i, po := range taskPOs {
		tasks[i] = po.toDomain()
	}
	return tasks, nil
}

func (r *repository) FailStaleAgentTasks(ctx context.Context, dispatchBefore, runningBefore time.Time) ([]*domain.SpecForgeAgentTask, error) {
	var taskPOs []*AgentTaskPO
	if err := r.db.WithContext(ctx).
		Where(
			"(status = ? AND dispatched_at IS NOT NULL AND dispatched_at < ?) OR (status = ? AND started_at IS NOT NULL AND started_at < ?)",
			domain.AgentTaskStatusDispatched,
			dispatchBefore,
			domain.AgentTaskStatusRunning,
			runningBefore,
		).
		Order("id ASC").
		Find(&taskPOs).Error; err != nil {
		return nil, err
	}
	if len(taskPOs) == 0 {
		return []*domain.SpecForgeAgentTask{}, nil
	}

	now := time.Now()
	for _, taskPO := range taskPOs {
		switch taskPO.Status {
		case domain.AgentTaskStatusDispatched:
			taskPO.FailureReason = "dispatch_timeout"
			taskPO.ErrorLog = appendLogLine(taskPO.ErrorLog, "task dispatch timed out")
		case domain.AgentTaskStatusRunning:
			taskPO.FailureReason = "execution_timeout"
			taskPO.ErrorLog = appendLogLine(taskPO.ErrorLog, "task execution timed out")
		}
		taskPO.Status = domain.AgentTaskStatusFailed
		taskPO.FinishedAt = &now
	}
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, taskPO := range taskPOs {
			if err := tx.Save(taskPO).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	tasks := make([]*domain.SpecForgeAgentTask, len(taskPOs))
	for i, po := range taskPOs {
		tasks[i] = po.toDomain()
	}
	return tasks, nil
}

func (r *repository) CancelActiveTasksByRunID(ctx context.Context, runID uint) ([]*domain.SpecForgeAgentTask, error) {
	if runID == 0 {
		return nil, domain.ErrInvalidInput
	}
	activeStatuses := []string{
		domain.AgentTaskStatusQueued,
		domain.AgentTaskStatusDispatched,
		domain.AgentTaskStatusWaiting,
		domain.AgentTaskStatusRunning,
	}
	var taskPOs []*AgentTaskPO
	if err := r.db.WithContext(ctx).
		Where("run_id = ? AND status IN ?", runID, activeStatuses).
		Order("id ASC").
		Find(&taskPOs).Error; err != nil {
		return nil, err
	}
	if len(taskPOs) == 0 {
		return []*domain.SpecForgeAgentTask{}, nil
	}
	now := time.Now()
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, taskPO := range taskPOs {
			taskPO.Status = domain.AgentTaskStatusCancelled
			taskPO.FailureReason = "run_cancelled"
			taskPO.FinishedAt = &now
			if err := tx.Save(taskPO).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	tasks := make([]*domain.SpecForgeAgentTask, len(taskPOs))
	for i, po := range taskPOs {
		tasks[i] = po.toDomain()
	}
	return tasks, nil
}

func (r *repository) CreateRetryAgentTask(ctx context.Context, parent *domain.SpecForgeAgentTask, status string, forceFreshSession bool) (*domain.SpecForgeAgentTask, error) {
	if parent == nil || parent.ID == 0 || parent.RunID == 0 || parent.PRNodeID == 0 || strings.TrimSpace(status) == "" {
		return nil, domain.ErrInvalidInput
	}
	retry := &domain.SpecForgeAgentTask{
		RunID:         parent.RunID,
		PRNodeID:      parent.PRNodeID,
		Executor:      parent.Executor,
		Status:        strings.TrimSpace(status),
		AttemptNumber: parent.AttemptNumber + 1,
		ParentTaskID:  &parent.ID,
	}
	if retry.AttemptNumber <= 1 {
		retry.AttemptNumber = 2
	}
	if !forceFreshSession {
		retry.SessionID = parent.SessionID
		retry.Workdir = parent.Workdir
	}
	po := newAgentTaskPO(retry)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) HasClaimableAgentTask(ctx context.Context, runtimeID, executor string) (bool, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	executor = strings.TrimSpace(executor)
	if runtimeID == "" {
		return false, domain.ErrInvalidInput
	}
	query := r.db.WithContext(ctx).Model(&AgentTaskPO{}).
		Where("status = ?", domain.AgentTaskStatusDispatched).
		Where("(runtime_id = '' OR runtime_id IS NULL OR runtime_id = ?)", runtimeID)
	if executor != "" {
		query = query.Where("executor = ?", executor)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *repository) ClaimDispatchedAgentTask(ctx context.Context, runtimeID, executor, sessionID, workdir string) (*domain.SpecForgeAgentTask, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	executor = strings.TrimSpace(executor)
	if runtimeID == "" {
		return nil, domain.ErrInvalidInput
	}

	var claimed *domain.SpecForgeAgentTask
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var po AgentTaskPO
		query := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("status = ?", domain.AgentTaskStatusDispatched).
			Where("(runtime_id = '' OR runtime_id IS NULL OR runtime_id = ?)", runtimeID)
		if executor != "" {
			query = query.Where("executor = ?", executor)
		}
		if err := query.Order("dispatched_at ASC, id ASC").First(&po).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return domain.ErrNotFound
			}
			return err
		}

		now := time.Now()
		po.Status = domain.AgentTaskStatusRunning
		po.RuntimeID = runtimeID
		if strings.TrimSpace(sessionID) != "" {
			po.SessionID = strings.TrimSpace(sessionID)
		}
		if strings.TrimSpace(workdir) != "" {
			po.Workdir = strings.TrimSpace(workdir)
		}
		if po.AttemptNumber == 0 {
			po.AttemptNumber = 1
		}
		if po.StartedAt == nil {
			po.StartedAt = &now
		}
		if err := tx.Save(&po).Error; err != nil {
			return err
		}
		claimed = po.toDomain()
		return nil
	})
	if err != nil {
		return nil, err
	}
	return claimed, nil
}

func (r *repository) UpdateExecutionRun(ctx context.Context, run *domain.SpecForgeExecutionRun) error {
	po := newExecutionRunPO(run)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	run.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) UpdateAgentTask(ctx context.Context, task *domain.SpecForgeAgentTask) error {
	po := newAgentTaskPO(task)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	task.UpdatedAt = po.UpdatedAt
	return nil
}
