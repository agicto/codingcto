package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000008_add_execution_result_fields_to_agent_tasks", &addExecutionResultFieldsToAgentTasks{})
}

type addExecutionResultFieldsToAgentTasks struct {
	migration.BaseMigration
}

func (m *addExecutionResultFieldsToAgentTasks) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.AgentTaskPO{})
}

func (m *addExecutionResultFieldsToAgentTasks) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasColumn(&execution.AgentTaskPO{}, "output_log") {
		if err := migrator.DropColumn(&execution.AgentTaskPO{}, "output_log"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&execution.AgentTaskPO{}, "error_log") {
		if err := migrator.DropColumn(&execution.AgentTaskPO{}, "error_log"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&execution.AgentTaskPO{}, "exit_code") {
		if err := migrator.DropColumn(&execution.AgentTaskPO{}, "exit_code"); err != nil {
			return err
		}
	}
	return nil
}
