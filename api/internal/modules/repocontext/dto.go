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
