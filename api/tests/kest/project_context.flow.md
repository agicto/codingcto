```flow
@flow id=specforge-project-context
@name SpecForge Project Context Flow
@version 1.0
@tags specforge, project, repo-context
@env local
```

```step
@id register
@name Register User
@retry 2

POST /v1/register
Content-Type: application/json

{
  "username": "project_user_{{run_id}}",
  "email": "project_{{run_id}}@example.com",
  "password": "password123",
  "nickname": "Project User"
}

[Captures]
email = data.email

[Asserts]
status == 201
body.data.id exists
```

```step
@id login
@name Login
@retry 2

POST /v1/login
Content-Type: application/json

{
  "username": "{{email}}",
  "password": "password123"
}

[Captures]
token = data.access_token

[Asserts]
status == 200
body.data.access_token exists
```

```step
@id installation
@name Save GitHub Installation

POST /v1/github/installations
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "workspace_id": "workspace_{{run_id}}",
  "installation_id": {{run_id}},
  "account_login": "specforge-test",
  "permissions": {
    "contents": "write",
    "pull_requests": "write"
  }
}

[Captures]
installation_id = data.id

[Asserts]
status == 200
body.data.id exists
```

```step
@id repository
@name Save Primary Repository

POST /v1/github/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "repo_{{run_id}}",
  "workspace_id": "workspace_{{run_id}}",
  "github_installation_id": {{installation_id}},
  "github_owner": "specforge-test",
  "github_repo": "app",
  "default_branch": "main",
  "is_private": true
}

[Captures]
repo_id = data.repository_id

[Asserts]
status == 200
body.data.repository_id exists
```

```step
@id dependency_repository
@name Save Dependency Repository

POST /v1/github/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "repo_docs_{{run_id}}",
  "workspace_id": "workspace_{{run_id}}",
  "github_installation_id": {{installation_id}},
  "github_owner": "specforge-test",
  "github_repo": "docs",
  "default_branch": "main",
  "is_private": true
}

[Captures]
dependency_repo_id = data.repository_id

[Asserts]
status == 200
body.data.repository_id exists
```

```step
@id profile
@name Save Repo Profile

POST /v1/repositories/{{repo_id}}/profile
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "default_branch": "main",
  "stack": ["Go", "Next.js"],
  "test_commands": ["go test ./...", "pnpm type-check"],
  "ci_provider": "github_actions",
  "app_structure": ["api/internal/modules", "web/src/features"],
  "coding_conventions": ["Keep API and web contracts explicit."],
  "risk_areas": ["auth", "database migrations"],
  "summary": "Primary app repository for SpecForge project context flow.",
  "source": "kest_flow"
}

[Asserts]
status == 200
body.data.id exists
body.data.summary exists
```

```step
@id architecture_reindex
@name Reindex Repo Architecture

POST /v1/repositories/{{repo_id}}/architecture/reindex
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "default_branch": "main",
  "file_paths": [
    "go.mod",
    "cmd/server/main.go",
    "api/internal/modules/project/service.go",
    "web/package.json",
    "web/src/features/specforge/components/specforge-workbench.tsx",
    ".github/workflows/ci.yml",
    ".env"
  ],
  "package_scripts": {
    "lint": "eslint .",
    "type-check": "tsc --noEmit",
    "test": "vitest"
  }
}

[Asserts]
status == 200
body.data.snapshot.id exists
body.data.snapshot.repository_id == "{{repo_id}}"
body.data.snapshot.modules.0 exists
body.data.snapshot.ci_workflows.0 == ".github/workflows/ci.yml"
body.data.snapshot.warnings.0 exists
body.data.stale == false
```

```step
@id architecture_status
@name Fetch Repo Architecture Status

GET /v1/repositories/{{repo_id}}/architecture
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.snapshot.id exists
body.data.stale == false
```

```step
@id skill
@name Save Repo Skill

POST /v1/repositories/{{repo_id}}/skills
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "module-boundaries",
  "description": "Project context flow skill",
  "content": "Keep API and web contracts explicit.",
  "active": true
}

[Asserts]
status == 201
body.data.skill.id exists
```

```step
@id dependency_profile
@name Save Dependency Repo Profile

POST /v1/repositories/{{dependency_repo_id}}/profile
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "default_branch": "main",
  "stack": ["Markdown", "Product Docs"],
  "test_commands": ["pnpm docs:check"],
  "ci_provider": "github_actions",
  "app_structure": ["docs"],
  "coding_conventions": ["Docs are read-only context for MVP execution."],
  "risk_areas": ["requirements drift"],
  "summary": "Dependency documentation repository used as read-only project context.",
  "source": "kest_flow"
}

[Asserts]
status == 200
body.data.summary exists
```

```step
@id project
@name Create Project

POST /v1/projects
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "workspace_id": "workspace_{{run_id}}",
  "name": "SpecForge Flow",
  "slug": "specforge-flow-{{run_id}}",
  "description": "Kest project context flow"
}

[Captures]
project_id = data.project.id

[Asserts]
status == 201
body.data.project.id exists
```

