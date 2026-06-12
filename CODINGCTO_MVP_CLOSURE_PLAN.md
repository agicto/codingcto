# CodingCTO MVP Closure Plan

## 1. Goal

This plan closes the gap between the current CodingCTO prototype and the intended MVP flow:

```text
User creates workspace
  -> binds GitHub repository
  -> system understands repository structure
  -> local CLI runtime is ready
  -> user configures expert contract and scope
  -> user creates requirement
  -> local agent executes
  -> system creates PR
  -> expert reviews and merges
```

Target outcome:

```text
Describe a change
  -> approve a plan
  -> receive reviewable PRs
  -> resolve CI/review feedback
  -> merge from CodingCTO or synced GitHub actions
```

This is not a greenfield design. It is a closure plan built on the current modules already present in:

- `api/internal/modules/workspace`
- `api/internal/modules/project`
- `api/internal/modules/githubintegration`
- `api/internal/modules/deepwiki`
- `api/internal/modules/repocontext`
- `api/internal/modules/planning`
- `api/internal/modules/execution`
- `api/internal/modules/verification`
- `web/src/features/project`
- `web/src/features/specforge`
- `web/src/features/experts`

## 2. Current State And Gap Summary

### 2.1 Already Implemented

- Workspace create/list/update exists.
- Project create and repository binding exist.
- GitHub installation sync and repository readiness checks exist.
- DeepWiki indexing exists as an independent module.
- RepoContext architecture profiling exists and feeds planning.
- Requirement creation, plan generation, plan approval, PR DAG generation, and execution run creation exist.
- Local runtime heartbeat, claim, Codex/Claude CLI execution, commit, push, and PR creation exist.
- CI refresh, failure log analysis, fix attempts, and review feedback patch tasks exist.
- GitHub webhook sync updates PR status, CI status, and merged state.

### 2.2 Not Fully Closed

- GitHub App install and repo authorization are not a smooth first-run product flow.
- DeepWiki does not act as the primary repository-understanding source for planning.
- Expert configuration exists, but expert review is not modeled as a first-class approval workflow.
- Merge is not initiated by CodingCTO. The system only observes merge status through webhook sync.
- The UI still spreads setup, context, planning, runtime, and delivery across overlapping surfaces.

### 2.3 MVP Closure Definition

The MVP is considered closed only when a workspace owner can do the following without manual back-channel coordination:

1. Create a project in the product console.
2. Install or connect GitHub access and bind one writable primary repository.
3. Analyze repository context with a visible readiness gate.
4. Define project expert contract and execution boundary.
5. Submit a requirement and approve a generated plan.
6. Dispatch a local runtime and have a PR opened automatically.
7. See CI and review feedback loop back into CodingCTO.
8. Approve merge from CodingCTO when checks and review policy allow it.

## 3. MVP Boundary

### 3.1 In Scope

- Single workspace user path with owner/admin/member permissions.
- One writable primary repository per execution run.
- Optional read-only context repositories.
- DeepWiki-assisted repository understanding.
- Plan approval before execution.
- Local CLI runtime using Codex CLI or Claude CLI.
- GitHub-native PR creation and merge.
- CI refresh and automated fix attempt creation.
- Review feedback intake from GitHub reviews and comments.

### 3.2 Out Of Scope

- Multi-primary cross-repository code changes in a single run.
- Arbitrary runtime fleet orchestration.
- IDE plugin workflows.
- Fine-grained merge queues.
- Custom reviewer routing across multiple organizations.
- Full autonomous merge without human approval.

## 4. Core Business Loop

```text
Workspace owner connects project repository
  -> system builds context and marks readiness
  -> user submits requirement
  -> planner produces product spec, implementation plan, PR DAG, and prompts
  -> user approves plan
  -> runtime executes PR nodes
  -> GitHub PRs are opened
  -> CI and review feedback drive fix tasks
  -> expert decision approves merge
  -> GitHub merge completes delivery
```

Success condition:

```text
At least one PR reaches merged or ready_for_review state
with clear audit trail, CI status, review feedback handling,
and explicit merge decision policy.
```

## 5. Roles And Pages

### 5.1 Roles

