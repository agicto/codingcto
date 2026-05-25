package execution

import (
	"context"
	"errors"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
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