```step
@id bind
@name Bind Primary Repository

POST /v1/projects/{{project_id}}/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "{{repo_id}}",
  "role": "primary"
}

[Asserts]
status == 201
body.data.repository.id exists
```

```step
@id bind_dependency
@name Bind Dependency Repository

POST /v1/projects/{{project_id}}/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "{{dependency_repo_id}}",
  "role": "dependency"
}

[Asserts]
status == 201
body.data.repository.id exists
body.data.repository.role == "dependency"
```

```step
@id project_skill
@name Save Project Skill

POST /v1/projects/{{project_id}}/skills
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "{{repo_id}}",
  "name": "planning-sop",
  "description": "Project-level planning skill",
  "content": "Map every acceptance criterion to at least one PR node before execution.",
  "active": true,
  "sort_order": 1
}

[Asserts]
status == 201
body.data.project_skill.id exists
body.data.project_skill.project_id == {{project_id}}
body.data.project_skill.repository_id == "{{repo_id}}"
body.data.project_skill.skill.name == "planning-sop"
```

```step
@id project_skills
@name List Project Skills

GET /v1/projects/{{project_id}}/skills
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.project_skills.0.id exists
body.data.project_skills.0.skill.name == "planning-sop"
```

```step
@id context
@name Fetch Project Context

GET /v1/projects/{{project_id}}/context
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.context.project.id exists
body.data.context.repositories.0.repository_id exists
body.data.context.repository_contexts.0.repository.repository_id exists
body.data.context.repository_contexts.0.profile.summary exists
body.data.context.primary_repository_id == "{{repo_id}}"
body.data.context.execution_repository_id == "{{repo_id}}"
body.data.context.read_only_repository_ids.0 == "{{dependency_repo_id}}"
body.data.context.execution_guardrails.0 exists
body.data.context.repository_contexts.1.profile.summary exists
```

```step
@id project_requirement
@name Create Project Requirement

POST /v1/projects/{{project_id}}/requirements
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "input": "Add team invite UI and API for workspace admins",
  "type": "feature"
}

[Captures]
requirement_id = data.requirement.id
idea_id = data.idea.id
plan_id = data.implementation_plan.id
pr_node_id = data.pr_nodes.0.id

[Asserts]
status == 201
body.data.requirement.id exists
body.data.idea.project_id exists
body.data.idea.requirement_id exists
body.data.implementation_plan.requirement_id exists
body.data.implementation_plan.version == 1
body.data.implementation_plan.evidence_refs.0 exists
body.data.project_context.project.name exists
body.data.project_context.primary_repository_id == "{{repo_id}}"
body.data.project_context.execution_repository_id == "{{repo_id}}"
body.data.project_context.read_only_repository_ids.0 == "{{dependency_repo_id}}"
body.data.repo_profile.stack.0 exists
body.data.product_spec.assumptions.0 exists
body.data.pr_nodes.0.id exists
body.data.pr_nodes.0.repository_id == "{{repo_id}}"
body.data.pr_nodes.0.evidence_refs.0 exists
```

```step
@id skill_runs
@name List Plan Skill Runs

GET /v1/plans/{{plan_id}}/skill-runs
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.skill_runs.0.stage == "product_plan"
body.data.skill_runs.1.stage == "technical_plan"
body.data.skill_runs.2.stage == "pr_dag"
body.data.skill_runs.3.stage == "self_review"
body.data.skill_runs.0.input_summary exists
body.data.skill_runs.0.output_summary exists
body.data.skill_runs.0.evidence_refs.0 exists
```

```step
@id prompt
@name Compile Project Prompt

POST /v1/pr-nodes/{{pr_node_id}}/prompts
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "type": "implementation"
}

[Asserts]
status == 201
body.data.prompt.prompt_text exists
body.data.prompt.prompt_hash exists
body.data.prompt.version exists
body.data.prompt.evidence_refs.0 exists
```

```step
@id approve
@name Approve Project Plan

POST /v1/plans/{{plan_id}}/approve
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "approved": true
}

[Asserts]
status == 200
body.data.implementation_plan.status == "approved"
body.data.implementation_plan.approved_snapshot_hash exists
```

```step
@id run
@name Start Execution Run

POST /v1/plans/{{plan_id}}/run
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "executor": "codex_cli",
  "pr_node_ids": [{{pr_node_id}}]
}

[Captures]
run_id = data.run.id
task_id = data.tasks.0.id

[Asserts]
status == 200
body.data.run.status == "queued"
body.data.tasks.0.status == "queued"
body.data.tasks.0.executor == "codex_cli"
```

```step
@id dispatch
@name Dispatch Execution Run

POST /v1/runs/{{run_id}}/dispatch
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "max_tasks": 1
}

[Asserts]
status == 200
body.data.run.status == "running"
body.data.tasks.0.status == "dispatched"
```

