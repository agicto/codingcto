package planning

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgePlanningRepository), new(*repository)),
	wire.Bind(new(domain.SpecForgeSkillRepository), new(*repository)),
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"planning",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000000_create_specforge_planning_tables"),
		contracts.WithStarterMigrationNames("2026_05_25_000001_create_specforge_compiled_prompts_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000010_create_specforge_skills_table"),
	)
}
