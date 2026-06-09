package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000028_add_task_progress_fields_to_specforge_agent_tasks", &addTaskProgressFieldsToSpecForgeAgentTasks{})
}

type addTaskProgressFieldsToSpecForgeAgentTasks struct {
	migration.BaseMigration
}

func (m *addTaskProgressFieldsToSpecForgeAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addTaskProgressFieldsToSpecForgeAgentTasks) Down(db *gorm.DB) error {
	for _, column := range []string{"process_status", "current_phase", "process_ref", "last_progress_at"} {
		if db.Migrator().HasColumn(&execution.AgentTaskPO{}, column) {
			if err := db.Migrator().DropColumn(&execution.AgentTaskPO{}, column); err != nil {
				return err
			}
		}
	}
	return nil
}
