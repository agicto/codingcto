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
	wire.Bind(new(domain.SpecForgeSkillPipelineRepository), new(*repository)),
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
		contracts.WithStarterMigrationNames("2026_05_25_000020_add_project_id_to_specforge_ideas"),
		contracts.WithStarterMigrationNames("2026_05_25_000021_add_requirement_plan_versioning"),
		contracts.WithStarterMigrationNames("2026_05_25_000023_create_specforge_project_skills_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000024_create_specforge_skill_runs_table"),
		contracts.WithStarterMigrationNames("2026_05_30_000025_add_evidence_refs_to_specforge_planning"),
		contracts.WithStarterMigrationNames("2026_05_31_000028_add_target_agents_to_specforge_skills"),
		contracts.WithStarterMigrationNames("2026_06_11_000034_add_context_refs_to_specforge_plans"),
	)
}
