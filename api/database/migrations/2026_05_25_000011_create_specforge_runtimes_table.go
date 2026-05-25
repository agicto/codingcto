package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000011_create_specforge_runtimes_table", &createSpecForgeRuntimesTable{})
}

type createSpecForgeRuntimesTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeRuntimesTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.RuntimePO{})
}

func (m *createSpecForgeRuntimesTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(&execution.RuntimePO{})
}
