package project

import (
	"context"
	"errors"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestServiceProjectRepositoryFlow(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "SpecForge",
	})
	require.NoError(t, err)
	require.Equal(t, "specforge", project.Slug)

	binding, err := svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)
	require.Equal(t, domain.ProjectRepositoryRolePrimary, binding.Role)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, project.ID, contextBundle.Project.ID)
	require.Len(t, contextBundle.Repositories, 1)
	require.Len(t, contextBundle.RepositoryContexts, 1)
	require.Equal(t, "repo_1", contextBundle.PrimaryRepositoryID)
	require.Equal(t, "repo_1", contextBundle.ExecutionRepositoryID)
	require.Empty(t, contextBundle.ReadOnlyRepositoryIDs)
	require.Contains(t, contextBundle.ExecutionGuardrails, "MVP execution is primary-repository only.")
	require.NotNil(t, contextBundle.Readiness)
	require.True(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 1, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.SkillCount)
	require.Equal(t, "Add project or repo skills to reduce prompt ambiguity.", contextBundle.Readiness.NextAction)
	require.NotNil(t, contextBundle.ContextContract)
	require.Equal(t, "project_context_contract_v1", contextBundle.ContextContract.Version)
	require.Equal(t, "repo_1", contextBundle.ContextContract.PrimaryRepositoryID)
	require.Equal(t, "repo_1", contextBundle.ContextContract.ExecutionRepositoryID)
	require.Contains(t, contextBundle.ContextContract.MissingEvidence, "repo_profile:repo_1")
	require.Contains(t, contextBundle.ContextContract.MissingEvidence, "architecture_snapshot:repo_1")
	require.Contains(t, contextBundle.ContextContract.PromptGuardrails, "Missing context evidence must be treated as uncertainty, not inferred as fact.")
	require.Contains(t, contextBundle.ContextContract.PromptGuardrails, "No active project skills are pinned; planner and executor must rediscover local conventions before changing code.")
}

func TestServiceProjectContextIncludesRepoProfilesAndSkills(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
			"repo_2": {RepositoryID: "repo_2", WorkspaceID: "workspace_1"},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				ID:            10,
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Stack:         []string{"Go", "Next.js"},
				TestCommands:  []string{"go test ./...", "pnpm type-check"},
				CIProvider:    "github_actions",
				Summary:       "Primary app repo.",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				ID:           30,
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				Modules:      []string{"api/internal/modules/project", "web/src/features/project"},
				CIWorkflows:  []string{".github/workflows/ci.yml"},
				CreatedAt:    nowUTC(),
			},
		},
	}
	skills := &memorySkillStore{
		skills: map[string][]*domain.SpecForgeSkill{
			"repo_1": {
				{
					ID:           20,
					RepositoryID: "repo_1",
					Name:         "module-boundaries",
					Content:      "Keep API and web contracts explicit.",
					Active:       true,
				},
				{
					ID:           21,
					RepositoryID: "repo_1",
					Name:         "inactive",
					Content:      "Do not include.",
					Active:       false,
				},
			},
		},
	}
	svc := NewService(store, workspaces, github, profiles, skills, nil, nil, nil, nil)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_2",
		Role:         domain.ProjectRepositoryRoleDependency,
	})
	require.NoError(t, err)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Len(t, contextBundle.RepositoryContexts, 2)
	repoOneContext := projectRepoContextByRepositoryID(contextBundle, "repo_1")
	require.NotNil(t, repoOneContext)
	require.NotNil(t, repoOneContext.Profile)
	require.Equal(t, []string{"Go", "Next.js"}, repoOneContext.Profile.Stack)
	require.Len(t, repoOneContext.Skills, 1)
	require.Equal(t, "module-boundaries", repoOneContext.Skills[0].Name)
	require.NotNil(t, repoOneContext.ArchitectureSnapshot)
	require.False(t, repoOneContext.ArchitectureStale)
	require.Contains(t, repoOneContext.ArchitectureSnapshot.Modules, "api/internal/modules/project")
	repoTwoContext := projectRepoContextByRepositoryID(contextBundle, "repo_2")
	require.NotNil(t, repoTwoContext)
	require.Nil(t, repoTwoContext.Profile)
	require.Contains(t, repoTwoContext.Warnings, "Repo profile has not been generated yet.")
	require.True(t, repoTwoContext.ArchitectureStale)
	require.Contains(t, repoTwoContext.ArchitectureWarnings, "Architecture snapshot has not been generated yet.")
	require.Equal(t, "repo_1", contextBundle.PrimaryRepositoryID)
	require.Equal(t, "repo_1", contextBundle.ExecutionRepositoryID)
	require.Equal(t, []string{"repo_2"}, contextBundle.ReadOnlyRepositoryIDs)
	require.Contains(t, contextBundle.ExecutionGuardrails, "Executor must modify only repo_1; other bound repositories are read-only context.")
	require.NotNil(t, contextBundle.Readiness)
	require.True(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 2, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.SkillCount)
	require.Equal(t, 2, contextBundle.Readiness.WarningCount)
	require.Equal(t, contextBundle.ExecutionGuardrails, contextBundle.Readiness.Guardrails)
	require.Contains(t, contextBundle.Readiness.Summary, "repo_1")
	require.Equal(t, "Review repository context warnings before approving execution.", contextBundle.Readiness.NextAction)
	require.NotNil(t, contextBundle.ContextContract)
	require.Equal(t, "project_context_contract_v1", contextBundle.ContextContract.Version)
	require.Equal(t, []string{"repo_2"}, contextBundle.ContextContract.ReadOnlyRepositoryIDs)
	require.Equal(t, []string{"module-boundaries"}, contextBundle.ContextContract.SkillNames)
	require.Contains(t, contextBundle.ContextContract.MissingEvidence, "repo_profile:repo_2")
	require.Contains(t, contextBundle.ContextContract.MissingEvidence, "architecture_snapshot:repo_2")
	require.Len(t, contextBundle.ContextContract.Repositories, 2)
	repoOneContract := projectRepoContractByRepositoryID(contextBundle.ContextContract, "repo_1")
	require.NotNil(t, repoOneContract)
	require.True(t, repoOneContract.Writable)
	require.Contains(t, repoOneContract.Stack, "Go")
	require.Contains(t, repoOneContract.TestCommands, "go test ./...")
	require.Contains(t, repoOneContract.ArchitectureModules, "api/internal/modules/project")
	repoTwoContract := projectRepoContractByRepositoryID(contextBundle.ContextContract, "repo_2")
	require.NotNil(t, repoTwoContract)
	require.False(t, repoTwoContract.Writable)
}

