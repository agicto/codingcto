package project

import "time"

type ProjectPO struct {
	ID          uint   `gorm:"primaryKey"`
	WorkspaceID string `gorm:"size:255;not null;uniqueIndex:idx_specforge_project_workspace_slug;index"`
	Name        string `gorm:"size:120;not null"`
	Slug        string `gorm:"size:100;not null;uniqueIndex:idx_specforge_project_workspace_slug"`
	Description string `gorm:"type:text"`
	Status      string `gorm:"size:30;not null;default:'active';index"`
	CreatedBy   uint   `gorm:"not null;index"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (ProjectPO) TableName() string {
	return "specforge_projects"
}

type ProjectRepositoryPO struct {
	ID           uint   `gorm:"primaryKey"`
	WorkspaceID  string `gorm:"size:255;not null;index"`
	ProjectID    uint   `gorm:"not null;uniqueIndex:idx_specforge_project_repository;index"`
	RepositoryID string `gorm:"size:255;not null;uniqueIndex:idx_specforge_project_repository;index"`
	Role         string `gorm:"size:30;not null;index"`
	Active       bool   `gorm:"not null;default:true;index"`
	CreatedBy    uint   `gorm:"not null;index"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (ProjectRepositoryPO) TableName() string {
	return "specforge_project_repositories"
}
