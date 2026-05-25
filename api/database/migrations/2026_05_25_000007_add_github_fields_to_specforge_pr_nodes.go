package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000007_add_github_fields_to_specforge_pr_nodes", &addGitHubFieldsToSpecForgePRNodes{})
}

type addGitHubFieldsToSpecForgePRNodes struct {
	migration.BaseMigration
}

func (m *addGitHubFieldsToSpecForgePRNodes) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.PRNodePO{})
}

func (m *addGitHubFieldsToSpecForgePRNodes) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasColumn(&planning.PRNodePO{}, "github_pr_number") {
		if err := migrator.DropColumn(&planning.PRNodePO{}, "github_pr_number"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&planning.PRNodePO{}, "github_pr_url") {
		if err := migrator.DropColumn(&planning.PRNodePO{}, "github_pr_url"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&planning.PRNodePO{}, "github_head_sha") {
		if err := migrator.DropColumn(&planning.PRNodePO{}, "github_head_sha"); err != nil {
			return err
		}
	}
	return nil
}
