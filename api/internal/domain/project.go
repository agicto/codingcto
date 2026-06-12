package domain

import (
	"context"
	"fmt"
	"strings"
	"time"
)

const (
	ProjectStatusActive   = "active"
	ProjectStatusArchived = "archived"

	ProjectRepositoryRolePrimary    = "primary"
	ProjectRepositoryRoleDependency = "dependency"
	ProjectRepositoryRoleDocs       = "docs"
	ProjectRepositoryRoleInfra      = "infra"

	MaxSpecForgeProjectRepositories = 3

	ProjectReadinessStatusBlocked   = "blocked"
	ProjectReadinessStatusAttention = "attention"
	ProjectReadinessStatusReady     = "ready"

	ProjectReadinessStepBindRepository        = "bind_repository"
	ProjectReadinessStepConfigureGitHub       = "configure_github"
	ProjectReadinessStepReviewContext         = "review_context"
	ProjectReadinessStepConnectRuntime        = "connect_runtime"
	ProjectReadinessStepAddSkills             = "add_skills"
	ProjectReadinessStepConfigureExpertPolicy = "configure_expert_policy"
	ProjectReadinessStepCreateRequirement     = "create_requirement"
)

// SpecForgeProject groups repositories, requirements, plans, and execution runs.
type SpecForgeProject struct {
	ID          uint      `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Description string    `json:"description"`
	Status      string    `json:"status"`
	CreatedBy   uint      `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// SpecForgeProjectRepository binds an existing GitHub repository to a project.
type SpecForgeProjectRepository struct {
	ID           uint      `json:"id"`
	WorkspaceID  string    `json:"workspace_id"`
	ProjectID    uint      `json:"project_id"`
	RepositoryID string    `json:"repository_id"`
	Role         string    `json:"role"`
	Active       bool      `json:"active"`
	CreatedBy    uint      `json:"created_by"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// SpecForgeProjectContext is the project-scoped context shown before planning.
type SpecForgeProjectContext struct {
	Project               *SpecForgeProject                    `json:"project"`
	Repositories          []*SpecForgeProjectRepository        `json:"repositories"`
	RepositoryContexts    []*SpecForgeProjectRepositoryContext `json:"repository_contexts"`
	LatestSnapshot        *SpecForgeProjectContextSnapshot     `json:"latest_snapshot,omitempty"`
	PrimaryRepositoryID   string                               `json:"primary_repository_id,omitempty"`
	ExecutionRepositoryID string                               `json:"execution_repository_id,omitempty"`
	ReadOnlyRepositoryIDs []string                             `json:"read_only_repository_ids,omitempty"`
	ExecutionGuardrails   []string                             `json:"execution_guardrails,omitempty"`
	Readiness             *SpecForgeProjectContextReadiness    `json:"readiness,omitempty"`
	ContextContract       *SpecForgeProjectContextContract     `json:"context_contract,omitempty"`
}

// SpecForgeProjectRepositoryContext enriches a project repository binding with planner-ready repo intelligence.
type SpecForgeProjectRepositoryContext struct {
	Repository           *SpecForgeProjectRepository        `json:"repository"`
	Profile              *SpecForgeRepoProfile              `json:"profile,omitempty"`
	ArchitectureSnapshot *SpecForgeRepoArchitectureSnapshot `json:"architecture_snapshot,omitempty"`
	ArchitectureStale    bool                               `json:"architecture_stale"`
	ArchitectureWarnings []string                           `json:"architecture_warnings,omitempty"`
	Skills               []*SpecForgeSkill                  `json:"skills"`
	Warnings             []string                           `json:"warnings,omitempty"`
}

// SpecForgeProjectContextReadiness summarizes whether a project is ready to generate an execution plan.
type SpecForgeProjectContextReadiness struct {
	HasPrimaryRepository    bool     `json:"has_primary_repository"`
	ActiveRepositoryCount   int      `json:"active_repository_count"`
	ReadOnlyRepositoryCount int      `json:"read_only_repository_count"`
	SkillCount              int      `json:"skill_count"`
	WarningCount            int      `json:"warning_count"`
	Guardrails              []string `json:"guardrails,omitempty"`
	Summary                 string   `json:"summary"`
	NextAction              string   `json:"next_action"`
}

// SpecForgeProjectReadiness is the project-level setup gate surfaced by the overview page.
type SpecForgeProjectReadiness struct {
	ProjectID               uint                             `json:"project_id"`
	ReadinessStatus         string                           `json:"readiness_status"`
	NextStep                string                           `json:"next_step"`
	NextAction              string                           `json:"next_action"`
	Summary                 string                           `json:"summary"`
	PrimaryRepositoryID     string                           `json:"primary_repository_id,omitempty"`
	HasPrimaryRepository    bool                             `json:"has_primary_repository"`
	ActiveRepositoryCount   int                              `json:"active_repository_count"`
	ReadOnlyRepositoryCount int                              `json:"read_only_repository_count"`
	SkillCount              int                              `json:"skill_count"`
	WarningCount            int                              `json:"warning_count"`
	RuntimeCount            int                              `json:"runtime_count"`
	Checks                  []SpecForgeProjectReadinessCheck `json:"checks,omitempty"`
	Warnings                []string                         `json:"warnings,omitempty"`
	Guardrails              []string                         `json:"guardrails,omitempty"`
}

type SpecForgeProjectReadinessCheck struct {
	Key      string `json:"key"`
	Label    string `json:"label"`
	Status   string `json:"status"`
	Detail   string `json:"detail,omitempty"`
	Required bool   `json:"required"`
}

// SpecForgeProjectContextContract is the compact, stable context packet injected into planners and executors.
type SpecForgeProjectContextContract struct {
	Version               string                                        `json:"version"`
	ProjectID             uint                                          `json:"project_id"`
	ProjectName           string                                        `json:"project_name"`
	PrimaryRepositoryID   string                                        `json:"primary_repository_id,omitempty"`
	ExecutionRepositoryID string                                        `json:"execution_repository_id,omitempty"`
	ReadOnlyRepositoryIDs []string                                      `json:"read_only_repository_ids,omitempty"`
	ActiveRepositoryCount int                                           `json:"active_repository_count"`
	SkillNames            []string                                      `json:"skill_names,omitempty"`
	MissingEvidence       []string                                      `json:"missing_evidence,omitempty"`
	Warnings              []string                                      `json:"warnings,omitempty"`
	PromptGuardrails      []string                                      `json:"prompt_guardrails,omitempty"`
	Repositories          []*SpecForgeRepositoryContextContractFragment `json:"repositories,omitempty"`
}

// SpecForgeRepositoryContextContractFragment summarizes one bound repository for prompt consumption.
type SpecForgeRepositoryContextContractFragment struct {
	RepositoryID               string   `json:"repository_id"`
	Role                       string   `json:"role"`
	Writable                   bool     `json:"writable"`
	HasProfile                 bool     `json:"has_profile"`
	HasArchitectureSnapshot    bool     `json:"has_architecture_snapshot"`
	ArchitectureStale          bool     `json:"architecture_stale"`
	Stack                      []string `json:"stack,omitempty"`
	TestCommands               []string `json:"test_commands,omitempty"`
	RiskAreas                  []string `json:"risk_areas,omitempty"`
	CodingConventions          []string `json:"coding_conventions,omitempty"`
	ArchitectureModules        []string `json:"architecture_modules,omitempty"`
	ArchitectureEntrypoints    []string `json:"architecture_entrypoints,omitempty"`
	ArchitectureCIWorkflows    []string `json:"architecture_ci_workflows,omitempty"`
	ArchitectureSnapshotCommit string   `json:"architecture_snapshot_commit,omitempty"`
	SkillNames                 []string `json:"skill_names,omitempty"`
}

func ApplySpecForgeProjectContextGuardrails(context *SpecForgeProjectContext) {
	if context == nil {
		return
	}
	context.PrimaryRepositoryID = ""
	context.ExecutionRepositoryID = ""
	context.ReadOnlyRepositoryIDs = nil
	context.ExecutionGuardrails = nil
	context.Readiness = nil
	context.ContextContract = nil

	activeCount := 0
	readOnly := []string{}
	for _, repository := range context.Repositories {
		if repository == nil || !repository.Active {
			continue
		}
		activeCount++
		repositoryID := strings.TrimSpace(repository.RepositoryID)
		if repository.Role == ProjectRepositoryRolePrimary && context.PrimaryRepositoryID == "" {
			context.PrimaryRepositoryID = repositoryID
			context.ExecutionRepositoryID = repositoryID
			continue
		}
		if repositoryID != "" {
			readOnly = append(readOnly, repositoryID)
		}
	}
	context.ReadOnlyRepositoryIDs = readOnly
	if context.PrimaryRepositoryID == "" {
		context.ExecutionGuardrails = append(context.ExecutionGuardrails, "Project must bind one active primary repository before planning or execution.")
		context.Readiness = buildSpecForgeProjectContextReadiness(context, activeCount)
		context.ContextContract = BuildSpecForgeProjectContextContract(context)
		return
	}
	context.ExecutionGuardrails = append(context.ExecutionGuardrails,
		"MVP execution is primary-repository only.",
		"Planner may read dependency, docs, and infra repositories as context.",
		"Executor must modify only "+context.PrimaryRepositoryID+"; other bound repositories are read-only context.",
		fmt.Sprintf("Project currently has %d active repositories bound; maximum supported is %d.", activeCount, MaxSpecForgeProjectRepositories),
	)
	context.Readiness = buildSpecForgeProjectContextReadiness(context, activeCount)
	context.ContextContract = BuildSpecForgeProjectContextContract(context)
}

func BuildSpecForgeProjectContextContract(context *SpecForgeProjectContext) *SpecForgeProjectContextContract {
	if context == nil || context.Project == nil {
		return nil
	}
	contract := &SpecForgeProjectContextContract{
		Version:               "project_context_contract_v1",
		ProjectID:             context.Project.ID,
		ProjectName:           strings.TrimSpace(context.Project.Name),
		PrimaryRepositoryID:   strings.TrimSpace(context.PrimaryRepositoryID),
		ExecutionRepositoryID: strings.TrimSpace(context.ExecutionRepositoryID),
		ReadOnlyRepositoryIDs: compactProjectContextStrings(context.ReadOnlyRepositoryIDs),
		PromptGuardrails:      compactProjectContextStrings(context.ExecutionGuardrails),
		Repositories:          []*SpecForgeRepositoryContextContractFragment{},
	}
	for _, repository := range context.Repositories {
		if repository != nil && repository.Active {
			contract.ActiveRepositoryCount++
		}
	}
	for _, repoContext := range context.RepositoryContexts {
		if repoContext == nil || repoContext.Repository == nil || !repoContext.Repository.Active {
			continue
		}
		fragment := buildRepositoryContextContractFragment(context, repoContext)
		contract.Repositories = append(contract.Repositories, fragment)
		for _, warning := range repoContext.Warnings {
			contract.Warnings = append(contract.Warnings, projectContextWarning(repoContext.Repository.RepositoryID, warning))
		}
		for _, warning := range repoContext.ArchitectureWarnings {
			contract.Warnings = append(contract.Warnings, projectContextWarning(repoContext.Repository.RepositoryID, warning))
		}
		if repoContext.Profile != nil {
			for _, warning := range repoContext.Profile.Warnings {
				contract.Warnings = append(contract.Warnings, projectContextWarning(repoContext.Repository.RepositoryID, warning))
			}
		}
		if repoContext.Profile == nil {
			contract.MissingEvidence = append(contract.MissingEvidence, "repo_profile:"+strings.TrimSpace(repoContext.Repository.RepositoryID))
		}
		if repoContext.ArchitectureSnapshot == nil {
			contract.MissingEvidence = append(contract.MissingEvidence, "architecture_snapshot:"+strings.TrimSpace(repoContext.Repository.RepositoryID))
		}
		if repoContext.ArchitectureStale {
			contract.MissingEvidence = append(contract.MissingEvidence, "architecture_snapshot_stale:"+strings.TrimSpace(repoContext.Repository.RepositoryID))
		}
		for _, skill := range repoContext.Skills {
			if skill == nil || !skill.Active {
				continue
			}
			name := strings.TrimSpace(skill.Name)
			if name == "" {
				continue
			}
			contract.SkillNames = append(contract.SkillNames, name)
		}
	}
	contract.SkillNames = compactProjectContextStrings(contract.SkillNames)
	contract.MissingEvidence = compactProjectContextStrings(contract.MissingEvidence)
	contract.Warnings = compactProjectContextStrings(contract.Warnings)
	contract.PromptGuardrails = append(contract.PromptGuardrails, derivedProjectContextGuardrails(contract)...)
	contract.PromptGuardrails = compactProjectContextStrings(contract.PromptGuardrails)
	return contract
}

func buildRepositoryContextContractFragment(context *SpecForgeProjectContext, repoContext *SpecForgeProjectRepositoryContext) *SpecForgeRepositoryContextContractFragment {
	repositoryID := strings.TrimSpace(repoContext.Repository.RepositoryID)
	fragment := &SpecForgeRepositoryContextContractFragment{
		RepositoryID:            repositoryID,
		Role:                    strings.TrimSpace(repoContext.Repository.Role),
		Writable:                repositoryID != "" && repositoryID == strings.TrimSpace(context.PrimaryRepositoryID),
		HasProfile:              repoContext.Profile != nil,
		HasArchitectureSnapshot: repoContext.ArchitectureSnapshot != nil,
		ArchitectureStale:       repoContext.ArchitectureStale,
	}
	if repoContext.Profile != nil {
		fragment.Stack = compactProjectContextStrings(repoContext.Profile.Stack)
		fragment.TestCommands = compactProjectContextStrings(repoContext.Profile.TestCommands)
		fragment.RiskAreas = compactProjectContextStrings(repoContext.Profile.RiskAreas)
		fragment.CodingConventions = compactProjectContextStrings(repoContext.Profile.CodingConventions)
	}
	if repoContext.ArchitectureSnapshot != nil {
		fragment.ArchitectureSnapshotCommit = strings.TrimSpace(repoContext.ArchitectureSnapshot.CommitSHA)
		fragment.ArchitectureModules = compactProjectContextStrings(repoContext.ArchitectureSnapshot.Modules)
		fragment.ArchitectureEntrypoints = compactProjectContextStrings(repoContext.ArchitectureSnapshot.Entrypoints)
		fragment.ArchitectureCIWorkflows = compactProjectContextStrings(repoContext.ArchitectureSnapshot.CIWorkflows)
	}
	for _, skill := range repoContext.Skills {
		if skill == nil || !skill.Active {
			continue
		}
		if name := strings.TrimSpace(skill.Name); name != "" {
			fragment.SkillNames = append(fragment.SkillNames, name)
		}
	}
	fragment.SkillNames = compactProjectContextStrings(fragment.SkillNames)
	return fragment
}

func derivedProjectContextGuardrails(contract *SpecForgeProjectContextContract) []string {
	if contract == nil {
		return nil
	}
	guardrails := []string{}
	if len(contract.MissingEvidence) > 0 {
		guardrails = append(guardrails, "Missing context evidence must be treated as uncertainty, not inferred as fact.")
	}
	if len(contract.SkillNames) == 0 {
		guardrails = append(guardrails, "No active project skills are pinned; planner and executor must rediscover local conventions before changing code.")
	}
	return guardrails
}

func projectContextWarning(repositoryID, warning string) string {
	repositoryID = strings.TrimSpace(repositoryID)
	warning = strings.Join(strings.Fields(strings.TrimSpace(warning)), " ")
	if repositoryID == "" || warning == "" {
		return warning
	}
	return repositoryID + ": " + warning
}

func compactProjectContextStrings(values []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func buildSpecForgeProjectContextReadiness(context *SpecForgeProjectContext, activeCount int) *SpecForgeProjectContextReadiness {
	if context == nil {
		return nil
	}
	skillCount := 0
	warningCount := 0
	for _, repositoryContext := range context.RepositoryContexts {
		if repositoryContext == nil {
			continue
		}
		for _, skill := range repositoryContext.Skills {
			if skill != nil && skill.Active {
				skillCount++
			}
		}
		warningCount += len(repositoryContext.Warnings)
		warningCount += len(repositoryContext.ArchitectureWarnings)
		if repositoryContext.Profile != nil {
			warningCount += len(repositoryContext.Profile.Warnings)
		}
	}
	hasPrimary := context.PrimaryRepositoryID != ""
	return &SpecForgeProjectContextReadiness{
		HasPrimaryRepository:    hasPrimary,
		ActiveRepositoryCount:   activeCount,
		ReadOnlyRepositoryCount: len(context.ReadOnlyRepositoryIDs),
		SkillCount:              skillCount,
		WarningCount:            warningCount,
		Guardrails:              append([]string(nil), context.ExecutionGuardrails...),
		Summary:                 specForgeProjectContextReadinessSummary(activeCount, context.PrimaryRepositoryID),
		NextAction:              specForgeProjectContextReadinessNextAction(hasPrimary, warningCount, skillCount),
	}
}

func specForgeProjectContextReadinessSummary(activeCount int, primaryRepositoryID string) string {
	if activeCount == 0 {
		return "No active repositories are bound to this project yet."
	}
	if primaryRepositoryID == "" {
		return fmt.Sprintf("%d active repositories are bound, but none is the primary execution repository.", activeCount)
	}
	return "Execution will modify " + primaryRepositoryID + "; other active repositories are read-only planning context."
}

func specForgeProjectContextReadinessNextAction(hasPrimary bool, warningCount int, skillCount int) string {
	if !hasPrimary {
		return "Bind one active primary repository before generating a plan."
	}
	if warningCount > 0 {
		return "Review repository context warnings before approving execution."
	}
	if skillCount == 0 {
		return "Add project or repo skills to reduce prompt ambiguity."
	}
	return "Generate a requirement plan from this project context."
}

// SpecForgeProjectRepositoryStore persists SpecForge project state.
type SpecForgeProjectRepositoryStore interface {
	CreateProject(ctx context.Context, project *SpecForgeProject) error
	UpdateProject(ctx context.Context, project *SpecForgeProject) error
	DeleteProject(ctx context.Context, projectID uint) error
	FindProjectByID(ctx context.Context, id uint) (*SpecForgeProject, error)
	FindProjectByWorkspaceAndSlug(ctx context.Context, workspaceID, slug string) (*SpecForgeProject, error)
	ListProjectsByWorkspace(ctx context.Context, workspaceID string) ([]*SpecForgeProject, error)
	CreateProjectRepository(ctx context.Context, binding *SpecForgeProjectRepository) error
	DeleteProjectRepository(ctx context.Context, projectID uint, repositoryID string) error
	FindProjectRepository(ctx context.Context, projectID uint, repositoryID string) (*SpecForgeProjectRepository, error)
	ListProjectRepositories(ctx context.Context, projectID uint) ([]*SpecForgeProjectRepository, error)
	CountActiveProjectRepositories(ctx context.Context, projectID uint) (int64, error)
	FindActivePrimaryProjectRepository(ctx context.Context, projectID uint) (*SpecForgeProjectRepository, error)
	CreateProjectContextSnapshot(ctx context.Context, snapshot *SpecForgeProjectContextSnapshot) error
	FindLatestProjectContextSnapshot(ctx context.Context, projectID uint) (*SpecForgeProjectContextSnapshot, error)
	CreateProjectExpertPolicy(ctx context.Context, policy *SpecForgeProjectExpertPolicy) error
	UpdateProjectExpertPolicy(ctx context.Context, policy *SpecForgeProjectExpertPolicy) error
	FindProjectExpertPolicyByID(ctx context.Context, id uint) (*SpecForgeProjectExpertPolicy, error)
	FindActiveProjectExpertPolicyByProjectID(ctx context.Context, projectID uint) (*SpecForgeProjectExpertPolicy, error)
	ListProjectExpertPoliciesByProjectID(ctx context.Context, projectID uint) ([]*SpecForgeProjectExpertPolicy, error)
}
