package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000001_create_specforge_compiled_prompts_table", &createSpecForgeCompiledPromptsTable{})
}

type createSpecForgeCompiledPromptsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeCompiledPromptsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.CompiledPromptPO{})
}

func (m *createSpecForgeCompiledPromptsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_compiled_prompts")
}
