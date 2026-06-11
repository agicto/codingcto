# CodingCTO MVP PR Breakdown

This document decomposes [CODINGCTO_MVP_CLOSURE_PLAN.md](/Users/mingde/item/codingcto/CODINGCTO_MVP_CLOSURE_PLAN.md) into review-friendly pull requests.

The goal is not only to finish the MVP, but to make each PR:

- narrow in business scope
- small in module surface
- easy to test
- easy to revert
- easy for reviewers to reason about

## 1. Slicing Principles

### 1.1 One Business Concern Per PR

Each PR should answer one clear question:

- Can the project tell the user what setup is missing?
- Can the system persist expert policy?
- Can the system merge a PR safely?

If a reviewer cannot summarize the PR in one sentence, the slice is too wide.

### 1.2 Prefer Additive Schema Changes

Each PR should introduce at most one new table or one tightly related column set.

Avoid:

- adding two unrelated tables in one PR
- mixing schema work with merge workflow and UI redesign

### 1.3 Separate Contract PRs From Behavior PRs

When possible:

1. add storage and read models
2. add API contract
3. wire behavior
4. add UI actions

This keeps reviewers from having to validate data model, workflow logic, and UX behavior all at once.

### 1.4 Limit Module Fan-Out

Target budget per PR:

- `1-2` primary backend modules
- `0-1` supporting backend read seams
- `1` frontend feature area

If a PR touches `project`, `planning`, `execution`, `githubintegration`, and `verification` together, it is probably too wide.

### 1.5 UI Follows Stable API

Do not build final UI actions before the API preconditions are stable.

Preferred order:

```text
backend contract
  -> backend behavior
  -> frontend read state
  -> frontend mutation
```

## 2. Recommended Sequence

Recommended PR order:

1. Project readiness read model
2. Unified context snapshot foundation
3. Expert policy persistence
4. Runtime binding
5. Planning integration with active context
6. GitHub setup and repository onboarding cleanup
7. Review decision domain
8. GitHub merge capability
9. PR review and merge UI
10. Hardening and end-to-end reconciliation

This order intentionally does three things first:

- makes setup state visible
- persists missing project-level contracts
- avoids changing execution and merge behavior until the prerequisites are explicit

## 3. PR Breakdown

## PR 1: Project Readiness Read Model

### Goal

Introduce a project-level readiness contract that tells the UI what is missing before execution can start.

### Why This PR Stands Alone

This is the lowest-risk slice. It is mostly read-only aggregation over state that already exists.

### Backend Modules

- `api/internal/modules/project`
- read-only calls into `githubintegration`
- read-only calls into `repocontext`
- read-only calls into `execution`

### Frontend Modules

- `web/src/features/project`

### Database

No schema change in this PR.

Compute readiness dynamically first. Persisted readiness can come later only if needed for performance or search.

### API

Add:

```text
GET /v1/projects/:id/readiness
```

Response should include:

- `readiness_status`
- `next_action`
- setup checks
- warnings

### UI

Add a project overview readiness card showing:

- primary repo bound or not
- context ready or not
- runtime ready or not
- expert policy ready or not
- one next action button

### Out Of Scope

- no new tables
- no DeepWiki integration changes
- no planner changes
- no runtime mutation flow

### Review Focus

- Is the readiness contract easy to understand?
- Are the checks computed from the right source of truth?
- Is the overview UI only reading state, not inventing new setup logic?

### Acceptance

A reviewer can open a project and immediately see why execution is or is not possible.

## PR 2: Unified Context Snapshot Foundation

### Goal

Create a project-level context snapshot that combines RepoContext and DeepWiki outputs into one stable input for planning.

### Why This PR Stands Alone

Today DeepWiki exists, but planning uses RepoContext directly. This PR creates the missing normalization layer before touching planning behavior.

### Backend Modules

- `api/internal/modules/project`
- `api/internal/modules/repocontext`
- `api/internal/modules/deepwiki`

### Frontend Modules

- `web/src/features/project`

### Database

Add:

- `project_context_snapshots`

