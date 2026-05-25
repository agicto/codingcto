package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/repocontext"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000002_create_specforge_repo_profiles_table", &createSpecForgeRepoProfilesTable{})
}

type createSpecForgeRepoProfilesTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeRepoProfilesTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&repocontext.RepoProfilePO{})
}

func (m *createSpecForgeRepoProfilesTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_repo_profiles")
}
