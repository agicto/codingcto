package project

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

func (r *repository) CreateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	po := newProjectPO(project)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*project = *po.toDomain()
	return nil
}

func (r *repository) UpdateProject(ctx context.Context, project *domain.SpecForgeProject) error {
	po := newProjectPO(project)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*project = *po.toDomain()
	return nil
}

func (r *repository) DeleteProject(ctx context.Context, projectID uint) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("project_id = ?", projectID).Delete(&ProjectExpertPolicyPO{}).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", projectID).Delete(&ProjectContextSnapshotPO{}).Error; err != nil {
			return err
		}
		if err := tx.Where("project_id = ?", projectID).Delete(&ProjectRepositoryPO{}).Error; err != nil {
			return err
		}
		result := tx.Delete(&ProjectPO{}, projectID)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected == 0 {
			return domain.ErrNotFound
		}
		return nil
	})
}

func (r *repository) FindProjectByID(ctx context.Context, id uint) (*domain.SpecForgeProject, error) {
	var po ProjectPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindProjectByWorkspaceAndSlug(ctx context.Context, workspaceID, slug string) (*domain.SpecForgeProject, error) {
	var po ProjectPO
	if err := r.db.WithContext(ctx).Where("workspace_id = ? AND slug = ?", workspaceID, slug).First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListProjectsByWorkspace(ctx context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	var pos []*ProjectPO
	if err := r.db.WithContext(ctx).
		Where("workspace_id = ?", workspaceID).
		Order("updated_at DESC, id DESC").
		Find(&pos).Error; err != nil {
		return nil, err
	}

	projects := make([]*domain.SpecForgeProject, len(pos))
	for i, po := range pos {
		projects[i] = po.toDomain()
	}
	return projects, nil
}

func (r *repository) CreateProjectRepository(ctx context.Context, binding *domain.SpecForgeProjectRepository) error {
	po := newProjectRepositoryPO(binding)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*binding = *po.toDomain()
	return nil
}

func (r *repository) DeleteProjectRepository(ctx context.Context, projectID uint, repositoryID string) error {
	return r.db.WithContext(ctx).
		Where("project_id = ? AND repository_id = ?", projectID, repositoryID).
		Delete(&ProjectRepositoryPO{}).Error
}

func (r *repository) FindProjectRepository(ctx context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProjectRepository, error) {
	var po ProjectRepositoryPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND repository_id = ?", projectID, repositoryID).
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListProjectRepositories(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	var pos []*ProjectRepositoryPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("role ASC, id ASC").
		Find(&pos).Error; err != nil {
		return nil, err
	}

	bindings := make([]*domain.SpecForgeProjectRepository, len(pos))
	for i, po := range pos {
		bindings[i] = po.toDomain()
	}
	return bindings, nil
}

func (r *repository) CountActiveProjectRepositories(ctx context.Context, projectID uint) (int64, error) {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&ProjectRepositoryPO{}).
		Where("project_id = ? AND active = ?", projectID, true).
		Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

func (r *repository) FindActivePrimaryProjectRepository(ctx context.Context, projectID uint) (*domain.SpecForgeProjectRepository, error) {
	var po ProjectRepositoryPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND role = ? AND active = ?", projectID, domain.ProjectRepositoryRolePrimary, true).
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) CreateProjectContextSnapshot(ctx context.Context, snapshot *domain.SpecForgeProjectContextSnapshot) error {
	po := newProjectContextSnapshotPO(snapshot)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*snapshot = *po.toDomain()
	return nil
}

func (r *repository) FindProjectContextSnapshotByID(ctx context.Context, id uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	var po ProjectContextSnapshotPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindLatestProjectContextSnapshot(ctx context.Context, projectID uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	var po ProjectContextSnapshotPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("created_at DESC, id DESC").
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) CreateProjectExpertPolicy(ctx context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	po := newProjectExpertPolicyPO(policy)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*policy = *po.toDomain()
	return nil
}

func (r *repository) UpdateProjectExpertPolicy(ctx context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	po := newProjectExpertPolicyPO(policy)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	*policy = *po.toDomain()
	return nil
}

func (r *repository) FindProjectExpertPolicyByID(ctx context.Context, id uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	var po ProjectExpertPolicyPO
	if err := r.db.WithContext(ctx).First(&po, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) FindActiveProjectExpertPolicyByProjectID(ctx context.Context, projectID uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	var po ProjectExpertPolicyPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ? AND active = ?", projectID, true).
		Order("version DESC, id DESC").
		First(&po).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}
	return po.toDomain(), nil
}

func (r *repository) ListProjectExpertPoliciesByProjectID(ctx context.Context, projectID uint) ([]*domain.SpecForgeProjectExpertPolicy, error) {
	var rows []*ProjectExpertPolicyPO
	if err := r.db.WithContext(ctx).
		Where("project_id = ?", projectID).
		Order("version DESC, id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeProjectExpertPolicy, len(rows))
	for index, row := range rows {
		out[index] = row.toDomain()
	}
	return out, nil
}