Keep the table additive and independent.

### API

Add:

```text
POST /v1/projects/:id/context/reindex
GET  /v1/projects/:id/context
```

### UI

Extend the context page to show:

- latest snapshot timestamp
- RepoContext summary
- DeepWiki summary
- readiness report

### Out Of Scope

- no planner prompt changes yet
- no expert policy
- no execution gating changes

### Review Focus

- Is the snapshot normalized enough that downstream modules do not need to know DeepWiki internals?
- Are RepoContext and DeepWiki responsibilities still separate?

### Acceptance

The project has one active context snapshot that can be referenced by later workflow steps.

## PR 3: Expert Policy Persistence

### Goal

Turn expert scope and merge policy from loose UI/planning metadata into a project-level persisted contract.

### Why This PR Stands Alone

This is a pure domain-setup slice. It should not be mixed with planning execution changes.

### Backend Modules

- `api/internal/modules/project`

### Frontend Modules

- `web/src/features/project`
- optional reuse from `web/src/features/experts`

### Database

Add:

- `project_expert_policies`

### API

Add:

```text
POST  /v1/projects/:id/expert-policy
PATCH /v1/projects/:id/expert-policy/:policyId
GET   /v1/projects/:id/expert-policy
```

### UI

Add an editor on the context page for:

- goal boundary
- allowed paths
- forbidden paths
- required test commands
- review policy
- merge policy

### Out Of Scope

- no planner enforcement yet
- no merge action yet

### Review Focus

- Is expert policy clearly owned by the project boundary?
- Are the stored fields enough to support planning and merge later without rework?

### Acceptance

Every project can persist one active expert policy that is inspectable and editable.

## PR 4: Runtime Binding

### Goal

Make local runtime registration explicit per project and repository.

### Why This PR Stands Alone

Runtime health already exists, but the project-to-runtime mapping is implicit. This PR closes that gap without touching planning or merge.

### Backend Modules

- `api/internal/modules/execution`
- read-only support from `project`

### Frontend Modules

- `web/src/features/project`
- optional new `web/src/features/runtime`

### Database

Add:

- `runtime_bindings`

### API

Add:

```text
POST  /v1/projects/:id/runtime-bindings
GET   /v1/projects/:id/runtime-bindings
PATCH /v1/projects/:id/runtime-bindings/:bindingId
```

### UI

Add a runtime panel on the context page with:

- runtime ID
- executor type
- repo directory
- heartbeat freshness
- mismatch warnings

### Out Of Scope

- no change to actual task execution flow yet
- no planner changes

### Review Focus

- Does runtime binding validate the correct repository and working directory?
- Can the project reliably determine runtime readiness from this record?

### Acceptance

The system can say whether a project has an eligible local runtime bound to its primary repository.

## PR 5: Planning Integration With Active Context

### Goal

Make planning consume the active context snapshot and active expert policy instead of ad hoc project state.

### Why This PR Stands Alone

This is the first behavior-changing planner PR. It should be isolated so reviewers can focus on prompt and evidence changes.

### Backend Modules

- `api/internal/modules/planning`
- read-only calls into `project`

### Frontend Modules

- `web/src/features/project`
- `web/src/features/specforge`

### Database

No new table.

Optional additive columns only if needed to snapshot:

- `context_snapshot_id`
- `expert_policy_id`

on plan or execution snapshot records.

### API

Keep requirement and plan APIs stable where possible.

Behavior change:

- `CreateProjectRequirement` must load active context snapshot
- `ApprovePlan` must bind plan execution to the chosen snapshot and policy versions

### UI

Update requirement and plan review screens to:

- block execution when readiness is incomplete
- show which context snapshot and expert policy the plan is based on

### Out Of Scope

- no GitHub setup changes
- no merge flow

### Review Focus

- Does planning now depend on stable project contracts instead of live scattered state?
- Are prompts and evidence refs deterministic?

### Acceptance

A plan can be traced back to one exact project context snapshot and one expert policy.

## PR 6: GitHub Setup And Repository Onboarding Cleanup

### Goal

