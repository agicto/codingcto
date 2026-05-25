package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000010_create_specforge_skills_table", &createSpecForgeSkillsTable{})
}

type createSpecForgeSkillsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeSkillsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.SkillPO{})
}

func (m *createSpecForgeSkillsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(&planning.SkillPO{})
}
