package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/workspace"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000026_create_workspaces_table", &createWorkspacesTable{})
}

type createWorkspacesTable struct {
	migration.BaseMigration
}

func (m *createWorkspacesTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&workspace.WorkspacePO{})
}

func (m *createWorkspacesTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(&workspace.WorkspacePO{})
}
