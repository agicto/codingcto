package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000004_create_github_integration_tables", &createGitHubIntegrationTables{})
}

type createGitHubIntegrationTables struct {
	migration.BaseMigration
}

func (m *createGitHubIntegrationTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(&githubintegration.GitHubInstallationPO{}, &githubintegration.RepositoryPO{})
}

func (m *createGitHubIntegrationTables) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("repositories", "github_installations")
}
