package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000012_create_specforge_task_events_table", &createSpecForgeTaskEventsTable{})
}

type createSpecForgeTaskEventsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeTaskEventsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.TaskEventPO{})
}

func (m *createSpecForgeTaskEventsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(&execution.TaskEventPO{})
}
