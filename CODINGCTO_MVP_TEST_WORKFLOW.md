# CodingCTO MVP Test Workflow

This document defines a practical end-to-end workflow for testing the current CodingCTO MVP across setup, planning, execution, PR delivery, review, fix loops, and merge reconciliation.

It is designed for local verification against the current stacked MVP branch line, not only for isolated unit tests.

## 1. Goal

Validate that a workspace owner can complete the full MVP loop:

```text
Create project
  -> connect GitHub
  -> bind primary repository
  -> build project context
  -> configure expert policy
  -> create requirement
  -> generate and approve plan
  -> compile prompts
  -> dispatch local runtime
  -> open GitHub PR
  -> process CI and review feedback
  -> approve merge
  -> reconcile merged state back into CodingCTO
```

This workflow covers:

- happy path
- operator path
- failure path
- hardening and reconciliation path

## 2. Scope

### In Scope

- Project setup readiness
- GitHub installation sync and repository binding
- Project context snapshot and readiness
- Expert policy persistence
- Runtime registration and readiness
- Requirement intake and plan generation
- Prompt compilation
- Execution run start and dispatch
- PR delivery
- CI refresh and failure log flow
- Fix attempts and review patch tasks
- Review decision and merge request flow
- Webhook/manual merge reconciliation
- Stale runtime handling

### Out Of Scope

- Multi-repository write execution in a single run
- Production deployment validation
- Billing, org-level administration, or merge queues

## 3. Preconditions

Use this workflow only after checking out a branch that includes the MVP closure slices. At the time of writing, the relevant stacked branch line ends at:

- `feature/mvp-pr10-hardening`

### Local services

- API: `http://localhost:2010`
- API base: `http://localhost:2010/v1`
- Web: `http://localhost:2020`

### Required tools

- Go toolchain
- `pnpm`
- `gh`
- one local CLI executor:
  - `codex`
  - or `claude`

### Required secrets and external setup

- valid GitHub App configuration for the API
- a test GitHub repository where the app can:
  - read contents
  - open pull requests
  - merge pull requests
- a local clone of that same repository for runtime execution

### Recommended test actors

- `Workspace Owner`: performs all UI setup, approval, and merge actions
- `Runtime Operator`: keeps the runtime online and executes local tasks

For MVP testing, one person may play both roles.

## 4. Recommended Test Order

Run the workflow in this order:

1. Baseline automated checks
2. First-run setup flow
3. Context and expert policy flow
4. Requirement, plan, and prompt flow
5. Runtime dispatch and PR creation flow
6. CI and review feedback flow
7. Merge flow
8. Hardening and reconciliation flow

Do not start with merge or webhook tests before the happy path works.

## 5. Baseline Automated Checks

Run these before manual testing:

```bash
cd /Users/mingde/item/codingcto/api && make wire
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/project ./internal/modules/githubintegration ./internal/modules/planning ./internal/modules/execution ./internal/modules/review ./database/migrations ./internal/starter

cd /Users/mingde/item/codingcto/web && pnpm type-check
cd /Users/mingde/item/codingcto/web && pnpm lint
cd /Users/mingde/item/codingcto/web && pnpm test
```

Minimum gate:

- API tests pass
- Web type-check passes
- Web lint passes
- critical feature tests pass

If baseline checks fail, stop and fix them before manual validation.

## 6. Test Data

Prepare the following test data before starting:

### Workspace / Project

- one fresh workspace
- one fresh project inside that workspace

### Repository

- one writable GitHub repository with:
  - default branch
  - CI workflow or at least a test command that can fail
  - a small, understandable codebase

### Requirement

Use one requirement that reliably changes code and tests. Example:

```text
Add a small settings validation improvement and expose the result in the UI. Include tests.
```

### Optional failure case seed

Have one known-bad change ready so you can simulate:

- failing CI
- review changes requested
- fix attempt generation

## 7. Route Coverage Map

This workflow should touch these UI surfaces:

- `/console/projects`
- `/console/projects/:projectId`
- `/console/projects/:projectId/context`
- `/console/projects/:projectId/requirements/new`
- `/console/projects/:projectId/plans/:planId`
- `/console/projects/:projectId/codingcto`
- `/console/projects/:projectId/prs/:prNodeId`

These API surfaces are the critical back-end checkpoints:

- project readiness
- GitHub installation status and sync
- project context reindex and fetch
- project expert policy read/write
- plan approval
- prompt compilation
- run start and dispatch
- runtime heartbeat
- review decision get/approve/reject/request-merge
- GitHub CI refresh and webhook intake

## 8. Scenario A: First-Run Setup

### Objective

Validate that a new workspace owner can reach a project state where execution is allowed.

### Steps

