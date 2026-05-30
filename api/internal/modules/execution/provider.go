package execution

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeExecutionRepository), new(*repository)),
	NewDefaultCodeExecutor,
	NewDefaultWorktreeManager,
	NewGitHubRepositoryResolver,
	NewGitHubPRNodeBranchPreparer,
	NewGitHubPRNodeDeliverer,
	NewProjectAwareEventedService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewGitHubRepositoryResolver(service githubintegration.Service) RepositoryResolver {
	return service
}

func NewGitHubPRNodeBranchPreparer(service githubintegration.Service) PRNodeBranchPreparer {
	return service
}

func NewGitHubPRNodeDeliverer(service githubintegration.Service) PRNodeDeliverer {
	return service
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"execution",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000003_create_specforge_execution_tables"),
		contracts.WithStarterMigrationNames("2026_05_25_000008_add_execution_result_fields_to_agent_tasks"),
		contracts.WithStarterMigrationNames("2026_05_25_000009_add_lifecycle_fields_to_agent_tasks"),
		contracts.WithStarterMigrationNames("2026_05_25_000011_create_specforge_runtimes_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000012_create_specforge_task_events_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000013_add_parent_task_to_specforge_agent_tasks"),
		contracts.WithStarterMigrationNames("2026_05_25_000015_add_prompt_type_to_specforge_agent_tasks"),
		contracts.WithStarterMigrationNames("2026_05_25_000016_add_fix_attempt_to_specforge_agent_tasks"),
	)
}
