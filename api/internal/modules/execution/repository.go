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
