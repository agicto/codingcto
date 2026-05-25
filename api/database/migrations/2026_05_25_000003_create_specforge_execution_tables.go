package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000003_create_specforge_execution_tables", &createSpecForgeExecutionTables{})
}

type createSpecForgeExecutionTables struct {
	migration.BaseMigration
}

func (m *createSpecForgeExecutionTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.ExecutionRunPO{}, &execution.AgentTaskPO{})
}

func (m *createSpecForgeExecutionTables) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_agent_tasks", "specforge_execution_runs")
}