func TestServiceProjectContextReadinessRequiresPrimaryRepository(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, nil)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRoleDependency,
	})
	require.NoError(t, err)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.Empty(t, contextBundle.PrimaryRepositoryID)
	require.NotNil(t, contextBundle.Readiness)
	require.False(t, contextBundle.Readiness.HasPrimaryRepository)
	require.Equal(t, 1, contextBundle.Readiness.ActiveRepositoryCount)
	require.Equal(t, 1, contextBundle.Readiness.ReadOnlyRepositoryCount)
	require.Equal(t, 0, contextBundle.Readiness.SkillCount)
	require.Equal(t, 0, contextBundle.Readiness.WarningCount)
	require.Contains(t, contextBundle.Readiness.Guardrails, "Project must bind one active primary repository before planning or execution.")
	require.Equal(t, "Bind one active primary repository before generating a plan.", contextBundle.Readiness.NextAction)
}

func TestServiceRejectsSecondPrimaryRepository(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
			"repo_2": {RepositoryID: "repo_2", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, nil)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_2",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestServiceRejectsCrossWorkspaceRepository(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1", "workspace_2")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_2"},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, nil)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)

	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.ErrorIs(t, err, domain.ErrPermissionDenied)
}

func TestServiceCreateProjectResolvesCanonicalWorkspaceID(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("local_test")
	svc := NewService(store, workspaces, &memoryGitHubRepositoryStore{}, nil, nil, nil, nil, nil, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "local-test",
		Name:        "CodingCTO Local Flow",
		Slug:        "codingcto-local-flow",
	})
	require.NoError(t, err)
	require.Equal(t, "local_test", project.WorkspaceID)

	projects, err := svc.ListProjects(context.Background(), "local-test")
	require.NoError(t, err)
	require.Len(t, projects, 1)
	require.Equal(t, "local_test", projects[0].WorkspaceID)
}

func TestServiceRejectsProjectForMissingWorkspace(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	svc := NewService(store, workspaces, &memoryGitHubRepositoryStore{}, nil, nil, nil, nil, nil, nil)

	_, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "missing-workspace",
		Name:        "Ghost Project",
		Slug:        "ghost-project",
	})
	require.ErrorIs(t, err, domain.ErrNotFound)

	_, err = svc.ListProjects(context.Background(), "missing-workspace")
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestServiceUpdatesProjectFieldsAndSlug(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	svc := NewService(store, workspaces, &memoryGitHubRepositoryStore{}, nil, nil, nil, nil, nil, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
		Description: "Initial description",
	})
	require.NoError(t, err)
	_, err = svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "Existing",
		Slug:        "existing",
	})
	require.NoError(t, err)

	name := "CodingCTO Project"
	slug := "CodingCTO-Project"
	description := "Updated description"
	status := domain.ProjectStatusArchived
	updated, err := svc.UpdateProject(context.Background(), project.ID, &UpdateProjectRequest{
		Name:        &name,
		Slug:        &slug,
		Description: &description,
		Status:      &status,
	})
	require.NoError(t, err)
	require.Equal(t, "CodingCTO Project", updated.Name)
	require.Equal(t, "codingcto-project", updated.Slug)
	require.Equal(t, "Updated description", updated.Description)
	require.Equal(t, domain.ProjectStatusArchived, updated.Status)

	duplicateSlug := "existing"
	_, err = svc.UpdateProject(context.Background(), project.ID, &UpdateProjectRequest{Slug: &duplicateSlug})
	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestServiceDeletesProjectAndRepositoryBindings(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	require.NoError(t, svc.DeleteProject(context.Background(), project.ID))
	_, err = svc.GetProject(context.Background(), project.ID)
	require.ErrorIs(t, err, domain.ErrNotFound)
	repositories, err := store.ListProjectRepositories(context.Background(), project.ID)
	require.NoError(t, err)
	require.Empty(t, repositories)
	require.ErrorIs(t, svc.DeleteProject(context.Background(), project.ID), domain.ErrNotFound)
}

func TestServiceProjectReadinessBecomesReadyWhenSetupSignalsPass(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Summary:       "Primary repo ready.",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				CreatedAt:    nowUTC(),
			},
		},
	}
	projectSkills := &fakeProjectSkillStore{
		skills: map[uint][]*domain.SpecForgeProjectSkill{
			1: {
				{
					ID:           10,
					ProjectID:    1,
					RepositoryID: "repo_1",
					SkillID:      50,
					Active:       true,
				},
			},
		},
	}
	githubReadiness := &fakeGitHubReadinessChecker{
		response: &githubintegration.GitHubRepositoryReadinessResponse{
			RepositoryID: "repo_1",
			Ready:        true,
			Checks: []githubintegration.GitHubReadinessCheck{
				{Key: "installation", Status: "ok", Message: "Installation ready", Required: true},
			},
		},
	}
	runtimes := &fakeRuntimeReadinessStore{
		runtimes: []*domain.SpecForgeRuntime{
			{
				RuntimeID:  "runtime_1",
				Executor:   "codex_cli",
				Status:     domain.RuntimeStatusOnline,
				LastSeenAt: nowUTC(),
			},
		},
	}
	svc := NewService(store, workspaces, github, profiles, &memorySkillStore{}, projectSkills, githubReadiness, runtimes, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)
	_, err = svc.CreateProjectRuntimeBinding(context.Background(), 42, project.ID, &UpsertProjectRuntimeBindingRequest{
		RepositoryID: "repo_1",
		RuntimeID:    "runtime_1",
		RepoDir:      "/Users/mingde/item/codingcto",
	})
	require.NoError(t, err)
	_, err = svc.CreateProjectExpertPolicy(context.Background(), 42, project.ID, &UpsertProjectExpertPolicyRequest{
		GoalBoundary: "Only touch the project delivery flow.",
		ReviewPolicy: ProjectExpertReviewPolicyRequest{
			RequiredApprovals:       1,
			BlockOnChangesRequested: true,
			RequireCIGreen:          true,
		},
		MergePolicy: ProjectExpertMergePolicyRequest{
			Strategy:              domain.ProjectMergeStrategySquash,
			RequireManualApproval: true,
		},
	})
	require.NoError(t, err)

	readiness, err := svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStatusReady, readiness.ReadinessStatus)
	require.Equal(t, domain.ProjectReadinessStepCreateRequirement, readiness.NextStep)
	require.Equal(t, 1, readiness.SkillCount)
	require.Equal(t, 1, readiness.RuntimeCount)
	require.True(t, readiness.HasPrimaryRepository)
	require.Len(t, readiness.Checks, 6)
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "github_delivery"))
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "runtime_dispatch"))
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "skill_contract"))
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "expert_policy"))
}

func TestServiceProjectReadinessBlocksOnGitHubBeforeOtherWarnings(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	svc := NewService(
		store,
		workspaces,
		github,
		nil,
		nil,
		nil,
		&fakeGitHubReadinessChecker{
			response: &githubintegration.GitHubRepositoryReadinessResponse{
				RepositoryID: "repo_1",
				Ready:        false,
				Checks: []githubintegration.GitHubReadinessCheck{
					{
						Key:      "installation",
						Status:   "error",
						Message:  "Missing installation",
						Detail:   "Install and sync the GitHub App first.",
						Required: true,
					},
				},
			},
		},
		&fakeRuntimeReadinessStore{},
		nil,
	)
	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "SpecForge",
		Slug:        "specforge",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	readiness, err := svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStatusBlocked, readiness.ReadinessStatus)
	require.Equal(t, domain.ProjectReadinessStepConfigureGitHub, readiness.NextStep)
	require.Contains(t, readiness.NextAction, "GitHub setup")
	require.Equal(t, domain.ProjectReadinessStatusBlocked, readinessCheckStatusByKey(t, readiness, "github_delivery"))
}

