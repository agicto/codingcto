package workspace

import (
	"context"
	"errors"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

type repository struct {
	db *gorm.DB
}

func NewRepository(db *gorm.DB) *repository {
	return &repository{db: db}
}

func (r *repository) CreateWorkspace(ctx context.Context, workspace *domain.Workspace) error {
	if workspace == nil || strings.TrimSpace(workspace.WorkspaceID) == "" || strings.TrimSpace(workspace.Name) == "" || strings.TrimSpace(workspace.Slug) == "" {
		return domain.ErrInvalidInput
	}
	po := newWorkspacePO(workspace)
	if err := r.db.WithContext(ctx).Create(po).Error; err != nil {
		return err
	}
	*workspace = *po.toDomain()
	return nil
}

func (r *repository) UpdateWorkspace(ctx context.Context, workspace *domain.Workspace) error {
	if workspace == nil || workspace.ID == 0 {
		return domain.ErrInvalidInput
	}
	po := newWorkspacePO(workspace)
	if err := r.db.WithContext(ctx).Save(po).Error; err != nil {
		return err
	}
	workspace.UpdatedAt = po.UpdatedAt
	return nil
}

func (r *repository) FindWorkspaceByWorkspaceID(ctx context.Context, workspaceID string) (*domain.Workspace, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	var po WorkspacePO
	if err := r.db.WithContext(ctx).Where("workspace_id = ?", workspaceID).First(&po).Error; err != nil {
		return nil, mapNotFound(err)
	}
	return po.toDomain(), nil
}

func (r *repository) FindWorkspaceBySlug(ctx context.Context, slug string) (*domain.Workspace, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, domain.ErrInvalidInput
	}
	var po WorkspacePO
	if err := r.db.WithContext(ctx).Where("slug = ?", slug).First(&po).Error; err != nil {
		return nil, mapNotFound(err)
	}
	return po.toDomain(), nil
}

func (r *repository) ListWorkspaces(ctx context.Context, createdBy uint, status string, limit int) ([]*domain.Workspace, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	query := r.db.WithContext(ctx).Model(&WorkspacePO{})
	if createdBy != 0 {
		query = query.Where("created_by = ?", createdBy)
	}
	if strings.TrimSpace(status) != "" {
		query = query.Where("status = ?", strings.TrimSpace(status))
	}
	var pos []*WorkspacePO
	if err := query.Order("updated_at DESC, id DESC").Limit(limit).Find(&pos).Error; err != nil {
		return nil, err
	}
	out := make([]*domain.Workspace, len(pos))
	for i, po := range pos {
		out[i] = po.toDomain()
	}
	return out, nil
}

func mapNotFound(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return domain.ErrNotFound
	}
	return err
}
