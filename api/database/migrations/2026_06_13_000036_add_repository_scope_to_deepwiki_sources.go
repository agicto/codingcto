package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/deepwiki"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_13_000036_add_repository_scope_to_deepwiki_sources", &addRepositoryScopeToDeepWikiSources{})
}

type addRepositoryScopeToDeepWikiSources struct {
	migration.BaseMigration
}

func (m *addRepositoryScopeToDeepWikiSources) Up(db *gorm.DB) error {
	return db.AutoMigrate(&deepwiki.SourcePO{})
}

func (m *addRepositoryScopeToDeepWikiSources) Down(db *gorm.DB) error {
	table := (&deepwiki.SourcePO{}).TableName()
	for _, column := range []string{
		"workspace_id",
		"project_id",
		"repository_id",
		"git_hub_owner",
		"git_hub_repo",
		"default_branch",
	} {
		if db.Migrator().HasColumn(table, column) {
			if err := db.Migrator().DropColumn(table, column); err != nil {
				return err
			}
		}
	}
	return nil
}
