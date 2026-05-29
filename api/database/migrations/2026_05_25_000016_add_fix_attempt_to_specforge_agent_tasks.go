package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000016_add_fix_attempt_to_specforge_agent_tasks", &addFixAttemptToSpecForgeAgentTasks{})
}

type addFixAttemptToSpecForgeAgentTasks struct {
	migration.BaseMigration
}

func (m *addFixAttemptToSpecForgeAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addFixAttemptToSpecForgeAgentTasks) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&execution.AgentTaskPO{}, "fix_attempt_id") {
		return db.Migrator().DropColumn(&execution.AgentTaskPO{}, "fix_attempt_id")
	}
	return nil
}
