package project

import (
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type CreateProjectRequest struct {
	WorkspaceID string `json:"workspace_id" binding:"required,min=1,max=255"`
	Name        string `json:"name" binding:"required,min=2,max=120"`
	Slug        string `json:"slug" binding:"required,min=2,max=100"`
	Description string `json:"description" binding:"omitempty,max=5000"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=2,max=120"`
	Slug        *string `json:"slug" binding:"omitempty,min=2,max=100"`
	Description *string `json:"description" binding:"omitempty,max=5000"`
	Status      *string `json:"status" binding:"omitempty,oneof=active archived"`
}

type BindRepositoryRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,min=1,max=255"`
	Role         string `json:"role" binding:"required,oneof=primary dependency docs infra"`
}

type ProjectResponse struct {
	Project *domain.SpecForgeProject `json:"project"`
}

type ProjectListResponse struct {
	Projects []*domain.SpecForgeProject `json:"projects"`
}

type ProjectRepositoryResponse struct {
	Repository *domain.SpecForgeProjectRepository `json:"repository"`
}

type ProjectRepositoryListResponse struct {
	Repositories []*domain.SpecForgeProjectRepository `json:"repositories"`
}

type ProjectContextResponse struct {
	Context *domain.SpecForgeProjectContext `json:"context"`
}

type ProjectReadinessResponse struct {
	Readiness *domain.SpecForgeProjectReadiness `json:"readiness"`
}

func newProjectPO(project *domain.SpecForgeProject) *ProjectPO {
	return &ProjectPO{
		ID:          project.ID,
		WorkspaceID: strings.TrimSpace(project.WorkspaceID),
		Name:        strings.TrimSpace(project.Name),
		Slug:        strings.TrimSpace(project.Slug),
		Description: strings.TrimSpace(project.Description),
		Status:      strings.TrimSpace(project.Status),
		CreatedBy:   project.CreatedBy,
		CreatedAt:   project.CreatedAt,
		UpdatedAt:   project.UpdatedAt,
	}
}

func (po *ProjectPO) toDomain() *domain.SpecForgeProject {
	return &domain.SpecForgeProject{
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

func newProjectRepositoryPO(binding *domain.SpecForgeProjectRepository) *ProjectRepositoryPO {
	return &ProjectRepositoryPO{
		ID:           binding.ID,
		WorkspaceID:  strings.TrimSpace(binding.WorkspaceID),
		ProjectID:    binding.ProjectID,
		RepositoryID: strings.TrimSpace(binding.RepositoryID),
		Role:         strings.TrimSpace(binding.Role),
		Active:       binding.Active,
		CreatedBy:    binding.CreatedBy,
		CreatedAt:    binding.CreatedAt,
		UpdatedAt:    binding.UpdatedAt,
	}
}

func (po *ProjectRepositoryPO) toDomain() *domain.SpecForgeProjectRepository {
	return &domain.SpecForgeProjectRepository{
		ID:           po.ID,
		WorkspaceID:  po.WorkspaceID,
		ProjectID:    po.ProjectID,
		RepositoryID: po.RepositoryID,
		Role:         po.Role,
		Active:       po.Active,
		CreatedBy:    po.CreatedBy,
		CreatedAt:    po.CreatedAt,
		UpdatedAt:    po.UpdatedAt,
	}
}

func nowUTC() time.Time {
	return time.Now().UTC()
}