func TestServiceRefreshProjectContextPersistsUnifiedSnapshot(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {
				RepositoryID: "repo_1",
				WorkspaceID:  "workspace_1",
				GitHubOwner:  "agicto",
				GitHubRepo:   "codingcto",
			},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				ID:            10,
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Summary:       "Primary application repository.",
				Source:        "repo_context_service",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				ID:           22,
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				Summary:      "DDD module layout with Next.js console.",
				CreatedAt:    nowUTC(),
			},
		},
	}
	skills := &memorySkillStore{
		skills: map[string][]*domain.SpecForgeSkill{
			"repo_1": {
				{
					ID:           7,
					RepositoryID: "repo_1",
					Name:         "module-boundaries",
					Content:      "Keep API and web contracts explicit.",
					Active:       true,
				},
			},
		},
	}
	lastIndexedAt := nowUTC()
	deepwikiStore := &fakeDeepWikiStore{
		sources: []*domain.DeepWikiSource{
			{
				ID:            50,
				CreatedBy:     42,
				SourceType:    domain.DeepWikiSourceTypeGitHubURL,
				RepoURL:       "https://github.com/agicto/codingcto",
				Status:        domain.DeepWikiStatusReady,
				LastIndexedAt: &lastIndexedAt,
			},
		},
		indexes: map[uint]*domain.DeepWikiIndex{
			50: {
				ID:          60,
				SourceID:    50,
				CommitSHA:   "abc123",
				FileCount:   120,
				ChunkCount:  420,
				Frameworks:  []string{"gin", "next.js"},
				Entrypoints: []string{"cmd/server/main.go"},
				Services:    []string{"project", "planning"},
				Models:      []string{"specforge_projects"},
				Status:      domain.DeepWikiStatusReady,
			},
		},
		pages: map[uint][]*domain.DeepWikiPage{
			60: {
				{ID: 70, IndexID: 60, Slug: "overview", Title: "Repository overview"},
				{ID: 71, IndexID: 60, Slug: "architecture", Title: "Architecture"},
			},
		},
	}
	svc := NewService(store, workspaces, github, profiles, skills, nil, nil, nil, deepwikiStore)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	snapshot, err := svc.RefreshProjectContext(context.Background(), 42, project.ID)
	require.NoError(t, err)
	require.NotZero(t, snapshot.ID)
	require.Equal(t, domain.ProjectReadinessStatusReady, snapshot.SnapshotStatus)
	require.Equal(t, "repo_1", snapshot.PrimaryRepositoryID)
	require.Contains(t, snapshot.EvidenceRefs, "repo_profile:repo_1")
	require.Contains(t, snapshot.EvidenceRefs, "architecture_snapshot:repo_1:abc123")
	require.Contains(t, snapshot.EvidenceRefs, "deepwiki_source:50")
	require.Contains(t, snapshot.EvidenceRefs, "deepwiki_index:60")
	require.Len(t, snapshot.Repositories, 1)
	require.NotNil(t, snapshot.Repositories[0].DeepWiki)
	require.Equal(t, 2, snapshot.Repositories[0].DeepWiki.PageCount)
	require.Equal(t, []string{"Repository overview", "Architecture"}, snapshot.Repositories[0].DeepWiki.TopPages)

	contextBundle, err := svc.GetProjectContext(context.Background(), project.ID)
	require.NoError(t, err)
	require.NotNil(t, contextBundle.LatestSnapshot)
	require.Equal(t, snapshot.ID, contextBundle.LatestSnapshot.ID)
}

func TestServiceRefreshProjectContextMarksMissingDeepWikiEvidence(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {
				RepositoryID: "repo_1",
				WorkspaceID:  "workspace_1",
				GitHubOwner:  "agicto",
				GitHubRepo:   "codingcto",
			},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, nil, &fakeDeepWikiStore{})

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	snapshot, err := svc.RefreshProjectContext(context.Background(), 42, project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStatusAttention, snapshot.SnapshotStatus)
	require.Contains(t, snapshot.MissingEvidence, "deepwiki_index:repo_1")
	require.Contains(t, snapshot.Summary, "no DeepWiki index matched")
}

func TestServiceCreateAndUpdateProjectExpertPolicyVersions(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	svc := NewService(store, workspaces, &memoryGitHubRepositoryStore{}, nil, nil, nil, nil, nil, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)

	created, err := svc.CreateProjectExpertPolicy(context.Background(), 42, project.ID, &UpsertProjectExpertPolicyRequest{
		GoalBoundary:         "Only touch the project delivery flow.",
		AllowedPaths:         []string{"api/internal/modules/project", "web/src/features/project"},
		ForbiddenPaths:       []string{"api/internal/modules/execution"},
		RequiredTestCommands: []string{"cd api && go test ./internal/modules/project"},
		ReviewPolicy: ProjectExpertReviewPolicyRequest{
			RequiredApprovals:       1,
			AllowAuthorApproval:     false,
			BlockOnChangesRequested: true,
			RequireCIGreen:          true,
		},
		MergePolicy: ProjectExpertMergePolicyRequest{
			Strategy:              domain.ProjectMergeStrategySquash,
			RequireManualApproval: true,
			AllowAutoMerge:        false,
		},
	})
	require.NoError(t, err)
	require.Equal(t, 1, created.Version)
	require.True(t, created.Active)
	require.Equal(t, []string{"api/internal/modules/project", "web/src/features/project"}, created.AllowedPaths)

	loaded, err := svc.GetProjectExpertPolicy(context.Background(), project.ID)
	require.NoError(t, err)
	require.NotNil(t, loaded)
	require.Equal(t, created.ID, loaded.ID)

	updated, err := svc.UpdateProjectExpertPolicy(context.Background(), 42, project.ID, created.ID, &UpsertProjectExpertPolicyRequest{
		GoalBoundary:         "Limit work to project setup and review rules.",
		AllowedPaths:         []string{"api/internal/modules/project"},
		ForbiddenPaths:       []string{"api/internal/modules/execution", "web/src/features/specforge"},
		RequiredTestCommands: []string{"cd api && go test ./...", "cd web && pnpm type-check"},
		ReviewPolicy: ProjectExpertReviewPolicyRequest{
			RequiredApprovals:       2,
			AllowAuthorApproval:     false,
			BlockOnChangesRequested: true,
			RequireCIGreen:          true,
		},
		MergePolicy: ProjectExpertMergePolicyRequest{
			Strategy:              domain.ProjectMergeStrategyRebase,
			RequireManualApproval: true,
			AllowAutoMerge:        false,
		},
	})
	require.NoError(t, err)
	require.Equal(t, 2, updated.Version)
	require.True(t, updated.Active)
	require.Equal(t, domain.ProjectMergeStrategyRebase, updated.MergePolicy.Strategy)

	history, ok := store.policies[project.ID]
	require.True(t, ok)
	require.Len(t, history, 2)
	require.False(t, history[0].Active)
	require.True(t, history[1].Active)
}

