package migrations

import (
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/internal/infra/migration"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestSpecForgeMigrationsCreateMVPDeliverySchema(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)

	repo := migration.NewDatabaseRepository(db, "migrations")
	migrator := migration.NewMigrator(repo, db, events.NewEventBus())
	for name, registered := range All() {
		migrator.Register(name, registered)
	}

	executed, err := migrator.Run(migration.NewMigratorOptions())
	require.NoError(t, err)
	require.NotEmpty(t, executed)

	expectedTables := []string{
		"specforge_ideas",
		"specforge_product_specs",
		"specforge_implementation_plans",
		"specforge_pr_nodes",
		"specforge_compiled_prompts",
		"specforge_repo_profiles",
		"specforge_execution_runs",
		"specforge_agent_tasks",
		"specforge_fix_attempts",
		"specforge_skills",
		"specforge_runtimes",
		"specforge_task_events",
		"github_installations",
		"repositories",
		"github_webhook_events",
	}
	for _, table := range expectedTables {
		require.True(t, db.Migrator().HasTable(table), "expected table %s", table)
	}

	requiredColumns := map[string][]string{
		"specforge_implementation_plans": {
			"technical_summary",
			"decision_overrides",
			"approved_by",
			"approved_at",
		},
		"specforge_pr_nodes": {
			"node_key",
			"depends_on",
			"expected_files",
			"github_pr_number",
			"github_pr_url",
			"github_head_sha",
			"status",
		},
		"specforge_compiled_prompts": {
			"prompt_text",
			"prompt_hash",
			"type",
		},
		"specforge_repo_profiles": {
			"stack",
			"test_commands",
			"app_structure",
			"coding_conventions",
			"risk_areas",
			"source",
			"warnings",
		},
		"specforge_agent_tasks": {
			"prompt_type",
			"runtime_id",
			"parent_task_id",
			"session_id",
			"workdir",
			"failure_reason",
			"output_log",
			"error_log",
			"exit_code",
			"dispatched_at",
			"started_at",
			"finished_at",
		},
		"specforge_fix_attempts": {
			"failure_type",
			"ci_log_excerpt",
			"attempt_number",
			"likely_cause",
			"recommended_action",
			"can_auto_fix",
		},
		"specforge_task_events": {
			"task_id",
			"seq",
			"type",
			"input",
			"output",
		},
		"github_webhook_events": {
			"delivery_id",
			"event_type",
			"repository_full_name",
			"status",
		},
	}
	for table, columns := range requiredColumns {
		for _, column := range columns {
			require.True(t, db.Migrator().HasColumn(table, column), "expected %s.%s", table, column)
		}
	}

	indexes := []struct {
		table string
		name  string
	}{
		{table: "specforge_skills", name: "idx_specforge_skill_repo_name"},
		{table: "specforge_task_events", name: "idx_specforge_task_events_task_seq"},
	}
	for _, index := range indexes {
		require.True(t, db.Migrator().HasIndex(index.table, index.name), "expected index %s on %s", index.name, index.table)
	}
}
