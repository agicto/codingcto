package execution

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeExecutionRepository), new(*repository)),
	NewDefaultCodeExecutor,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"execution",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000003_create_specforge_execution_tables"),
		contracts.WithStarterMigrationNames("2026_05_25_000008_add_execution_result_fields_to_agent_tasks"),
	)
}
