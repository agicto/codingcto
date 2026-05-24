package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000000_create_specforge_planning_tables", &createSpecForgePlanningTables{})
}

type createSpecForgePlanningTables struct {
	migration.BaseMigration
}

func (m *createSpecForgePlanningTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(
		&planning.IdeaPO{},
		&planning.ProductSpecPO{},
		&planning.ImplementationPlanPO{},
		&planning.PRNodePO{},
	)
}

func (m *createSpecForgePlanningTables) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(
		"specforge_pr_nodes",
		"specforge_implementation_plans",
		"specforge_product_specs",
		"specforge_ideas",
	)
}