```step
@id heartbeat
@name Runtime Heartbeat

POST /v1/runtimes/heartbeat
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "runtime_id": "runtime_kest",
  "executor": "codex_cli",
  "hostname": "kest",
  "version": "flow"
}

[Asserts]
status == 200
body.data.runtime.runtime_id == "runtime_kest"
body.data.claim_pending == true
```

```step
@id claim
@name Runtime Claim Task

POST /v1/runtimes/runtime_kest/claim
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "executor": "codex_cli",
  "session_id": "session_kest",
  "workdir": "/tmp/codingcto-kest"
}

[Asserts]
status == 200
body.data.task.id == {{task_id}}
body.data.task.status == "running"
body.data.prompt.prompt_text exists
body.data.execution_context.repository_id == "{{repo_id}}"
body.data.execution_context.branch_name exists
```

```step
@id task_event
@name Runtime Writes Task Event

POST /v1/tasks/{{task_id}}/events
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "type": "executor_result",
  "tool": "codex_cli",
  "content": "Kest runtime event",
  "output": "simulated executor output"
}

[Asserts]
status == 200
body.data.task_id == {{task_id}}
body.data.seq == 1
```

```step
@id task_result
@name Runtime Submits Task Result

POST /v1/tasks/{{task_id}}/result
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "runtime_id": "runtime_kest",
  "session_id": "session_kest",
  "workdir": "/tmp/codingcto-kest",
  "status": "failed",
  "output": "simulated executor output",
  "error": "simulated failure",
  "exit_code": 2,
  "failure_reason": "executor_failed"
}

[Asserts]
status == 200
body.data.tasks.0.status == "failed"
body.data.tasks.0.failure_reason == "executor_failed"
```

```step
@id fix_attempt
@name Record CI Fix Attempt

POST /v1/pr-nodes/{{pr_node_id}}/fix-attempts
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "failure_type": "type_error",
  "ci_log_excerpt": "pnpm typecheck\nTS2322: Type mismatch",
  "confidence": 0.82,
  "likely_cause": "The generated UI passed an optional role into a required field.",
  "recommended_action": "Patch the type guard and rerun pnpm type-check.",
  "can_auto_fix": true,
  "workflow_run_id": {{run_id}},
  "workflow_run_url": "https://github.com/specforge-test/app/actions/runs/{{run_id}}",
  "conclusion": "failure"
}

[Captures]
fix_attempt_id = data.id

[Asserts]
status == 200
body.data.id exists
body.data.pr_node_id == {{pr_node_id}}
body.data.failure_type == "type_error"
body.data.workflow_run_id == {{run_id}}
body.data.can_auto_fix == true
```

```step
@id review_patch
@name Queue Review Patch Task

POST /v1/tasks/{{task_id}}/review-patch
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "feedback": "Please preserve the existing API response shape while fixing this task.",
  "force_fresh_session": true
}

[Asserts]
status == 200
body.data.run.id == {{run_id}}
body.data.tasks.1.prompt_type == "review_patch"
body.data.tasks.1.status == "queued"
body.data.tasks.1.parent_task_id == {{task_id}}
```

```step
@id escalation_summary
@name Read Escalation Summary

GET /v1/pr-nodes/{{pr_node_id}}/escalation-summary
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.pr_node_id == {{pr_node_id}}
body.data.attempts_used == 1
body.data.max_attempts == 3
body.data.can_continue_auto_fix == true
body.data.latest_failure_type == "type_error"
```

```edge
@from register
@to login
@on success
```

```edge
@from login
@to installation
@on success
```

```edge
@from installation
@to repository
@on success
```

```edge
@from repository
@to dependency_repository
@on success
```

```edge
@from dependency_repository
@to profile
@on success
```

```edge
@from profile
@to architecture_reindex
@on success
```

```edge
@from architecture_reindex
@to architecture_status
@on success
```

```edge
@from architecture_status
@to skill
@on success
```

```edge
@from skill
@to dependency_profile
@on success
```

```edge
@from dependency_profile
@to project
@on success
```

```edge
@from project
@to bind
@on success
```

```edge
@from bind
@to bind_dependency
@on success
```

```edge
@from bind_dependency
@to project_skill
@on success
```

```edge
@from project_skill
@to project_skills
@on success
```

```edge
@from project_skills
@to context
@on success
```

```edge
@from context
@to project_requirement
@on success
```

```edge
@from project_requirement
@to skill_runs
@on success
```

```edge
@from skill_runs
@to prompt
@on success
```

```edge
@from prompt
@to approve
@on success
```

```edge
@from approve
@to run
@on success
```

```edge
@from run
@to dispatch
@on success
```

```edge
@from dispatch
@to heartbeat
@on success
```

```edge
@from heartbeat
@to claim
@on success
```

```edge
@from claim
@to task_event
@on success
```

```edge
@from task_event
@to task_result
@on success
```

```edge
@from task_result
@to review_patch
@on success
```

```edge
@from review_patch
@to fix_attempt
@on success
```

```edge
@from fix_attempt
@to escalation_summary
@on success
```
