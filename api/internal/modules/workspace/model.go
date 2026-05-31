package workspace

import (
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type WorkspacePO struct {
	ID          uint   `gorm:"primaryKey"`
	WorkspaceID string `gorm:"size:255;not null;uniqueIndex"`
	Name        string `gorm:"size:120;not null"`
	Slug        string `gorm:"size:100;not null;uniqueIndex"`
	Description string `gorm:"type:text"`
	Status      string `gorm:"size:30;not null;default:'active';index"`
	CreatedBy   uint   `gorm:"not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (WorkspacePO) TableName() string {
	return "workspaces"
}

func newWorkspacePO(workspace *domain.Workspace) *WorkspacePO {
	return &WorkspacePO{
		ID:          workspace.ID,
		WorkspaceID: workspace.WorkspaceID,
		Name:        workspace.Name,
		Slug:        workspace.Slug,
		Description: workspace.Description,
		Status:      workspace.Status,
		CreatedBy:   workspace.CreatedBy,
		CreatedAt:   workspace.CreatedAt,
		UpdatedAt:   workspace.UpdatedAt,
	}
}

func (po *WorkspacePO) toDomain() *domain.Workspace {
	return &domain.Workspace{
		ID:          po.ID,
		WorkspaceID: po.WorkspaceID,
		Name:        po.Name,
		Slug:        po.Slug,
		Description: po.Description,
		Status:      po.Status,
		CreatedBy:   po.CreatedBy,
		CreatedAt:   po.CreatedAt,
		UpdatedAt:   po.UpdatedAt,
	}
}