func TestServiceCreateAndUpdateProjectRuntimeBinding(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	runtimes := &fakeRuntimeReadinessStore{
		runtimes: []*domain.SpecForgeRuntime{
			{
				RuntimeID:  "runtime_1",
				Executor:   "codex_cli",
				Status:     domain.RuntimeStatusOnline,
				LastSeenAt: nowUTC(),
				Sandbox:    &domain.SpecForgeRuntimeSandbox{Writable: true},
			},
			{
				RuntimeID:  "runtime_2",
				Executor:   "codex_cli",
				Status:     domain.RuntimeStatusOnline,
				LastSeenAt: nowUTC(),
				Sandbox:    &domain.SpecForgeRuntimeSandbox{Writable: true},
			},
		},
	}
	svc := NewService(store, workspaces, github, nil, nil, nil, nil, runtimes, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	created, err := svc.CreateProjectRuntimeBinding(context.Background(), 42, project.ID, &UpsertProjectRuntimeBindingRequest{
		RepositoryID: "repo_1",
		RuntimeID:    "runtime_1",
		RepoDir:      "/Users/mingde/item/codingcto",
	})
	require.NoError(t, err)
	require.NotNil(t, created)
	require.True(t, created.Eligible)
	require.Equal(t, "runtime_1", created.Binding.RuntimeID)

	updated, err := svc.UpdateProjectRuntimeBinding(context.Background(), 42, project.ID, created.Binding.ID, &UpsertProjectRuntimeBindingRequest{
		RepositoryID: "repo_1",
		RuntimeID:    "runtime_2",
		RepoDir:      "/Users/mingde/item/codingcto/api",
	})
	require.NoError(t, err)
	require.NotNil(t, updated)
	require.True(t, updated.Eligible)
	require.Equal(t, "runtime_2", updated.Binding.RuntimeID)
	require.Equal(t, "/Users/mingde/item/codingcto/api", updated.Binding.RepoDir)

	bindings, err := svc.ListProjectRuntimeBindings(context.Background(), project.ID)
	require.NoError(t, err)
	require.Len(t, bindings, 1)
	require.Equal(t, "runtime_2", bindings[0].Binding.RuntimeID)
}

func TestServiceProjectReadinessRequiresRuntimeBindingBeforeExpertPolicy(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Summary:       "Primary repo ready.",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				CreatedAt:    nowUTC(),
			},
		},
	}
	projectSkills := &fakeProjectSkillStore{
		skills: map[uint][]*domain.SpecForgeProjectSkill{
			1: {
				{ID: 10, ProjectID: 1, RepositoryID: "repo_1", SkillID: 50, Active: true},
			},
		},
	}
	githubReadiness := &fakeGitHubReadinessChecker{
		response: &githubintegration.GitHubRepositoryReadinessResponse{
			RepositoryID: "repo_1",
			Ready:        true,
		},
	}
	runtimes := &fakeRuntimeReadinessStore{
		runtimes: []*domain.SpecForgeRuntime{
			{
				RuntimeID:  "runtime_1",
				Executor:   "codex_cli",
				Status:     domain.RuntimeStatusOnline,
				LastSeenAt: nowUTC(),
				Sandbox:    &domain.SpecForgeRuntimeSandbox{Writable: true},
			},
		},
	}
	svc := NewService(store, workspaces, github, profiles, &memorySkillStore{}, projectSkills, githubReadiness, runtimes, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)

	readiness, err := svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStepConnectRuntime, readiness.NextStep)
	require.Equal(t, domain.ProjectReadinessStatusBlocked, readinessCheckStatusByKey(t, readiness, "runtime_dispatch"))

	_, err = svc.CreateProjectRuntimeBinding(context.Background(), 42, project.ID, &UpsertProjectRuntimeBindingRequest{
		RepositoryID: "repo_1",
		RuntimeID:    "runtime_1",
		RepoDir:      "/Users/mingde/item/codingcto",
	})
	require.NoError(t, err)

	readiness, err = svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStepConfigureExpertPolicy, readiness.NextStep)
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "runtime_dispatch"))
}

func TestServiceProjectReadinessRequiresExpertPolicyBeforeRequirement(t *testing.T) {
	store := newMemoryProjectStore()
	workspaces := newMemoryWorkspaceStore("workspace_1")
	github := &memoryGitHubRepositoryStore{
		repositories: map[string]*domain.Repository{
			"repo_1": {RepositoryID: "repo_1", WorkspaceID: "workspace_1"},
		},
	}
	profiles := &memoryRepoProfileStore{
		profiles: map[string]*domain.SpecForgeRepoProfile{
			"repo_1": {
				RepositoryID:  "repo_1",
				DefaultBranch: "main",
				Summary:       "Primary repo ready.",
			},
		},
		snapshots: map[string]*domain.SpecForgeRepoArchitectureSnapshot{
			"repo_1": {
				RepositoryID: "repo_1",
				CommitSHA:    "abc123",
				CreatedAt:    nowUTC(),
			},
		},
	}
	projectSkills := &fakeProjectSkillStore{
		skills: map[uint][]*domain.SpecForgeProjectSkill{
			1: {
				{ID: 10, ProjectID: 1, RepositoryID: "repo_1", SkillID: 50, Active: true},
			},
		},
	}
	githubReadiness := &fakeGitHubReadinessChecker{
		response: &githubintegration.GitHubRepositoryReadinessResponse{
			RepositoryID: "repo_1",
			Ready:        true,
		},
	}
	runtimes := &fakeRuntimeReadinessStore{
		runtimes: []*domain.SpecForgeRuntime{
			{RuntimeID: "runtime_1", Executor: "codex_cli", Status: domain.RuntimeStatusOnline, LastSeenAt: nowUTC()},
		},
	}
	svc := NewService(store, workspaces, github, profiles, &memorySkillStore{}, projectSkills, githubReadiness, runtimes, nil)

	project, err := svc.CreateProject(context.Background(), 42, &CreateProjectRequest{
		WorkspaceID: "workspace_1",
		Name:        "CodingCTO",
		Slug:        "codingcto",
	})
	require.NoError(t, err)
	_, err = svc.BindRepository(context.Background(), 42, project.ID, &BindRepositoryRequest{
		RepositoryID: "repo_1",
		Role:         domain.ProjectRepositoryRolePrimary,
	})
	require.NoError(t, err)
	_, err = svc.CreateProjectRuntimeBinding(context.Background(), 42, project.ID, &UpsertProjectRuntimeBindingRequest{
		RepositoryID: "repo_1",
		RuntimeID:    "runtime_1",
		RepoDir:      "/Users/mingde/item/codingcto",
	})
	require.NoError(t, err)

	readiness, err := svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStepConfigureExpertPolicy, readiness.NextStep)
	require.Equal(t, domain.ProjectReadinessStatusBlocked, readinessCheckStatusByKey(t, readiness, "expert_policy"))

	_, err = svc.CreateProjectExpertPolicy(context.Background(), 42, project.ID, &UpsertProjectExpertPolicyRequest{
		GoalBoundary: "Only change project delivery and review flow.",
		ReviewPolicy: ProjectExpertReviewPolicyRequest{
			RequiredApprovals:       1,
			BlockOnChangesRequested: true,
			RequireCIGreen:          true,
		},
		MergePolicy: ProjectExpertMergePolicyRequest{
			Strategy:              domain.ProjectMergeStrategySquash,
			RequireManualApproval: true,
		},
	})
	require.NoError(t, err)

	readiness, err = svc.GetProjectReadiness(context.Background(), project.ID)
	require.NoError(t, err)
	require.Equal(t, domain.ProjectReadinessStepCreateRequirement, readiness.NextStep)
	require.Equal(t, domain.ProjectReadinessStatusReady, readinessCheckStatusByKey(t, readiness, "expert_policy"))
}