1. Start API and web locally.
2. Open `/console/projects`.
3. Create a new project.
4. Open the project overview page.
5. Confirm the readiness card shows missing setup actions.
6. Navigate to the project context/setup surface.
7. Connect or sync the GitHub App installation.
8. Confirm installation status loads.
9. Sync repositories for the installation.
10. Bind one repository as the primary project repository.

### Expected Results

- the project exists
- the readiness card is visible
- GitHub installation status is readable
- repositories appear after installation sync
- one repository can be selected as primary
- the project no longer reports “repository missing”

### Evidence To Capture

- screenshot of project readiness before setup
- screenshot of project readiness after repo binding
- API response for installation status if debugging is needed

## 9. Scenario B: Context And Expert Policy

### Objective

Validate that CodingCTO can build a project-level context snapshot and persist expert boundaries.

### Steps

1. Open `/console/projects/:projectId/context`.
2. Trigger context analysis / reindex for the project.
3. Wait until the latest context snapshot becomes readable.
4. Confirm repo context details are present.
5. Confirm DeepWiki-derived or normalized context is present where applicable.
6. Configure the expert policy for the project:
   - goal boundary
   - allowed change area
   - merge expectations
   - review expectations
7. Save the expert policy.
8. Reload the page.

### Expected Results

- a current project context snapshot exists
- context readiness becomes green or at least actionable
- expert policy persists across refresh
- project readiness improves after context and policy are present

### Evidence To Capture

- snapshot timestamp
- context summary
- saved expert policy fields

## 10. Scenario C: Requirement, Plan, And Prompt Compilation

### Objective

Validate that requirement intake creates a usable plan and that prompts can be compiled for PR nodes.

### Steps

1. Open `/console/projects/:projectId/requirements/new`.
2. Submit one requirement.
3. Confirm a plan is generated.
4. Open `/console/projects/:projectId/plans/:planId`.
5. Review:
   - product spec
   - implementation plan
   - PR DAG
   - evidence refs
   - active context / policy references
6. Compile prompts for at least one PR node in all relevant modes:
   - `implementation`
   - `fix`
   - `review_patch`
7. Confirm the prompt preview renders.

### Expected Results

- requirement is accepted
- plan exists and is linked to the project
- plan references active project context and policy inputs
- prompt compilation succeeds
- compiled prompt includes:
  - task goal
  - codebase context
  - constraints
  - evidence refs

### Optional API Spot Check

Verify `POST /v1/pr-nodes/:id/prompts` succeeds for one node.

## 11. Scenario D: Plan Approval And Runtime Readiness

### Objective

Validate that only an execution-ready project can start a run and dispatch work to a healthy runtime.

### Steps

1. Start the local runtime process or use the local CLI helper that posts runtime heartbeats.
2. Confirm the runtime is visible as online in the CodingCTO delivery/runtime surface.
3. Return to the plan review page.
4. Approve the plan.
5. Start an execution run.
6. Dispatch the run with runtime-readiness enforcement enabled.

### Expected Results

- runtime appears online
- the approved plan can start a run
- queued tasks are created from the PR DAG
- dispatch succeeds only if runtime readiness is valid
- the run moves into `queued` or `running`

### Negative Checks

Confirm dispatch is blocked when:

- no runtime is online
- runtime heartbeat is stale
- required CLI is missing

## 12. Scenario E: Local Agent Execution And PR Delivery

### Objective

Validate that a runtime can claim work, execute it locally, and open a GitHub PR.

### Steps

1. From the runtime environment, claim a dispatched task.
2. Execute the task in the local repository worktree.
3. Let the runtime submit the task result.
4. Confirm CodingCTO performs commit/push/PR delivery.
5. Open the project delivery board.
6. Confirm the corresponding PR node shows:
   - branch name
   - GitHub PR number
   - GitHub PR URL
   - updated node status

### Expected Results

- task progresses through dispatched/running/completed
- branch is prepared or reused correctly
- commit and push succeed
- GitHub PR is created
- PR node reaches `pr_opened`, `ci_running`, or `ready_for_review`

### Evidence To Capture

- run ID
- task ID
- PR URL
- node status in CodingCTO

## 13. Scenario F: CI Refresh, Failure Log, And Fix Attempt Flow

### Objective

Validate the CI verification loop for both green and failing outcomes.

### Green Path

1. On the PR node, refresh CI state.
2. Confirm the node becomes `ready_for_review` if checks are green.

### Failing Path

1. Use a PR that fails CI.
2. Refresh CI state.
3. Read the failure log.
4. Confirm CodingCTO creates or can create a fix attempt.
5. Confirm escalation summary is available when relevant.

### Expected Results

- CI refresh updates the PR node
- failure logs are available when workflow data exists
- failing CI can produce a fix attempt
- fix attempt metadata is visible
- escalation summary explains the next action

### Negative Checks

Confirm the system behaves correctly when:

- no workflow run exists yet
- workflow run exists but logs are unavailable
- CI status times out or is inconclusive

## 14. Scenario G: Review Feedback And Review Patch Flow

