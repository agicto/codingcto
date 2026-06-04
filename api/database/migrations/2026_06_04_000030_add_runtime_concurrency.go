package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_04_000030_add_runtime_concurrency", &addRuntimeConcurrency{})
}

type addRuntimeConcurrency struct {
	migration.BaseMigration
}

func (m *addRuntimeConcurrency) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.RuntimePO{})
}

func (m *addRuntimeConcurrency) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&execution.RuntimePO{}, "max_concurrency") {
		return db.Migrator().DropColumn(&execution.RuntimePO{}, "max_concurrency")
	}
	return nil
}
