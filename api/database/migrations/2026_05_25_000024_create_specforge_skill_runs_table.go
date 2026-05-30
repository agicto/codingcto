package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000024_create_specforge_skill_runs_table", &createSpecForgeSkillRunsTable{})
}

type createSpecForgeSkillRunsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeSkillRunsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.SkillRunPO{})
}

func (m *createSpecForgeSkillRunsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_skill_runs")
}