Make GitHub installation, repo sync, and primary repo selection a coherent first-run flow.

### Why This PR Stands Alone

This is product onboarding work. It should not be mixed with planning, execution, or merge domain logic.

### Backend Modules

- `api/internal/modules/githubintegration`
- `api/internal/modules/project`

### Frontend Modules

- `web/src/features/project`
- optional new `web/src/features/github`

### Database

No new table unless an additive field is truly required.

### API

Refine or add:

```text
GET  /v1/github/installations/status
POST /v1/github/installations/:id/sync
POST /v1/github/repositories/:id/mark-primary
```

### UI

Add or clean up:

- GitHub connection screen
- installation status
- sync repositories action
- bind primary repository flow

### Out Of Scope

- no review decision
- no merge

### Review Focus

- Can a first-time user reach `repo_bound` without hidden manual steps?
- Is primary repository selection unambiguous?

### Acceptance

A new workspace owner can connect GitHub and bind a primary repo from the UI without digging through mixed screens.

## PR 7: Review Decision Domain

### Goal

Create a first-class review domain inside CodingCTO before adding merge execution.

### Why This PR Stands Alone

Merge is risky. Before calling GitHub merge, the system needs explicit local decision state and precondition checks.

### Backend Modules

- new `api/internal/modules/review`
- read-only support from `githubintegration`
- read-only support from `verification`
- read-only support from `planning`

### Frontend Modules

None required, or only read-only placeholders if useful.

### Database

Add:

- `review_decisions`

Optional additive PR node fields:

- `review_decision_status`
- `reviewed_head_sha`

### API

Add:

```text
GET  /v1/pr-nodes/:id/review-decision
POST /v1/pr-nodes/:id/review-decision/approve
POST /v1/pr-nodes/:id/review-decision/reject
```

### Behavior

The `review` service must:

- validate CI status
- validate no blocking review state
- validate current head SHA
- expire approval on new commits

### Out Of Scope

- no GitHub merge API call yet
- no merge button yet

### Review Focus

- Is review decision a clean domain object instead of scattered condition checks?
- Are merge preconditions explicit and testable?

### Acceptance

CodingCTO can record whether a PR node is approved for merge under a specific head SHA.

## PR 8: GitHub Merge Capability

### Goal

Add the actual GitHub merge command and wire it through the review service.

### Why This PR Stands Alone

Once review decision exists, merge can be added in a focused, auditable backend change.

### Backend Modules

- `api/internal/modules/githubintegration`
- `api/internal/modules/review`

### Frontend Modules

None required in this PR.

### Database

No new table.

Optional additive fields only:

- `merge_requested_at`
- `merged_at`
- `merge_error_message`

### API

Add:

```text
POST /v1/github/pr-nodes/:id/merge
```

or a review-owned endpoint:

```text
POST /v1/pr-nodes/:id/review-decision/request-merge
```

Choose one owner and stay consistent.

Preferred owner:

- `review` owns merge initiation
- `githubintegration` owns GitHub transport

### Behavior

- call GitHub merge API
- persist attempt metadata
- rely on webhook reconciliation for final merged state

### Out Of Scope

- no PR review page yet

### Review Focus

- Is module ownership clear between review decision and GitHub transport?
- Are merge retries, failures, and webhook reconciliation safe?

### Acceptance

The backend can merge an approved PR node through GitHub and reconcile the final state.

## PR 9: PR Review And Merge UI

### Goal

Expose review decision and merge action through a dedicated PR review surface.

### Why This PR Stands Alone

At this point backend contracts are stable. Reviewers can focus purely on user flow and presentation.

### Backend Modules

- only minor API polish if needed

### Frontend Modules

- new `web/src/features/review`
- integration with `project` and `specforge` navigation

### Database

No schema change.

### UI

Add a dedicated PR review screen with:

- PR metadata
- CI status
- actionable review feedback summary
- review decision state
- merge readiness checklist
- approve merge action

### Out Of Scope

- no new backend domain logic unless the UI reveals an obvious contract gap

### Review Focus