| Role | Main Capabilities | Restrictions |
|------|-------------------|--------------|
| Workspace Owner | Create workspace, install GitHub App, bind repos, set expert policy, approve plan, approve merge | None inside workspace |
| Workspace Admin | Create project, bind repos, trigger context analysis, create requirement, review run status | Merge approval depends on workspace policy |
| Workspace Member | Create requirement, inspect plans, inspect runs, view PRs | Cannot change workspace integration or merge policy |
| Runtime Operator | Register local runtime and keep runtime healthy | No product approval permissions |

### 5.2 Required Screens

| Route | Purpose | Primary Action |
|------|---------|----------------|
| `/console/projects` | Project selection and setup readiness | Create project |
| `/console/projects/:projectId` | Project overview and next action | Continue setup or open latest plan/run |
| `/console/projects/:projectId/context` | Repo binding, DeepWiki/RepoContext readiness, expert contract | Analyze context |
| `/console/projects/:projectId/requirements/new` | Requirement intake | Generate plan |
| `/console/projects/:projectId/plans/:planId` | Plan review and approval | Approve and start |
| `/console/projects/:projectId/runs/:runId` | Runtime status, PR DAG, CI, fix tasks | View active node |
| `/console/projects/:projectId/prs/:prNodeId` | PR delivery, review feedback, merge decision | Approve merge |
| `/console/integrations/github` | GitHub App install and installation sync | Connect GitHub |

### 5.3 Product Rule

The UI should expose one next action per state. It should not force the user to understand all internal modules at once.

## 6. Business Objects

### 6.1 Main Object Graph

```text
Workspace
  -> GitHubInstallation
  -> Project
      -> ProjectRepository
      -> ProjectExpertPolicy
      -> ProjectContextSnapshot
      -> Requirement
          -> Plan
              -> PRNode
                  -> AgentTask
                  -> PullRequest
                  -> ReviewDecision
                  -> FixAttempt
      -> ExecutionRun
      -> RuntimeBinding
```

### 6.2 Object Responsibilities

| Object | Responsibility |
|--------|----------------|
| `Workspace` | Permission and billing boundary |
| `Project` | Product/system boundary |
| `Repository` | Code context boundary |
| `ProjectContextSnapshot` | Consolidated repo structure and readiness evidence |
| `ProjectExpertPolicy` | Expert scope, allowed change areas, required review depth, merge rules |
| `Requirement` | User intent |
| `Plan` | Product understanding, technical approach, PR DAG |
| `PRNode` | Delivery unit |
| `ExecutionRun` | Approved plan execution lifecycle |
| `AgentTask` | Runtime work item |
| `PullRequest` | GitHub delivery record |
| `ReviewDecision` | CodingCTO-side merge decision state |
| `FixAttempt` | CI or review-driven repair attempt |
| `RuntimeBinding` | Local runtime identity and repository working directory registration |

## 7. State Machines

### 7.1 Project Readiness

```text
draft
  -> repo_bound
  -> context_indexing
  -> context_ready
  -> runtime_ready
  -> execution_ready

Any state
  -> blocked
  -> stale
```

Rules:

- `repo_bound` requires at least one active primary repository.
- `context_ready` requires RepoContext plus DeepWiki evidence to pass minimum readiness checks.
- `runtime_ready` requires an online runtime mapped to the primary repository.
- `execution_ready` requires context readiness plus active expert policy.

### 7.2 Requirement / Plan

```text
requirement_draft
  -> planning
  -> plan_ready
  -> approved
  -> executing
  -> completed

plan_ready
  -> rejected
approved
  -> cancelled
executing
  -> blocked
  -> failed
  -> completed
blocked
  -> executing
```

### 7.3 PR Node

```text
planned
  -> queued
  -> dispatched
  -> running
  -> pr_opened
  -> ready_for_review
  -> changes_requested
  -> fixing
  -> ready_for_review
  -> merge_pending
  -> merged

Any active state
  -> failed
  -> closed
```

### 7.4 Review Decision

```text
pending_review
  -> review_requested
  -> approved_for_merge
  -> rejected
  -> superseded

approved_for_merge
  -> merged
  -> expired
```

Rules:

