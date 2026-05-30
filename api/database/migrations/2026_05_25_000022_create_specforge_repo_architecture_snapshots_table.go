package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/repocontext"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000022_create_specforge_repo_architecture_snapshots_table", &createSpecForgeRepoArchitectureSnapshotsTable{})
}

type createSpecForgeRepoArchitectureSnapshotsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeRepoArchitectureSnapshotsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&repocontext.RepoArchitectureSnapshotPO{})
}

func (m *createSpecForgeRepoArchitectureSnapshotsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_repo_architecture_snapshots")
}
