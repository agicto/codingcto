package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_02_000029_create_codingcto_direct_agent_tasks", &createCodingCTODirectAgentTasks{})
}

type createCodingCTODirectAgentTasks struct {
	migration.BaseMigration
}

func (m *createCodingCTODirectAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.DirectAgentTaskPO{}, &execution.DirectTaskEventPO{})
}

func (m *createCodingCTODirectAgentTasks) Down(db *gorm.DB) error {
	if db.Migrator().HasTable(&execution.DirectTaskEventPO{}) {
		if err := db.Migrator().DropTable(&execution.DirectTaskEventPO{}); err != nil {
			return err
		}
	}
	if db.Migrator().HasTable(&execution.DirectAgentTaskPO{}) {
		if err := db.Migrator().DropTable(&execution.DirectAgentTaskPO{}); err != nil {
			return err
		}
	}
	return nil
}
