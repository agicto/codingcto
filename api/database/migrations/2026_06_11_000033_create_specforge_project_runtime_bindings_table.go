package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_11_000033_create_specforge_project_runtime_bindings_table", &createSpecForgeProjectRuntimeBindingsTable{})
}

type createSpecForgeProjectRuntimeBindingsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeProjectRuntimeBindingsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.ProjectRuntimeBindingPO{})
}

func (m *createSpecForgeProjectRuntimeBindingsTable) Down(db *gorm.DB) error {
	if db.Migrator().HasTable(&execution.ProjectRuntimeBindingPO{}) {
		return db.Migrator().DropTable(&execution.ProjectRuntimeBindingPO{})
	}
	return nil
}