type memoryProjectStore struct {
	nextProjectID  uint
	nextBindingID  uint
	nextSnapshotID uint
	nextPolicyID   uint
	projects       map[uint]*domain.SpecForgeProject
	bindings       map[uint]map[string]*domain.SpecForgeProjectRepository
	snapshots      map[uint][]*domain.SpecForgeProjectContextSnapshot
	policies       map[uint][]*domain.SpecForgeProjectExpertPolicy
}

type fakeGitHubReadinessChecker struct {
	response *githubintegration.GitHubRepositoryReadinessResponse
	err      error
}

func (f *fakeGitHubReadinessChecker) CheckRepositoryReadiness(_ context.Context, _ string) (*githubintegration.GitHubRepositoryReadinessResponse, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.response, nil
}

type fakeRuntimeReadinessStore struct {
	nextBindingID uint
	runtimes      []*domain.SpecForgeRuntime
	bindings      map[uint][]*domain.SpecForgeProjectRuntimeBinding
	err           error
}

func (f *fakeRuntimeReadinessStore) ListRuntimes(_ context.Context, _, _ string, _ int) ([]*domain.SpecForgeRuntime, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make([]*domain.SpecForgeRuntime, 0, len(f.runtimes))
	for _, runtime := range f.runtimes {
		if runtime == nil {
			continue
		}
		copied := *runtime
		out = append(out, &copied)
	}
	return out, nil
}

