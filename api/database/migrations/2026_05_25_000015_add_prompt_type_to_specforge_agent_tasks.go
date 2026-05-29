package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000015_add_prompt_type_to_specforge_agent_tasks", &addPromptTypeToSpecForgeAgentTasks{})
}

type addPromptTypeToSpecForgeAgentTasks struct {
	migration.BaseMigration
}

func (m *addPromptTypeToSpecForgeAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addPromptTypeToSpecForgeAgentTasks) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&execution.AgentTaskPO{}, "prompt_type") {
		return db.Migrator().DropColumn(&execution.AgentTaskPO{}, "prompt_type")
	}
	return nil
}
