package repocontext

type UpsertRepoProfileRequest struct {
	DefaultBranch     string   `json:"default_branch" binding:"omitempty,max=100"`
	Stack             []string `json:"stack"`
	TestCommands      []string `json:"test_commands"`
	CIProvider        string   `json:"ci_provider" binding:"omitempty,max=100"`
	AppStructure      []string `json:"app_structure"`
	CodingConventions []string `json:"coding_conventions"`
	RiskAreas         []string `json:"risk_areas"`
	Summary           string   `json:"summary" binding:"omitempty,max=10000"`
	Source            string   `json:"source" binding:"omitempty,max=100"`
	Warnings          []string `json:"warnings"`
}

type InferRepoProfileRequest struct {
	DefaultBranch  string            `json:"default_branch" binding:"omitempty,max=100"`
	FilePaths      []string          `json:"file_paths" binding:"omitempty,max=2000,dive,max=500"`
	PackageScripts map[string]string `json:"package_scripts" binding:"omitempty"`
}

type ReindexRepoArchitectureRequest struct {
	DefaultBranch  string            `json:"default_branch" binding:"omitempty,max=100"`
	FilePaths      []string          `json:"file_paths" binding:"omitempty,max=2000,dive,max=500"`
	PackageScripts map[string]string `json:"package_scripts" binding:"omitempty"`
}

type RepoArchitectureStatusResponse struct {
	Snapshot     *RepoArchitectureSnapshotResponse `json:"snapshot,omitempty"`
	Stale        bool                              `json:"stale"`
	StaleReasons []string                          `json:"stale_reasons,omitempty"`
}

type RepoArchitectureSnapshotResponse struct {
	ID           uint     `json:"id"`
	RepositoryID string   `json:"repository_id"`
	CommitSHA    string   `json:"commit_sha"`
	Stack        []string `json:"stack"`
	Modules      []string `json:"modules"`
	Entrypoints  []string `json:"entrypoints"`
	TestCommands []string `json:"test_commands"`
	CIWorkflows  []string `json:"ci_workflows"`
	RiskAreas    []string `json:"risk_areas"`
	Summary      string   `json:"summary"`
	GeneratedBy  string   `json:"generated_by"`
	Warnings     []string `json:"warnings"`
	CreatedBy    uint     `json:"created_by"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}
