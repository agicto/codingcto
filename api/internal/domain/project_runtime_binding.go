package domain

import "time"

// SpecForgeProjectRuntimeBinding pins one runtime and repo directory to a project repository.
type SpecForgeProjectRuntimeBinding struct {
	ID           uint      `json:"id"`
	WorkspaceID  string    `json:"workspace_id"`
	ProjectID    uint      `json:"project_id"`
	RepositoryID string    `json:"repository_id"`
	RuntimeID    string    `json:"runtime_id"`
	Executor     string    `json:"executor"`
	RepoDir      string    `json:"repo_dir"`
	Active       bool      `json:"active"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeProjectRuntimeBindingStatus resolves one binding against current runtime health.
type SpecForgeProjectRuntimeBindingStatus struct {
	Binding  *SpecForgeProjectRuntimeBinding `json:"binding"`
	Runtime  *SpecForgeRuntime               `json:"runtime,omitempty"`
	Eligible bool                            `json:"eligible"`
	Warnings []string                        `json:"warnings,omitempty"`
}
