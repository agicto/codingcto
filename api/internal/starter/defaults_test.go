package starter

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultManifestsRegisterDefaultAssets(t *testing.T) {
	registry := NewRegistry()

	manifests := DefaultManifests(nil, nil, nil, nil, nil, nil, nil, nil)
	require.Len(t, manifests, 8)
	assert.Equal(t, "audit", manifests[0].Name())
	assert.Equal(t, "apikey", manifests[1].Name())
	assert.Equal(t, "planning", manifests[2].Name())
	assert.Equal(t, "repocontext", manifests[3].Name())
	assert.Equal(t, "execution", manifests[4].Name())
	assert.Equal(t, "githubintegration", manifests[5].Name())
	assert.Equal(t, "verification", manifests[6].Name())
	assert.Equal(t, "user", manifests[7].Name())

	for _, manifest := range manifests {
		require.NoError(t, registry.ApplyManifest(manifest))
	}

	migrations := registry.Migrations()
	assert.Len(t, migrations, 26)
	assert.Contains(t, migrations, "2026_04_26_000000_create_audit_logs_table")
	assert.Contains(t, migrations, "2026_04_27_000002_add_business_fields_to_audit_logs")
	assert.Contains(t, migrations, "2025_06_18_000000_create_users_table")
	assert.Contains(t, migrations, "2025_06_18_000001_seed_default_users")
	assert.Contains(t, migrations, "2026_04_27_000000_create_password_reset_tokens_table")
	assert.Contains(t, migrations, "2026_04_27_000001_add_unique_index_to_users_username")
	assert.Contains(t, migrations, "2026_04_06_000000_create_api_keys_table")
	assert.Contains(t, migrations, "2026_05_25_000000_create_specforge_planning_tables")
	assert.Contains(t, migrations, "2026_05_25_000001_create_specforge_compiled_prompts_table")
	assert.Contains(t, migrations, "2026_05_25_000002_create_specforge_repo_profiles_table")
	assert.Contains(t, migrations, "2026_05_25_000003_create_specforge_execution_tables")
	assert.Contains(t, migrations, "2026_05_25_000004_create_github_integration_tables")
	assert.Contains(t, migrations, "2026_05_25_000005_create_specforge_fix_attempts_table")
	assert.Contains(t, migrations, "2026_05_25_000006_create_github_webhook_events_table")
	assert.Contains(t, migrations, "2026_05_25_000007_add_github_fields_to_specforge_pr_nodes")
	assert.Contains(t, migrations, "2026_05_25_000008_add_execution_result_fields_to_agent_tasks")
	assert.Contains(t, migrations, "2026_05_25_000009_add_lifecycle_fields_to_agent_tasks")
	assert.Contains(t, migrations, "2026_05_25_000010_create_specforge_skills_table")
	assert.Contains(t, migrations, "2026_05_25_000011_create_specforge_runtimes_table")
	assert.Contains(t, migrations, "2026_05_25_000012_create_specforge_task_events_table")
	assert.Contains(t, migrations, "2026_05_25_000013_add_parent_task_to_specforge_agent_tasks")
	assert.Contains(t, migrations, "2026_05_25_000014_add_source_to_specforge_repo_profiles")
	assert.Contains(t, migrations, "2026_05_25_000015_add_prompt_type_to_specforge_agent_tasks")
	assert.Contains(t, migrations, "2026_05_25_000016_add_fix_attempt_to_specforge_agent_tasks")
	assert.Contains(t, migrations, "2026_05_25_000017_add_ci_metadata_to_specforge_fix_attempts")
	assert.Contains(t, migrations, "2026_05_30_000018_create_github_settings_table")

	seeders := registry.Seeders()
	require.Len(t, seeders, 1)
	assert.Equal(t, "users", seeders[0].Name())
}