func (f *fakeRuntimeReadinessStore) FindRuntimeByRuntimeID(_ context.Context, runtimeID string) (*domain.SpecForgeRuntime, error) {
	if f.err != nil {
		return nil, f.err
	}
	runtimeID = strings.TrimSpace(runtimeID)
	for _, runtime := range f.runtimes {
		if runtime == nil || strings.TrimSpace(runtime.RuntimeID) != runtimeID {
			continue
		}
		copied := *runtime
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (f *fakeRuntimeReadinessStore) CreateProjectRuntimeBinding(_ context.Context, binding *domain.SpecForgeProjectRuntimeBinding) error {
	if f.bindings == nil {
		f.bindings = map[uint][]*domain.SpecForgeProjectRuntimeBinding{}
	}
	f.nextBindingID++
	copied := cloneProjectRuntimeBinding(binding)
	copied.ID = f.nextBindingID
	copied.CreatedAt = nowUTC()
	copied.UpdatedAt = copied.CreatedAt
	f.bindings[binding.ProjectID] = append(f.bindings[binding.ProjectID], copied)
	*binding = *cloneProjectRuntimeBinding(copied)
	return nil
}

func (f *fakeRuntimeReadinessStore) UpdateProjectRuntimeBinding(_ context.Context, binding *domain.SpecForgeProjectRuntimeBinding) error {
	items := f.bindings[binding.ProjectID]
	for index, item := range items {
		if item == nil || item.ID != binding.ID {
			continue
		}
		copied := cloneProjectRuntimeBinding(binding)
		copied.CreatedAt = item.CreatedAt
		copied.UpdatedAt = nowUTC()
		f.bindings[binding.ProjectID][index] = copied
		*binding = *cloneProjectRuntimeBinding(copied)
		return nil
	}
	return domain.ErrNotFound
}

func (f *fakeRuntimeReadinessStore) FindProjectRuntimeBindingByID(_ context.Context, bindingID uint) (*domain.SpecForgeProjectRuntimeBinding, error) {
	for _, items := range f.bindings {
		for _, binding := range items {
			if binding == nil || binding.ID != bindingID {
				continue
			}
			return cloneProjectRuntimeBinding(binding), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *fakeRuntimeReadinessStore) ListProjectRuntimeBindingsByProjectID(_ context.Context, projectID uint) ([]*domain.SpecForgeProjectRuntimeBinding, error) {
	items := f.bindings[projectID]
	out := make([]*domain.SpecForgeProjectRuntimeBinding, 0, len(items))
	for _, binding := range items {
		out = append(out, cloneProjectRuntimeBinding(binding))
	}
	return out, nil
}

type fakeProjectSkillStore struct {
	skills map[uint][]*domain.SpecForgeProjectSkill
}

func (f *fakeProjectSkillStore) ListActiveProjectSkillsByProjectID(_ context.Context, projectID uint) ([]*domain.SpecForgeProjectSkill, error) {
	out := make([]*domain.SpecForgeProjectSkill, 0, len(f.skills[projectID]))
	for _, skill := range f.skills[projectID] {
		if skill == nil || !skill.Active {
			continue
		}
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}

type fakeDeepWikiStore struct {
	sources []*domain.DeepWikiSource
	indexes map[uint]*domain.DeepWikiIndex
	pages   map[uint][]*domain.DeepWikiPage
	err     error
}

func (f *fakeDeepWikiStore) ListSources(_ context.Context, filter domain.DeepWikiSourceFilter, page, pageSize int) ([]*domain.DeepWikiSource, int64, error) {
	if f.err != nil {
		return nil, 0, f.err
	}
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = len(f.sources)
	}
	filtered := make([]*domain.DeepWikiSource, 0, len(f.sources))
	for _, source := range f.sources {
		if source == nil {
			continue
		}
		if filter.CreatedBy > 0 && source.CreatedBy != filter.CreatedBy {
			continue
		}
		copied := *source
		filtered = append(filtered, &copied)
	}
	start := (page - 1) * pageSize
	if start >= len(filtered) {
		return []*domain.DeepWikiSource{}, int64(len(filtered)), nil
	}
	end := start + pageSize
	if end > len(filtered) {
		end = len(filtered)
	}
	return filtered[start:end], int64(len(filtered)), nil
}

func (f *fakeDeepWikiStore) FindLatestIndexBySourceID(_ context.Context, sourceID uint) (*domain.DeepWikiIndex, error) {
	if f.err != nil {
		return nil, f.err
	}
	index, ok := f.indexes[sourceID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *index
	return &copied, nil
}

func (f *fakeDeepWikiStore) ListPagesByIndexID(_ context.Context, indexID uint) ([]*domain.DeepWikiPage, error) {
	if f.err != nil {
		return nil, f.err
	}
	out := make([]*domain.DeepWikiPage, 0, len(f.pages[indexID]))
	for _, page := range f.pages[indexID] {
		if page == nil {
			continue
		}
		copied := *page
		out = append(out, &copied)
	}
	return out, nil
}

func newMemoryProjectStore() *memoryProjectStore {
	return &memoryProjectStore{
		nextProjectID:  1,
		nextBindingID:  1,
		nextSnapshotID: 1,
		nextPolicyID:   1,
		projects:       map[uint]*domain.SpecForgeProject{},
		bindings:       map[uint]map[string]*domain.SpecForgeProjectRepository{},
		snapshots:      map[uint][]*domain.SpecForgeProjectContextSnapshot{},
		policies:       map[uint][]*domain.SpecForgeProjectExpertPolicy{},
	}
}

func (s *memoryProjectStore) CreateProject(_ context.Context, project *domain.SpecForgeProject) error {
	project.ID = s.nextProjectID
	s.nextProjectID++
	s.projects[project.ID] = cloneProject(project)
	return nil
}

func (s *memoryProjectStore) UpdateProject(_ context.Context, project *domain.SpecForgeProject) error {
	if _, ok := s.projects[project.ID]; !ok {
		return domain.ErrNotFound
	}
	s.projects[project.ID] = cloneProject(project)
	return nil
}

func (s *memoryProjectStore) DeleteProject(_ context.Context, projectID uint) error {
	if _, ok := s.projects[projectID]; !ok {
		return domain.ErrNotFound
	}
	delete(s.projects, projectID)
	delete(s.bindings, projectID)
	delete(s.snapshots, projectID)
	delete(s.policies, projectID)
	return nil
}

func (s *memoryProjectStore) FindProjectByID(_ context.Context, id uint) (*domain.SpecForgeProject, error) {
	project, ok := s.projects[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return cloneProject(project), nil
}

func (s *memoryProjectStore) FindProjectByWorkspaceAndSlug(_ context.Context, workspaceID, slug string) (*domain.SpecForgeProject, error) {
	for _, project := range s.projects {
		if project.WorkspaceID == workspaceID && project.Slug == slug {
			return cloneProject(project), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) ListProjectsByWorkspace(_ context.Context, workspaceID string) ([]*domain.SpecForgeProject, error) {
	var projects []*domain.SpecForgeProject
	for _, project := range s.projects {
		if project.WorkspaceID == workspaceID {
			projects = append(projects, cloneProject(project))
		}
	}
	return projects, nil
}

func (s *memoryProjectStore) CreateProjectRepository(_ context.Context, binding *domain.SpecForgeProjectRepository) error {
	if s.bindings[binding.ProjectID] == nil {
		s.bindings[binding.ProjectID] = map[string]*domain.SpecForgeProjectRepository{}
	}
	if _, ok := s.bindings[binding.ProjectID][binding.RepositoryID]; ok {
		return domain.ErrConflict
	}
	binding.ID = s.nextBindingID
	s.nextBindingID++
	s.bindings[binding.ProjectID][binding.RepositoryID] = cloneBinding(binding)
	return nil
}

func (s *memoryProjectStore) DeleteProjectRepository(_ context.Context, projectID uint, repositoryID string) error {
	delete(s.bindings[projectID], repositoryID)
	return nil
}

func (s *memoryProjectStore) FindProjectRepository(_ context.Context, projectID uint, repositoryID string) (*domain.SpecForgeProjectRepository, error) {
	if binding, ok := s.bindings[projectID][repositoryID]; ok {
		return cloneBinding(binding), nil
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) ListProjectRepositories(_ context.Context, projectID uint) ([]*domain.SpecForgeProjectRepository, error) {
	var bindings []*domain.SpecForgeProjectRepository
	for _, binding := range s.bindings[projectID] {
		bindings = append(bindings, cloneBinding(binding))
	}
	sort.Slice(bindings, func(i, j int) bool {
		if bindings[i].Role == bindings[j].Role {
			return bindings[i].ID < bindings[j].ID
		}
		return bindings[i].Role < bindings[j].Role
	})
	return bindings, nil
}

func (s *memoryProjectStore) CountActiveProjectRepositories(_ context.Context, projectID uint) (int64, error) {
	var count int64
	for _, binding := range s.bindings[projectID] {
		if binding.Active {
			count++
		}
	}
	return count, nil
}

func (s *memoryProjectStore) FindActivePrimaryProjectRepository(_ context.Context, projectID uint) (*domain.SpecForgeProjectRepository, error) {
	for _, binding := range s.bindings[projectID] {
		if binding.Active && binding.Role == domain.ProjectRepositoryRolePrimary {
			return cloneBinding(binding), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) CreateProjectContextSnapshot(_ context.Context, snapshot *domain.SpecForgeProjectContextSnapshot) error {
	if snapshot == nil {
		return domain.ErrInvalidInput
	}
	copied := cloneProjectContextSnapshot(snapshot)
	copied.ID = s.nextSnapshotID
	s.nextSnapshotID++
	s.snapshots[copied.ProjectID] = append(s.snapshots[copied.ProjectID], copied)
	*snapshot = *cloneProjectContextSnapshot(copied)
	return nil
}

func (s *memoryProjectStore) FindLatestProjectContextSnapshot(_ context.Context, projectID uint) (*domain.SpecForgeProjectContextSnapshot, error) {
	candidates := s.snapshots[projectID]
	if len(candidates) == 0 {
		return nil, domain.ErrNotFound
	}
	return cloneProjectContextSnapshot(candidates[len(candidates)-1]), nil
}

func (s *memoryProjectStore) CreateProjectExpertPolicy(_ context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	if policy == nil {
		return domain.ErrInvalidInput
	}
	copied := cloneProjectExpertPolicy(policy)
	copied.ID = s.nextPolicyID
	s.nextPolicyID++
	s.policies[copied.ProjectID] = append(s.policies[copied.ProjectID], copied)
	*policy = *cloneProjectExpertPolicy(copied)
	return nil
}

func (s *memoryProjectStore) UpdateProjectExpertPolicy(_ context.Context, policy *domain.SpecForgeProjectExpertPolicy) error {
	if policy == nil {
		return domain.ErrInvalidInput
	}
	items := s.policies[policy.ProjectID]
	for index, existing := range items {
		if existing.ID != policy.ID {
			continue
		}
		s.policies[policy.ProjectID][index] = cloneProjectExpertPolicy(policy)
		*policy = *cloneProjectExpertPolicy(s.policies[policy.ProjectID][index])
		return nil
	}
	return domain.ErrNotFound
}

func (s *memoryProjectStore) FindProjectExpertPolicyByID(_ context.Context, id uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	for _, items := range s.policies {
		for _, policy := range items {
			if policy.ID == id {
				return cloneProjectExpertPolicy(policy), nil
			}
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) FindActiveProjectExpertPolicyByProjectID(_ context.Context, projectID uint) (*domain.SpecForgeProjectExpertPolicy, error) {
	items := s.policies[projectID]
	for index := len(items) - 1; index >= 0; index-- {
		if items[index].Active {
			return cloneProjectExpertPolicy(items[index]), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryProjectStore) ListProjectExpertPoliciesByProjectID(_ context.Context, projectID uint) ([]*domain.SpecForgeProjectExpertPolicy, error) {
	items := s.policies[projectID]
	out := make([]*domain.SpecForgeProjectExpertPolicy, 0, len(items))
	for _, policy := range items {
		out = append(out, cloneProjectExpertPolicy(policy))
	}
	return out, nil
}

type memoryWorkspaceStore struct {
	workspaces map[string]*domain.Workspace
}

func newMemoryWorkspaceStore(workspaceIDs ...string) *memoryWorkspaceStore {
	store := &memoryWorkspaceStore{workspaces: map[string]*domain.Workspace{}}
	for index, workspaceID := range workspaceIDs {
		normalizedID := domain.NormalizeWorkspaceID(workspaceID)
		store.workspaces[normalizedID] = &domain.Workspace{
			ID:          uint(index + 1),
			WorkspaceID: normalizedID,
			Name:        normalizedID,
			Slug:        strings.ReplaceAll(normalizedID, "_", "-"),
			Status:      domain.WorkspaceStatusActive,
			CreatedBy:   42,
		}
	}
	return store
}

func (s *memoryWorkspaceStore) CreateWorkspace(_ context.Context, workspace *domain.Workspace) error {
	if workspace == nil {
		return domain.ErrInvalidInput
	}
	workspaceID := domain.NormalizeWorkspaceID(workspace.WorkspaceID)
	if workspaceID == "" {
		return domain.ErrInvalidInput
	}
	if _, ok := s.workspaces[workspaceID]; ok {
		return domain.ErrConflict
	}
	copied := *workspace
	copied.ID = uint(len(s.workspaces) + 1)
	copied.WorkspaceID = workspaceID
	s.workspaces[workspaceID] = &copied
	*workspace = copied
	return nil
}

func (s *memoryWorkspaceStore) UpdateWorkspace(_ context.Context, workspace *domain.Workspace) error {
	if workspace == nil {
		return domain.ErrInvalidInput
	}
	workspaceID := domain.NormalizeWorkspaceID(workspace.WorkspaceID)
	if _, ok := s.workspaces[workspaceID]; !ok {
		return domain.ErrNotFound
	}
	copied := *workspace
	copied.WorkspaceID = workspaceID
	s.workspaces[workspaceID] = &copied
	return nil
}

func (s *memoryWorkspaceStore) FindWorkspaceByWorkspaceID(_ context.Context, workspaceID string) (*domain.Workspace, error) {
	workspace, ok := s.workspaces[domain.NormalizeWorkspaceID(workspaceID)]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *workspace
	return &copied, nil
}

func (s *memoryWorkspaceStore) FindWorkspaceBySlug(_ context.Context, slug string) (*domain.Workspace, error) {
	for _, workspace := range s.workspaces {
		if workspace.Slug == slug {
			copied := *workspace
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (s *memoryWorkspaceStore) ListWorkspaces(_ context.Context, createdBy uint, status string, _ int) ([]*domain.Workspace, error) {
	out := make([]*domain.Workspace, 0, len(s.workspaces))
	for _, workspace := range s.workspaces {
		if createdBy != 0 && workspace.CreatedBy != createdBy {
			continue
		}
		if status != "" && workspace.Status != status {
			continue
		}
		copied := *workspace
		out = append(out, &copied)
	}
	return out, nil
}

type memoryGitHubRepositoryStore struct {
	repositories map[string]*domain.Repository
}

func (s *memoryGitHubRepositoryStore) FindRepositoryByRepositoryID(_ context.Context, repositoryID string) (*domain.Repository, error) {
	repository, ok := s.repositories[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *repository
	return &copied, nil
}

func (s *memoryGitHubRepositoryStore) ListRepositoriesByWorkspaceID(_ context.Context, workspaceID string) ([]*domain.Repository, error) {
	out := make([]*domain.Repository, 0, len(s.repositories))
	for _, repository := range s.repositories {
		if repository.WorkspaceID != workspaceID {
			continue
		}
		copied := *repository
		out = append(out, &copied)
	}
	return out, nil
}

func (s *memoryGitHubRepositoryStore) UpsertInstallation(context.Context, *domain.GitHubInstallation) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindInstallationByID(context.Context, uint) (*domain.GitHubInstallation, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindInstallationByGitHubID(context.Context, int64) (*domain.GitHubInstallation, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) UpsertRepository(context.Context, *domain.Repository) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) UpsertSettings(context.Context, *domain.GitHubSettings) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindSettingsByWorkspaceID(context.Context, string) (*domain.GitHubSettings, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) CreateWebhookEvent(context.Context, *domain.GitHubWebhookEvent) error {
	return errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) FindWebhookEventByDeliveryID(context.Context, string) (*domain.GitHubWebhookEvent, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) ListWebhookEvents(context.Context, string, string, int) ([]*domain.GitHubWebhookEvent, error) {
	return nil, errors.New("not implemented")
}
func (s *memoryGitHubRepositoryStore) UpdateWebhookEventStatus(context.Context, string, string) error {
	return errors.New("not implemented")
}

func cloneProject(project *domain.SpecForgeProject) *domain.SpecForgeProject {
	copied := *project
	return &copied
}

func cloneBinding(binding *domain.SpecForgeProjectRepository) *domain.SpecForgeProjectRepository {
	copied := *binding
	return &copied
}

func cloneProjectContextSnapshot(snapshot *domain.SpecForgeProjectContextSnapshot) *domain.SpecForgeProjectContextSnapshot {
	if snapshot == nil {
		return nil
	}
	copied := *snapshot
	copied.MissingEvidence = append([]string(nil), snapshot.MissingEvidence...)
	copied.EvidenceRefs = append([]string(nil), snapshot.EvidenceRefs...)
	if snapshot.Readiness != nil {
		readiness := *snapshot.Readiness
		readiness.Guardrails = append([]string(nil), snapshot.Readiness.Guardrails...)
		copied.Readiness = &readiness
	}
	if snapshot.ContextContract != nil {
		contract := *snapshot.ContextContract
		contract.ReadOnlyRepositoryIDs = append([]string(nil), snapshot.ContextContract.ReadOnlyRepositoryIDs...)
		contract.SkillNames = append([]string(nil), snapshot.ContextContract.SkillNames...)
		contract.MissingEvidence = append([]string(nil), snapshot.ContextContract.MissingEvidence...)
		contract.Warnings = append([]string(nil), snapshot.ContextContract.Warnings...)
		contract.PromptGuardrails = append([]string(nil), snapshot.ContextContract.PromptGuardrails...)
		contract.Repositories = make([]*domain.SpecForgeRepositoryContextContractFragment, 0, len(snapshot.ContextContract.Repositories))
		for _, repository := range snapshot.ContextContract.Repositories {
			if repository == nil {
				continue
			}
			repoCopy := *repository
			repoCopy.Stack = append([]string(nil), repository.Stack...)
			repoCopy.TestCommands = append([]string(nil), repository.TestCommands...)
			repoCopy.RiskAreas = append([]string(nil), repository.RiskAreas...)
			repoCopy.CodingConventions = append([]string(nil), repository.CodingConventions...)
			repoCopy.ArchitectureModules = append([]string(nil), repository.ArchitectureModules...)
			repoCopy.ArchitectureEntrypoints = append([]string(nil), repository.ArchitectureEntrypoints...)
			repoCopy.ArchitectureCIWorkflows = append([]string(nil), repository.ArchitectureCIWorkflows...)
			repoCopy.SkillNames = append([]string(nil), repository.SkillNames...)
			contract.Repositories = append(contract.Repositories, &repoCopy)
		}
		copied.ContextContract = &contract
	}
	copied.Repositories = make([]*domain.SpecForgeProjectContextSnapshotRepository, 0, len(snapshot.Repositories))
	for _, repository := range snapshot.Repositories {
		if repository == nil {
			continue
		}
		repoCopy := *repository
		repoCopy.SkillNames = append([]string(nil), repository.SkillNames...)
		repoCopy.Warnings = append([]string(nil), repository.Warnings...)
		repoCopy.MissingEvidence = append([]string(nil), repository.MissingEvidence...)
		if repository.DeepWiki != nil {
			deepWikiCopy := *repository.DeepWiki
			deepWikiCopy.Frameworks = append([]string(nil), repository.DeepWiki.Frameworks...)
			deepWikiCopy.Entrypoints = append([]string(nil), repository.DeepWiki.Entrypoints...)
			deepWikiCopy.Routes = append([]string(nil), repository.DeepWiki.Routes...)
			deepWikiCopy.Services = append([]string(nil), repository.DeepWiki.Services...)
			deepWikiCopy.Models = append([]string(nil), repository.DeepWiki.Models...)
			deepWikiCopy.TopPages = append([]string(nil), repository.DeepWiki.TopPages...)
			deepWikiCopy.Warnings = append([]string(nil), repository.DeepWiki.Warnings...)
			repoCopy.DeepWiki = &deepWikiCopy
		}
		copied.Repositories = append(copied.Repositories, &repoCopy)
	}
	return &copied
}

func cloneProjectExpertPolicy(policy *domain.SpecForgeProjectExpertPolicy) *domain.SpecForgeProjectExpertPolicy {
	if policy == nil {
		return nil
	}
	copied := *policy
	copied.AllowedPaths = append([]string(nil), policy.AllowedPaths...)
	copied.ForbiddenPaths = append([]string(nil), policy.ForbiddenPaths...)
	copied.RequiredTestCommands = append([]string(nil), policy.RequiredTestCommands...)
	return &copied
}

func cloneProjectRuntimeBinding(binding *domain.SpecForgeProjectRuntimeBinding) *domain.SpecForgeProjectRuntimeBinding {
	if binding == nil {
		return nil
	}
	copied := *binding
	return &copied
}

func projectRepoContextByRepositoryID(bundle *domain.SpecForgeProjectContext, repositoryID string) *domain.SpecForgeProjectRepositoryContext {
	for _, context := range bundle.RepositoryContexts {
		if context.Repository.RepositoryID == repositoryID {
			return context
		}
	}
	return nil
}

func projectRepoContractByRepositoryID(contract *domain.SpecForgeProjectContextContract, repositoryID string) *domain.SpecForgeRepositoryContextContractFragment {
	if contract == nil {
		return nil
	}
	for _, fragment := range contract.Repositories {
		if fragment.RepositoryID == repositoryID {
			return fragment
		}
	}
	return nil
}

func readinessCheckStatusByKey(t *testing.T, readiness *domain.SpecForgeProjectReadiness, key string) string {
	t.Helper()
	if readiness == nil {
		require.Fail(t, "missing readiness")
	}
	for _, check := range readiness.Checks {
		if check.Key == key {
			return check.Status
		}
	}
	require.Failf(t, "missing readiness check", "key %s not found", key)
	return ""
}

type memoryRepoProfileStore struct {
	profiles  map[string]*domain.SpecForgeRepoProfile
	snapshots map[string]*domain.SpecForgeRepoArchitectureSnapshot
}

func (s *memoryRepoProfileStore) UpsertProfile(_ context.Context, profile *domain.SpecForgeRepoProfile) error {
	if s.profiles == nil {
		s.profiles = map[string]*domain.SpecForgeRepoProfile{}
	}
	copied := *profile
	s.profiles[profile.RepositoryID] = &copied
	return nil
}

func (s *memoryRepoProfileStore) FindProfileByRepositoryID(_ context.Context, repositoryID string) (*domain.SpecForgeRepoProfile, error) {
	profile, ok := s.profiles[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *profile
	return &copied, nil
}

func (s *memoryRepoProfileStore) FindLatestArchitectureSnapshotByRepositoryID(_ context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error) {
	snapshot, ok := s.snapshots[repositoryID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *snapshot
	return &copied, nil
}

type memorySkillStore struct {
	skills map[string][]*domain.SpecForgeSkill
}

func (s *memorySkillStore) UpsertSkill(_ context.Context, skill *domain.SpecForgeSkill) error {
	if s.skills == nil {
		s.skills = map[string][]*domain.SpecForgeSkill{}
	}
	copied := *skill
	s.skills[skill.RepositoryID] = append(s.skills[skill.RepositoryID], &copied)
	return nil
}

func (s *memorySkillStore) ListActiveSkillsByRepositoryID(_ context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	all, err := s.ListSkillsByRepositoryID(context.Background(), repositoryID)
	if err != nil {
		return nil, err
	}
	out := make([]*domain.SpecForgeSkill, 0, len(all))
	for _, skill := range all {
		if skill.Active {
			out = append(out, skill)
		}
	}
	return out, nil
}

func (s *memorySkillStore) ListSkillsByRepositoryID(_ context.Context, repositoryID string) ([]*domain.SpecForgeSkill, error) {
	out := make([]*domain.SpecForgeSkill, 0, len(s.skills[repositoryID]))
	for _, skill := range s.skills[repositoryID] {
		copied := *skill
		out = append(out, &copied)
	}
	return out, nil
}