- `approved_for_merge` requires CI green and no unresolved blocking review.
- `expired` applies when a new commit lands after approval.
- `superseded` applies when a newer fix task replaces the currently reviewed head SHA.

## 8. Core Business Rules

1. A project may bind 1-3 repositories, but only one repository is writable per execution run.
2. A project cannot enter `execution_ready` without both repository context and runtime readiness.
3. DeepWiki may enrich context, but execution-scoped prompt construction must use a normalized project context contract.
4. A plan cannot be executed until approved.
5. A PR node cannot be merged unless:
   - PR exists in GitHub.
   - Latest head SHA matches the reviewed SHA.
   - Required checks are passing.
   - No unresolved `changes_requested` review exists.
   - User has merge permission under workspace policy.
6. Review feedback from GitHub must create a review patch task only when actionable.
7. CI failures must create fix attempts only when the PR node is still active.
8. Manual GitHub merge outside CodingCTO remains valid; CodingCTO must sync and update run completion.

## 9. Database Design

This plan assumes existing tables for workspace, project, planning, execution, verification, and GitHub integration will be reused where available. The main additions are closure-oriented support tables and a unified context snapshot.

### 9.1 Extend Existing Tables

#### `projects`

Add:

- `readiness_status`
- `primary_repository_id`
- `active_context_snapshot_id`
- `active_expert_policy_id`
- `default_runtime_id`

Indexes:

- `(workspace_id, readiness_status)`

#### `specforge_pr_nodes` or equivalent current PR node table

Add:

- `review_decision_status`
- `reviewed_head_sha`
- `merge_requested_at`
- `merged_at`
- `merge_error_message`

Indexes:

- `(project_id, review_decision_status)`
- `(github_pr_number)`

#### `github_repositories` or equivalent repository table

Add:

- `is_primary_candidate`
- `default_branch`
- `last_synced_at`
- `runtime_repo_key`

### 9.2 New Tables

#### `project_context_snapshots`

Purpose:
Unified project-level context built from RepoContext plus DeepWiki evidence.

Fields:

- `id`
- `project_id`
- `primary_repository_id`
- `status`
- `repo_profile_json`
- `architecture_snapshot_json`
- `deepwiki_index_id`
- `readiness_report_json`
- `generated_at`
- `created_at`
- `updated_at`

Constraints:

- index `(project_id, generated_at desc)`

#### `project_expert_policies`

Purpose:
Persist expert scope and merge policy instead of treating it as loose planning metadata.

Fields:

- `id`
- `project_id`
- `name`
- `goal_boundary_text`
- `allowed_paths_json`
- `forbidden_paths_json`
- `required_test_commands_json`
- `review_policy_json`
- `merge_policy_json`
- `status`
- `created_by`
- `created_at`
- `updated_at`

Constraints:

- unique active policy per project

#### `runtime_bindings`

Purpose:
Project-level mapping between local runtime and repository checkout path.

Fields:

- `id`
- `project_id`
- `repository_id`
- `runtime_id`
- `repo_dir`
- `executor_type`
- `status`
- `last_heartbeat_at`
- `created_at`
- `updated_at`

Constraints:

- unique `(project_id, repository_id, runtime_id)`

#### `review_decisions`

Purpose:
Track CodingCTO-side review approval independently from GitHub webhook state.

Fields:

- `id`
- `project_id`
- `pr_node_id`
- `github_pr_number`
- `status`
- `decision_reason`
- `reviewed_head_sha`
- `decided_by`
- `decided_at`
- `expires_at`
- `created_at`
- `updated_at`

Constraints:

- unique active decision per `(pr_node_id, reviewed_head_sha)`

### 9.3 Migration Order

1. Add additive nullable columns to project and PR node tables.
2. Create `project_context_snapshots`.
3. Create `project_expert_policies`.
4. Create `runtime_bindings`.
5. Create `review_decisions`.
6. Backfill project readiness from existing project/repo/runtime state.
7. Backfill PR node review decision status from current GitHub status where possible.

## 10. Backend Module Plan

### 10.1 Module Ownership

