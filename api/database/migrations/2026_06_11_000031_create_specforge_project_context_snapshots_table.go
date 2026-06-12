package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/project"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_11_000031_create_specforge_project_context_snapshots_table", &createSpecForgeProjectContextSnapshotsTable{})
}

type createSpecForgeProjectContextSnapshotsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeProjectContextSnapshotsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&project.ProjectContextSnapshotPO{})
}

func (m *createSpecForgeProjectContextSnapshotsTable) Down(db *gorm.DB) error {
	if db.Migrator().HasTable(&project.ProjectContextSnapshotPO{}) {
		return db.Migrator().DropTable(&project.ProjectContextSnapshotPO{})
	}
	return nil
}