### Objective

Validate that GitHub review feedback is reflected back into CodingCTO and can create patch work.

### Steps

1. On GitHub, add actionable review feedback to the PR:
   - review comment
   - or changes requested review
2. Trigger webhook delivery to the local API.
3. Confirm CodingCTO receives the webhook.
4. Confirm the PR node becomes blocked when changes are requested.
5. Confirm review feedback appears in the system’s event path.
6. Create or observe a review patch task for the node.

### Expected Results

- review feedback is ingested
- purely non-actionable noise does not create patch work
- actionable feedback does create patch work
- node status reflects blocked review state when appropriate

## 15. Scenario H: PR Review Decision And Merge

### Objective

Validate the explicit CodingCTO-side approval workflow and merge request flow.

### Steps

1. Open `/console/projects/:projectId/prs/:prNodeId`.
2. Confirm the review page shows:
   - PR metadata
   - merge-readiness checklist
   - fix attempt signals
   - escalation summary
   - current decision state
3. Approve the current head SHA.
4. Confirm decision status changes to approved.
5. Request merge.
6. Confirm merge succeeds if all checks are ready.

### Expected Results

- the review page answers “can this PR be merged now?”
- approval is bound to the current head SHA
- merge remains disabled until required checks are ready
- merge request reaches GitHub successfully
- CodingCTO immediately marks the PR node as merged after GitHub accepts the merge

### Negative Checks

Confirm merge is rejected when:

- approval is missing
- approval is stale
- CI refresh changes the node to blocked
- the head SHA changed

## 16. Scenario I: Hardening And Reconciliation

### Objective

Validate the lifecycle edge cases added in the final hardening slice.

### I.1 Approval Expiry On New Commits

1. Approve a PR head in the PR review page.
2. Push a new commit to the same branch.
3. Refresh review decision.

Expected:

- decision becomes `expired`
- merge is blocked until re-approval

### I.2 Pre-Merge CI Refresh Gate

1. Approve a PR.
2. Change CI state to failing or blocked.
3. Request merge from CodingCTO.

Expected:

- CodingCTO refreshes CI before merge
- merge request is rejected if CI is no longer mergeable

### I.3 Manual GitHub Merge Outside CodingCTO

1. Merge the PR directly in GitHub.
2. Deliver the merge webhook to the local API.

Expected:

- PR node becomes `merged`
- downstream dependency-satisfied events fire
- execution run can reconcile to completed if the selected path is done

### I.4 Closed Unmerged PR

1. Close a PR in GitHub without merging.
2. Deliver the webhook.

Expected:

- PR node becomes `closed`
- downstream blocked tasks are cancelled where applicable
- run becomes blocked if the selected path is no longer completable

### I.5 Stale Runtime

1. Let the runtime heartbeat expire.
2. Trigger stale runtime sweep.

Expected:

- runtime marked offline
- tasks for offline runtime fail
- affected PR nodes become blocked where required

## 17. Automated Regression Matrix

Run this matrix before calling the MVP stable:

### API

```bash
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/project
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/githubintegration
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/planning
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/execution
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/review
cd /Users/mingde/item/codingcto/api && go test ./database/migrations ./internal/starter
```

### Web

```bash
cd /Users/mingde/item/codingcto/web && pnpm type-check
cd /Users/mingde/item/codingcto/web && pnpm lint
cd /Users/mingde/item/codingcto/web && pnpm test --run src/features/project/project-readiness.test.ts
cd /Users/mingde/item/codingcto/web && pnpm test --run src/features/review/review-adapter.test.ts
```

### Suggested Optional Browser Smoke

- create project
- open context page
- open plan review page
- open PR review page

## 18. Exit Criteria

The MVP test pass is complete only when all of the following are true:

1. A fresh project can reach execution-ready state through the UI.
2. A requirement can generate a plan with prompt compilation.
3. A runtime can start and dispatch work.
4. At least one PR can be opened automatically.
5. CI and review feedback can be reflected back into CodingCTO.
6. A PR can be approved and merged from CodingCTO.
7. A manual GitHub merge outside CodingCTO still reconciles correctly.
8. Stale runtime and closed-PR edge cases do not leave the run in an incoherent state.

## 19. Failure Reporting Format

When a scenario fails, capture:

- branch name
- commit SHA
- route or endpoint
- scenario step number
- expected result
- actual result
- screenshots
- API/server logs
- GitHub PR URL if relevant

Use this template:

```text
Scenario:
Step:
Input:
Expected:
Actual:
Logs:
Artifacts:
```

## 20. Practical Notes

- Prefer one clean happy-path run first before testing failures.
- Use a small repository for the first E2E pass.
- Keep one “green PR” and one “failing PR” scenario so CI and merge cases do not fight each other.
- Re-run the review and merge scenarios after any change to webhook, review, execution, or GitHub integration modules.
