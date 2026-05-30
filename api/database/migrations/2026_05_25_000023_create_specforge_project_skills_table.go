package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000023_create_specforge_project_skills_table", &createSpecForgeProjectSkillsTable{})
}

type createSpecForgeProjectSkillsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeProjectSkillsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.ProjectSkillPO{})
}

func (m *createSpecForgeProjectSkillsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_project_skills")
}
