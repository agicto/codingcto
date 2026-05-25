package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000013_add_parent_task_to_specforge_agent_tasks", &addParentTaskToSpecForgeAgentTasks{})
}

type addParentTaskToSpecForgeAgentTasks struct {
	migration.BaseMigration
}

func (m *addParentTaskToSpecForgeAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addParentTaskToSpecForgeAgentTasks) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&execution.AgentTaskPO{}, "parent_task_id") {
		return db.Migrator().DropColumn(&execution.AgentTaskPO{}, "parent_task_id")
	}
	return nil
}
