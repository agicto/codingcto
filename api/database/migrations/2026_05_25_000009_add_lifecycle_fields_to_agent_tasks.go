package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000009_add_lifecycle_fields_to_agent_tasks", &addLifecycleFieldsToAgentTasks{})
}

type addLifecycleFieldsToAgentTasks struct {
	migration.BaseMigration
}

func (m *addLifecycleFieldsToAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addLifecycleFieldsToAgentTasks) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	for _, column := range []string{
		"runtime_id",
		"attempt_number",
		"session_id",
		"workdir",
		"failure_reason",
		"dispatched_at",
	} {
		if migrator.HasColumn(&execution.AgentTaskPO{}, column) {
			if err := migrator.DropColumn(&execution.AgentTaskPO{}, column); err != nil {
				return err
			}
		}
	}
	return nil
}