| Module | Responsibility | Changes Required |
|--------|----------------|------------------|
| `workspace` | Workspace lifecycle | Minimal |
| `project` | Project boundary and readiness | Add readiness aggregate and next-action contract |
| `githubintegration` | GitHub install, repo sync, branch/PR/merge, webhook sync | Add merge command and install readiness UX support |
| `deepwiki` | Repository understanding and generated docs | Publish normalized structural evidence |
| `repocontext` | Architecture profiling | Merge outputs into unified context snapshot |
| `planning` | Requirement, plan, PR DAG | Consume unified context and expert policy |
| `execution` | Runtime registration, task execution, PR delivery | Bind runtime to project/repo and enforce readiness |
| `verification` | CI and repair loop | Keep current role, add merge gate helper |
| `review` | New module | Review decision workflow and merge approval |

### 10.2 New Backend Module

Create:

```text
api/internal/modules/review/
  model.go
  dto.go
  repository.go
  service.go
  handler.go
  routes.go
  provider.go
  service_test.go
```

Responsibilities:

- Create review decision records.
- Validate merge preconditions.
- Approve or reject merge.
- Trigger GitHub merge command.
- Expire approval when head SHA changes.
- Publish events consumed by execution/project overview.

### 10.3 Dependency Rules

- `review` may depend on `githubintegration`, `planning`, and `verification` read seams.
- `planning` must not import `review`.
- `deepwiki` must not depend on `execution`.
- `project` may aggregate readiness from `deepwiki`, `repocontext`, `execution`, and `planning`, but those modules should not depend on `project`.

## 11. API Draft

### 11.1 Project Readiness And Context

```text
GET  /v1/projects/:id/readiness
POST /v1/projects/:id/context/reindex
GET  /v1/projects/:id/context
POST /v1/projects/:id/expert-policy
PATCH /v1/projects/:id/expert-policy/:policyId
GET  /v1/projects/:id/expert-policy
```

Response shape:

```json
{
  "project_id": 12,
  "readiness_status": "execution_ready",
  "next_action": "create_requirement",
  "checks": {
    "github_connected": true,
    "primary_repo_bound": true,
    "repo_context_ready": true,
    "deepwiki_ready": true,
    "runtime_ready": true,
    "expert_policy_ready": true
  },
  "warnings": []
}
```

### 11.2 GitHub Integration

```text
GET  /v1/github/installations/status
POST /v1/github/installations/:id/sync
POST /v1/github/repositories/:id/mark-primary
POST /v1/github/pr-nodes/:id/merge
```

Merge request:

```json
{
  "merge_method": "squash",
  "commit_title": "feat: implement requirement slice 1",
  "delete_branch": true
}
```

### 11.3 Runtime Binding

```text
POST /v1/projects/:id/runtime-bindings
GET  /v1/projects/:id/runtime-bindings
PATCH /v1/projects/:id/runtime-bindings/:bindingId
```

Request:

```json
{
  "repository_id": 45,
  "runtime_id": "runtime-local-macbook",
  "repo_dir": "/Users/mingde/item/codingcto",
  "executor_type": "codex"
}
```

### 11.4 Review Decision

```text
GET  /v1/pr-nodes/:id/review-decision
POST /v1/pr-nodes/:id/review-decision/approve
POST /v1/pr-nodes/:id/review-decision/reject
POST /v1/pr-nodes/:id/review-decision/request-merge
```

Approve request:

```json
{
  "reason": "Scope is correct and CI is green."
}
```

### 11.5 Planning Changes

Existing requirement and plan APIs should remain stable. The main change is input enrichment:

- `CreateProjectRequirement` must read the active `project_context_snapshot`.
- `ApprovePlan` must persist the active expert policy ID and context snapshot ID into the execution snapshot.

## 12. Frontend Plan

### 12.1 Structure

Keep the current feature-first structure in `web/src/features`, but split the project console into clearer ownership:

```text
project/
  components/
  hooks/
  services/
  types/

context/
  components/
  hooks/
  services/
  types/

review/
  components/
  hooks/
  services/
  types/

runtime/
  components/
  hooks/
  services/
  types/
```

### 12.2 Key UI Changes

1. Project Overview becomes the only default landing page for a project.
2. Context page becomes the only place for:
   - Repo binding
   - DeepWiki analysis
   - Architecture readiness
   - Expert policy setup
   - Runtime binding status
