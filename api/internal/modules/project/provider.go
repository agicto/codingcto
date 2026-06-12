package project

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeProjectRepositoryStore), new(*repository)),
	NewProjectSkillStore,
	NewGitHubReadinessChecker,
	NewRuntimeReadinessStore,
	NewProjectDeepWikiStore,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewProjectSkillStore(repo domain.SpecForgePlanningRepository) projectSkillStore {
	store, _ := repo.(projectSkillStore)
	return store
}

func NewGitHubReadinessChecker(service githubintegration.Service) githubReadinessChecker {
	return service
}

func NewRuntimeReadinessStore(repo domain.SpecForgeExecutionRepository) runtimeReadinessStore {
	return repo
}

func NewProjectDeepWikiStore(repo domain.DeepWikiRepository) projectDeepWikiStore {
	store, _ := repo.(projectDeepWikiStore)
	return store
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"project",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames(
			"2026_05_25_000018_create_specforge_project_tables",
			"2026_06_11_000031_create_specforge_project_context_snapshots_table",
		),
	)
}
