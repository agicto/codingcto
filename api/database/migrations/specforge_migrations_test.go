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
		"specforge_requirements",
		"specforge_product_specs",
		"specforge_implementation_plans",
		"specforge_pr_nodes",
		"specforge_compiled_prompts",
		"specforge_repo_profiles",
		"specforge_repo_architecture_snapshots",
		"specforge_project_skills",
		"specforge_project_context_snapshots",
		"specforge_project_expert_policies",
		"specforge_skill_runs",
		"specforge_execution_runs",
		"specforge_agent_tasks",
		"specforge_fix_attempts",
		"specforge_skills",
		"specforge_runtimes",
		"specforge_project_runtime_bindings",
		"specforge_task_events",
		"review_decisions",
		"github_installations",
		"repositories",
		"github_webhook_events",
	}
	for _, table := range expectedTables {
		require.True(t, db.Migrator().HasTable(table), "expected table %s", table)
	}

	requiredColumns := map[string][]string{
		"specforge_ideas": {
			"project_id",
			"requirement_id",
		},
		"specforge_requirements": {
			"workspace_id",
			"project_id",
			"raw_input",
			"type",
			"status",
		},
		"specforge_implementation_plans": {
			"requirement_id",
			"context_snapshot_id",
			"expert_policy_id",
			"version",
			"technical_summary",
			"decision_overrides",
			"evidence_refs",
			"approved_by",
			"approved_at",
			"approved_snapshot_hash",
			"approved_snapshot_at",
		},
		"specforge_pr_nodes": {
			"repository_id",
			"node_key",
			"depends_on",
			"expected_files",
			"evidence_refs",
			"github_pr_number",
			"github_pr_url",
			"github_head_sha",
			"status",
		},
		"specforge_compiled_prompts": {
			"prompt_text",
			"prompt_hash",
			"type",
			"evidence_refs",
		},
		"specforge_skills": {
			"target_agents",
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
		"specforge_repo_architecture_snapshots": {
			"repository_id",
			"commit_sha",
			"stack",
			"modules",
			"entrypoints",
			"test_commands",
			"ci_workflows",
			"risk_areas",
			"generated_by",
			"warnings",
		},
		"specforge_agent_tasks": {
			"prompt_type",
			"process_status",
			"current_phase",
			"runtime_id",
			"parent_task_id",
			"fix_attempt_id",
			"session_id",
			"workdir",
			"failure_reason",
			"output_log",
			"error_log",
			"exit_code",
			"process_ref",
			"dispatched_at",
			"started_at",
			"finished_at",
			"last_progress_at",
		},
		"specforge_project_skills": {
			"workspace_id",
			"project_id",
			"repository_id",
			"skill_id",
			"active",
			"sort_order",
		},
		"specforge_project_context_snapshots": {
			"workspace_id",
			"project_id",
			"snapshot_status",
			"summary",
			"primary_repository_id",
			"warning_count",
			"missing_evidence_json",
			"evidence_refs_json",
			"repositories_json",
			"readiness_json",
			"context_contract_json",
		},
		"specforge_project_expert_policies": {
			"workspace_id",
			"project_id",
			"version",
			"active",
			"goal_boundary",
			"allowed_paths_json",
			"forbidden_paths_json",
			"required_test_commands_json",
			"review_policy_json",
			"merge_policy_json",
		},
		"specforge_project_runtime_bindings": {
			"workspace_id",
			"project_id",
			"repository_id",
			"runtime_id",
			"executor",
			"repo_dir",
			"active",
		},
		"specforge_skill_runs": {
			"requirement_id",
			"plan_id",
			"project_id",
			"skill_id",
			"stage",
			"status",
			"input_summary",
			"output_summary",
			"evidence_refs",
		},
		"specforge_fix_attempts": {
			"failure_type",
			"ci_log_excerpt",
			"attempt_number",
			"likely_cause",
			"recommended_action",
			"can_auto_fix",
			"risk_level",
			"action_kind",
			"blocked_reason",
			"workflow_run_id",
			"workflow_run_url",
			"conclusion",
		},
		"specforge_task_events": {
			"task_id",
			"seq",
			"type",
			"input",
			"output",
		},
		"review_decisions": {
			"pr_node_id",
			"status",
			"head_sha",
			"reason",
			"decided_by",
			"decided_at",
			"expired_at",
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
		{table: "specforge_ideas", name: "idx_specforge_ideas_project_id"},
		{table: "specforge_repo_architecture_snapshots", name: "idx_specforge_repo_architecture_snapshots_repository_id"},
		{table: "specforge_project_skills", name: "idx_specforge_project_skill"},
		{table: "specforge_skills", name: "idx_specforge_skill_repo_name"},
		{table: "specforge_task_events", name: "idx_specforge_task_events_task_seq"},
	}
	for _, index := range indexes {
		require.True(t, db.Migrator().HasIndex(index.table, index.name), "expected index %s on %s", index.name, index.table)
	}
}