3. Plan Review page remains the approval gate.
4. Run Board page remains execution tracking.
5. Add PR Review page with:
   - GitHub PR metadata
   - Latest CI state
   - Review feedback summary
   - Merge readiness checklist
   - Approve merge button

### 12.3 Frontend State Rules

- Project overview fetches `readiness` and renders one recommended next action.
- Plan approval button is disabled until `execution_ready`.
- Merge button is disabled unless:
  - review decision is approved
  - CI is green
  - no blocking review remains
  - current head SHA matches reviewed head SHA

### 12.4 Empty And Error States

| Surface | Empty State |
|---------|-------------|
| Project overview | No repo bound |
| Context | No analysis yet |
| Runtime binding | No runtime connected |
| Requirement intake | Context incomplete |
| Run board | No active run |
| PR review | PR not opened yet or closed |

## 13. Cross-Module Flows

### 13.1 Setup Flow

```text
Create Project
  -> bind GitHub repository
  -> sync installation repositories
  -> mark primary repository
  -> trigger RepoContext reindex
  -> trigger DeepWiki index
  -> build ProjectContextSnapshot
  -> save ExpertPolicy
  -> register RuntimeBinding
  -> Project readiness becomes execution_ready
```

### 13.2 Requirement Flow

```text
POST /requirements
  -> PlanningService.CreateProjectRequirement
  -> load active ProjectContextSnapshot
  -> load active ExpertPolicy
  -> compile product spec and implementation plan
  -> generate PR DAG
  -> persist plan and evidence refs
```

### 13.3 Execution Flow

```text
Approve plan
  -> ExecutionService.StartRun
  -> DispatchRun(require_runtime_ready=true)
  -> runtime heartbeat + claim
  -> prepare branch
  -> local CLI executes prompt
  -> commit and push
  -> DeliverPRNode
  -> PR node becomes pr_opened
```

### 13.4 CI Failure Flow

```text
PR opened
  -> CI refresh or workflow_run webhook
  -> VerificationService analyzes failed jobs
  -> create FixAttempt
  -> Execution handler creates fix task
  -> runtime executes fix
  -> push update
  -> refresh CI
```

### 13.5 Review Feedback Flow

```text
GitHub review/comment webhook
  -> githubintegration records review state
  -> actionable feedback event published
  -> execution handler creates review patch task
  -> runtime executes patch
  -> push update
  -> review decision expires if SHA changed
```

### 13.6 Merge Flow

```text
PR ready_for_review
  -> user opens PR Review page
  -> ReviewService validates merge preconditions
  -> user approves merge
  -> githubintegration.MergePullRequest
  -> webhook confirms merged state
  -> PR node becomes merged
  -> run completion recalculated
```

## 14. Phase Plan

### Phase 1: Product Readiness Gate

Goal:
Make setup deterministic and visible.

Backend:

- Add project readiness aggregate contract.
- Add `project_context_snapshots`.
- Add `runtime_bindings`.
- Add readiness endpoint.

Frontend:

- Add project overview next-action card.
- Add dedicated context screen sections.

Acceptance:

- A project clearly reports what is missing before execution can start.

### Phase 2: DeepWiki To Planning Integration

Goal:
Turn DeepWiki into planning evidence instead of a side feature.

Backend:

- Normalize DeepWiki structural output.
- Join DeepWiki output with RepoContext into `ProjectContextSnapshot`.
- Include DeepWiki evidence refs in planning prompts and stored plan metadata.

Frontend:

- Show DeepWiki readiness and summary on context page.

Acceptance:

- Generated plans reference both RepoContext and DeepWiki-derived evidence.

### Phase 3: Expert Policy As First-Class Contract

Goal:
Persist scope and merge policy.

Backend:

- Add `project_expert_policies`.
- Expose CRUD API.
- Enforce policy during plan approval and prompt compilation.

Frontend:

- Add expert policy editor with allowed paths, forbidden paths, and review policy.

Acceptance:

- Execution snapshots can be traced back to an exact expert policy version.

### Phase 4: Runtime Binding Closure

Goal:
Make local runtime setup explicit per project.

Backend:

- Add project/runtime binding API.
- Validate binding before dispatch.
- Surface binding health in project readiness.

Frontend:

