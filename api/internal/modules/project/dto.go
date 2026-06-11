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

type UpsertProjectExpertPolicyRequest struct {
	GoalBoundary         string                           `json:"goal_boundary" binding:"required,max=5000"`
	AllowedPaths         []string                         `json:"allowed_paths"`
	ForbiddenPaths       []string                         `json:"forbidden_paths"`
	RequiredTestCommands []string                         `json:"required_test_commands"`
	ReviewPolicy         ProjectExpertReviewPolicyRequest `json:"review_policy"`
	MergePolicy          ProjectExpertMergePolicyRequest  `json:"merge_policy"`
}

type ProjectExpertReviewPolicyRequest struct {
	RequiredApprovals       int  `json:"required_approvals"`
	AllowAuthorApproval     bool `json:"allow_author_approval"`
	BlockOnChangesRequested bool `json:"block_on_changes_requested"`
	RequireCIGreen          bool `json:"require_ci_green"`
}

type ProjectExpertMergePolicyRequest struct {
	Strategy              string `json:"strategy" binding:"omitempty,oneof=squash rebase merge"`
	RequireManualApproval bool   `json:"require_manual_approval"`
	AllowAutoMerge        bool   `json:"allow_auto_merge"`
}

type UpsertProjectRuntimeBindingRequest struct {
	RepositoryID string `json:"repository_id" binding:"required,max=255"`
	RuntimeID    string `json:"runtime_id" binding:"required,max=100"`
	Executor     string `json:"executor" binding:"omitempty,max=100"`
	RepoDir      string `json:"repo_dir" binding:"required,max=1000"`
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

type ProjectContextSnapshotResponse struct {
	Snapshot *domain.SpecForgeProjectContextSnapshot `json:"snapshot"`
}

type ProjectExpertPolicyResponse struct {
	Policy *domain.SpecForgeProjectExpertPolicy `json:"policy"`
}

type ProjectRuntimeBindingResponse struct {
	Binding *domain.SpecForgeProjectRuntimeBindingStatus `json:"binding"`
}

type ProjectRuntimeBindingListResponse struct {
	Bindings []*domain.SpecForgeProjectRuntimeBindingStatus `json:"bindings"`
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