- Does the screen answer one question: can this PR be merged now?
- Is merge blocked for the right reasons?

### Acceptance

A user can inspect one PR node, see why it is or is not mergeable, approve it, and initiate merge.

## PR 10: Hardening And End-To-End Reconciliation

### Goal

Close lifecycle edge cases and add regression coverage across the whole setup-to-merge loop.

### Why This PR Stands Alone

This PR will be broad by nature. It should come last, after the core boundaries are stable.

### Backend Modules

- `project`
- `planning`
- `execution`
- `githubintegration`
- `verification`
- `review`

### Frontend Modules

- only targeted fixes where integration gaps remain

### Database

No schema change unless a clear production bug requires one.

### Work Items

- merge approval expiry on new commits
- webhook reconciliation after manual GitHub merge
- stale runtime binding handling
- CI status refresh before merge
- review patch task and merge-decision interaction
- run completion recalculation after merged or closed nodes

### Tests

- end-to-end setup -> plan -> run -> PR -> merge flow
- regression tests for merge after fix task
- regression tests for manual GitHub merge outside CodingCTO

### Review Focus

- Are the lifecycle transitions coherent across modules?
- Do the tests cover the real operator path, not only happy-path unit cases?

### Acceptance

The full MVP loop is stable under normal review, CI, fix, and merge conditions.

## 4. What Not To Mix

To keep review quality high, avoid these combinations:

- Do not combine `project_context_snapshots` and `project_expert_policies` in one PR.
- Do not combine runtime binding storage with planner prompt changes.
- Do not combine review decision modeling with GitHub merge transport.
- Do not combine GitHub setup UX cleanup with PR review UI.
- Do not combine broad schema backfills with frontend redesign.

## 5. Reviewer Checklist Per PR

Every PR should include:

- one sentence problem statement
- one sentence non-goal statement
- touched modules list
- migration note if schema changes
- API contract examples if endpoint changes
- test summary
- rollback note

Recommended PR template section:

```text
Why this PR exists
What it changes
What it intentionally does not change
How to verify
Follow-up PRs
```

## 6. Size Guidance

Target review size:

| PR Type | Preferred Size |
|--------|-----------------|
| Read model / API contract | 300-600 LOC |
| New table + CRUD | 400-800 LOC |
| Planner behavior change | 300-700 LOC |
| UI-only flow | 250-600 LOC |
| Hardening PR | as small as possible, but likely 600-1000 LOC |

If a PR goes beyond this for valid reasons, split by behavior, not by file count.

## 7. Recommended Branch And Merge Strategy

Use linear feature branches such as:

```text
feature/mvp-pr1-project-readiness
feature/mvp-pr2-context-snapshot
feature/mvp-pr3-expert-policy
...
```

Each PR should merge into the main integration branch before the next PR depends on it.

Avoid stacking more than `2` unmerged dependency PRs unless the team is already comfortable reviewing stacked diffs.

## 8. Best Starting Point

The best first implementation slice is `PR 1`.

Reason:

- it improves product clarity immediately
- it is low-risk
- it does not require schema change
- it makes later setup and gating behavior easier to reason about

After `PR 1`, the next highest leverage slice is `PR 2`, because it creates the stable context contract the planner has been missing.

## 9. Git Delivery Rule

This breakdown must be executed with the following delivery discipline:

1. One slice, one feature branch.
2. One slice, one reviewable commit batch at minimum.
3. Push immediately after the slice passes local verification.
4. Open a GitHub PR to `dev` immediately after that slice is pushed.
5. Do not accumulate multiple completed slices locally before pushing.

Suggested branch names:

```text
feature/mvp-pr1-project-readiness
feature/mvp-pr2-context-snapshot
feature/mvp-pr3-expert-policy
feature/mvp-pr4-runtime-binding
feature/mvp-pr5-planning-active-context
feature/mvp-pr6-github-onboarding
feature/mvp-pr7-review-decision
feature/mvp-pr8-github-merge
feature/mvp-pr9-pr-review-ui
feature/mvp-pr10-hardening
```
