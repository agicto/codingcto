package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/project"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000018_create_specforge_project_tables", &createSpecForgeProjectTables{})
}

type createSpecForgeProjectTables struct {
	migration.BaseMigration
}

func (m *createSpecForgeProjectTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(&project.ProjectPO{}, &project.ProjectRepositoryPO{})
}

func (m *createSpecForgeProjectTables) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(&project.ProjectRepositoryPO{}, &project.ProjectPO{})
}
