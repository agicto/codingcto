package expert

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	NewService,
	wire.Bind(new(Service), new(*service)),
	wire.Bind(new(domain.SpecForgeExpertPlanningRunner), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"expert",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_06_04_000030_create_codingcto_expert_tables"),
	)
}
