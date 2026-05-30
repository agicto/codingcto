package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_30_000018_create_github_settings_table", &createGitHubSettingsTable{})
}

type createGitHubSettingsTable struct {
	migration.BaseMigration
}

func (m *createGitHubSettingsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&githubintegration.GitHubSettingsPO{})
}

func (m *createGitHubSettingsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("github_settings")
}
