package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_17_000034_add_runtime_repositories", &addRuntimeRepositories{})
}

type addRuntimeRepositories struct {
	migration.BaseMigration
}

func (m *addRuntimeRepositories) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.RuntimePO{})
}

func (m *addRuntimeRepositories) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&execution.RuntimePO{}, "repositories") {
		return db.Migrator().DropColumn(&execution.RuntimePO{}, "repositories")
	}
	return nil
}