- Add runtime registration panel.
- Show runtime heartbeat freshness and repo directory match.

Acceptance:

- Users can see whether their local CLI environment is correctly attached to the target repo.

### Phase 5: Review And Merge Workflow

Goal:
Close the PR delivery loop inside CodingCTO.

Backend:

- Add `review` module.
- Add GitHub merge client and service method.
- Add review decision expiry on new commits.

Frontend:

- Add PR Review screen.
- Add merge readiness checklist and merge action.

Acceptance:

- A user can approve and merge a green PR from CodingCTO.

## 15. PR Slices

### PR 1

Project readiness DTO, endpoint, and overview UI.

### PR 2

`project_context_snapshots` table plus aggregation service joining RepoContext and DeepWiki.

### PR 3

Planning integration with active context snapshot evidence.

### PR 4

`project_expert_policies` table, API, and context page editor.

### PR 5

`runtime_bindings` table, API, and runtime readiness gating.

### PR 6

Dedicated GitHub integration setup screen and project repo primary-selection cleanup.

### PR 7

New `review` module with review decision persistence and API.

### PR 8

GitHub merge client method and service wiring.

### PR 9

PR Review page with merge checklist and merge action.

### PR 10

E2E hardening: webhook reconciliation, merge expiry, fix/review interaction, and regression tests.

## 16. Testing Plan

### 16.1 Backend

- Unit tests for project readiness aggregation.
- Unit tests for context snapshot generation.
- Unit tests for expert policy validation.
- Unit tests for runtime binding validation.
- Unit tests for review decision preconditions.
- Unit tests for GitHub merge service success and failure cases.
- Integration tests for setup -> plan -> run -> PR -> merge lifecycle.

### 16.2 Frontend

- React Query hook tests for readiness, expert policy, runtime binding, and merge flows.
- Component tests for context page gating and PR review checklist.
- Route-level smoke tests for overview, context, plan, run, and PR review surfaces.

### 16.3 End-To-End

Required acceptance scenario:

```text
Create workspace/project
  -> bind repo
  -> run context analysis
  -> save expert policy
  -> register runtime
  -> create requirement
  -> approve plan
  -> dispatch local run
  -> PR opens
  -> CI passes
  -> approve merge
  -> merged webhook closes loop
```

## 17. Risks And Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| DeepWiki output is too noisy for planning | Low-quality plans | Normalize into compact context snapshot instead of passing raw wiki pages |
| Runtime binding points at wrong repo directory | Wrong code changes | Validate git remote, branch, and repo key before dispatch |
| Merge action races with new commits | Invalid approval | Bind review decision to head SHA and expire on change |
| GitHub checks are eventually consistent | False merge block or false ready state | Add explicit refresh before merge |
| UI remains overloaded | Poor product comprehension | Enforce one job per screen and next-action driven overview |

## 18. Open Questions

1. Should DeepWiki indexing be synchronous for small repositories and queued for large repositories?
2. Should merge approval require workspace owner role by default, or should project-level policy allow admin approval?
3. Should CodingCTO support `merge`, `squash`, and `rebase` equally in MVP, or only `squash` first?
4. Should the runtime binding be per repository or per project with inferred primary repository behavior?

## 19. Recommended Build Order

Recommended order:

1. Project readiness and unified context snapshot
2. Expert policy persistence
3. Runtime binding
4. Planning integration with DeepWiki evidence
5. Review module
6. GitHub merge action
7. PR review UI
8. End-to-end hardening

This order reduces user confusion first, then closes the missing delivery loop last.

## 20. Delivery Workflow

Implementation must follow this git delivery rule:

1. Each planned slice is implemented on its own feature branch.
2. As soon as one slice is locally complete and verified, it must be committed in a reviewable batch and pushed immediately.
3. Each slice should open its own GitHub PR targeting `dev` so review stays narrow and history stays understandable.
4. Do not wait until the very end to push local work.
5. The full MVP is considered delivered only when every planned slice has been pushed and all resulting code has been proposed to `dev` through GitHub PRs.

Recommended branch naming:

```text
feature/mvp-pr1-project-readiness
feature/mvp-pr2-context-snapshot
feature/mvp-pr3-expert-policy
...
```
