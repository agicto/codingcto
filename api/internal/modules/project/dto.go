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

type ProjectRepositoryOptionsResponse struct {
	Repositories []*ProjectRepositoryOption `json:"repositories"`
}

type ProjectRepositoryOption struct {
	RepositoryID   string                         `json:"repository_id"`
	Access         *domain.GitHubRepositoryAccess `json:"access"`
	AlreadyBound   bool                           `json:"already_bound"`
	BoundRole      string                         `json:"bound_role,omitempty"`
	Writable       bool                           `json:"writable"`
	Selectable     bool                           `json:"selectable"`
	DisabledReason string                         `json:"disabled_reason,omitempty"`
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

type ProjectDeepWikiResponse struct {
	Repositories []*ProjectRepositoryDeepWikiResponse `json:"repositories"`
}

type ProjectRepositoryDeepWikiResultResponse struct {
	Repository *ProjectRepositoryDeepWikiResponse `json:"repository"`
}

type ProjectRepositoryDeepWikiResponse struct {
	ProjectID    uint                           `json:"project_id"`
	WorkspaceID  string                         `json:"workspace_id"`
	RepositoryID string                         `json:"repository_id"`
	Role         string                         `json:"role"`
	Source       *ProjectDeepWikiSourceResponse `json:"source,omitempty"`
	Index        *ProjectDeepWikiIndexResponse  `json:"index,omitempty"`
	Pages        []*ProjectDeepWikiPageSummary  `json:"pages,omitempty"`
	Error        string                         `json:"error,omitempty"`
}

type ProjectDeepWikiSourceResponse struct {
	ID            uint       `json:"id"`
	CreatedBy     uint       `json:"created_by"`
	WorkspaceID   string     `json:"workspace_id,omitempty"`
	ProjectID     uint       `json:"project_id,omitempty"`
	RepositoryID  string     `json:"repository_id,omitempty"`
	SourceType    string     `json:"source_type"`
	RepoURL       string     `json:"repo_url,omitempty"`
	Branch        string     `json:"branch,omitempty"`
	GitHubOwner   string     `json:"github_owner,omitempty"`
	GitHubRepo    string     `json:"github_repo,omitempty"`
	DefaultBranch string     `json:"default_branch,omitempty"`
	Status        string     `json:"status"`
	LastIndexedAt *time.Time `json:"last_indexed_at,omitempty"`
	LastFailure   string     `json:"last_failure,omitempty"`
	LastError     string     `json:"last_error,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type ProjectDeepWikiIndexResponse struct {
	ID                uint           `json:"id"`
	SourceID          uint           `json:"source_id"`
	CommitSHA         string         `json:"commit_sha,omitempty"`
	FileCount         int            `json:"file_count"`
	ChunkCount        int            `json:"chunk_count"`
	LanguageSummary   map[string]int `json:"language_summary"`
	FileTree          []string       `json:"file_tree"`
	Entrypoints       []string       `json:"entrypoints"`
	Routes            []string       `json:"routes"`
	Services          []string       `json:"services"`
	Models            []string       `json:"models"`
	Configs           []string       `json:"configs"`
	Frameworks        []string       `json:"frameworks"`
	PackageManager    string         `json:"package_manager,omitempty"`
	GenerationMode    string         `json:"generation_mode"`
	GeneratorProvider string         `json:"generator_provider,omitempty"`
	GeneratorModel    string         `json:"generator_model,omitempty"`
	PromptVersion     string         `json:"prompt_version,omitempty"`
	Status            string         `json:"status"`
	ErrorMessage      string         `json:"error_message,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
	UpdatedAt         time.Time      `json:"updated_at"`
}

type ProjectDeepWikiPageSummary struct {
	ID         uint      `json:"id"`
	IndexID    uint      `json:"index_id"`
	Slug       string    `json:"slug"`
	Title      string    `json:"title"`
	PageType   string    `json:"page_type"`
	OrderIndex int       `json:"order_index"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
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

func projectDeepWikiSourceResponse(source *domain.DeepWikiSource) *ProjectDeepWikiSourceResponse {
	if source == nil {
		return nil
	}
	return &ProjectDeepWikiSourceResponse{
		ID:            source.ID,
		CreatedBy:     source.CreatedBy,
		WorkspaceID:   source.WorkspaceID,
		ProjectID:     source.ProjectID,
		RepositoryID:  source.RepositoryID,
		SourceType:    source.SourceType,
		RepoURL:       source.RepoURL,
		Branch:        source.Branch,
		GitHubOwner:   source.GitHubOwner,
		GitHubRepo:    source.GitHubRepo,
		DefaultBranch: source.DefaultBranch,
		Status:        source.Status,
		LastIndexedAt: source.LastIndexedAt,
		LastFailure:   source.LastFailure,
		LastError:     source.LastError,
		CreatedAt:     source.CreatedAt,
		UpdatedAt:     source.UpdatedAt,
	}
}

func projectDeepWikiIndexResponse(index *domain.DeepWikiIndex) *ProjectDeepWikiIndexResponse {
	if index == nil {
		return nil
	}
	return &ProjectDeepWikiIndexResponse{
		ID:                index.ID,
		SourceID:          index.SourceID,
		CommitSHA:         index.CommitSHA,
		FileCount:         index.FileCount,
		ChunkCount:        index.ChunkCount,
		LanguageSummary:   index.LanguageSummary,
		FileTree:          index.FileTree,
		Entrypoints:       index.Entrypoints,
		Routes:            index.Routes,
		Services:          index.Services,
		Models:            index.Models,
		Configs:           index.Configs,
		Frameworks:        index.Frameworks,
		PackageManager:    index.PackageManager,
		GenerationMode:    domain.NormalizeDeepWikiGenerationMode(index.GenerationMode),
		GeneratorProvider: index.GeneratorProvider,
		GeneratorModel:    index.GeneratorModel,
		PromptVersion:     index.PromptVersion,
		Status:            index.Status,
		ErrorMessage:      index.ErrorMessage,
		CreatedAt:         index.CreatedAt,
		UpdatedAt:         index.UpdatedAt,
	}
}

func projectDeepWikiPageSummaries(pages []*domain.DeepWikiPage) []*ProjectDeepWikiPageSummary {
	out := make([]*ProjectDeepWikiPageSummary, 0, len(pages))
	for _, page := range pages {
		if page == nil {
			continue
		}
		out = append(out, &ProjectDeepWikiPageSummary{
			ID:         page.ID,
			IndexID:    page.IndexID,
			Slug:       page.Slug,
			Title:      page.Title,
			PageType:   page.PageType,
			OrderIndex: page.OrderIndex,
			Status:     page.Status,
			CreatedAt:  page.CreatedAt,
			UpdatedAt:  page.UpdatedAt,
		})
	}
	return out
}
