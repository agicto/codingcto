package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_13_000035_add_github_oauth_repository_access", &addGitHubOAuthRepositoryAccess{})
}

type addGitHubOAuthRepositoryAccess struct {
	migration.BaseMigration
}

func (m *addGitHubOAuthRepositoryAccess) Up(db *gorm.DB) error {
	return db.AutoMigrate(
		&githubintegration.GitHubAccountConnectionPO{},
		&githubintegration.GitHubRepositoryAccessPO{},
		&githubintegration.RepositoryPO{},
	)
}

func (m *addGitHubOAuthRepositoryAccess) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasColumn(&githubintegration.RepositoryPO{}, "AccessSource") {
		if err := migrator.DropColumn(&githubintegration.RepositoryPO{}, "AccessSource"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&githubintegration.RepositoryPO{}, "GitHubRepositoryAccessID") {
		if err := migrator.DropColumn(&githubintegration.RepositoryPO{}, "GitHubRepositoryAccessID"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&githubintegration.RepositoryPO{}, "GitHubConnectionID") {
		if err := migrator.DropColumn(&githubintegration.RepositoryPO{}, "GitHubConnectionID"); err != nil {
			return err
		}
	}
	return migrator.DropTable("github_repository_accesses", "github_account_connections")
}
