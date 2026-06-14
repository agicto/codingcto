# CodingCTO Product Requirements

**Status**: Draft
**Audience**: Product, design, and engineering
**Last updated**: 2026-06-12

## 1. Product Goal

CodingCTO helps a technical founder, CTO, maintainer, or small engineering team turn a product
change request into reviewable GitHub pull requests.

A CodingCTO project is the core business project entity. It is a long-lived context container for a
real product, service, platform, or internal system. It stores the product background, PRDs, connected
repositories, wiki and architecture knowledge, planning rules, expert policy, runtime readiness, and
delivery history. Requirements, plans, tasks, runs, prompts, and PRs are delivery artifacts created
inside that project context.

Every implementation request should depend on the project context first. CodingCTO should use the
project background, PRDs, wiki, architecture, repositories, skills, and prior delivery history to
generate the requirement PRD, break it into an implementation plan, split that plan into tasks or PR
nodes, and compile scoped prompts for execution.

The product promise is:

```text
Describe a change. Approve the plan. Review the PRs.
```

CodingCTO is not an agent dashboard, project-management board, IDE, generic chat app, or GitHub
settings console. It is a GitHub-native product and engineering delivery compiler.

## 2. Primary User Story

As a technical lead, I want to describe a product change in natural language, let CodingCTO
understand the repository, generate a product plan, technical plan, PR DAG, and scoped prompts, then
execute the approved plan into GitHub PRs, so that I can spend my time reviewing product and code
decisions instead of manually managing agents and task breakdowns.

## 3. Success Metrics

- A first-time user can create a project and understand the next required action in under one minute.
- A ready project can generate a requirement plan and PR DAG without manual prompt writing.
- A generated plan has a clear approval decision and traceable evidence from repo context, skills,
  and expert policy.
- At least one PR node can move from approved plan to ready-for-review GitHub PR in the MVP flow.
- Users can always see the next action without understanding internal objects such as runtime
  heartbeats, installation sync records, or prompt evidence refs.

## 4. Core Product Loop

```text
Connect GitHub at workspace/user level
  -> sync authorized owners and repositories
  -> create project context
  -> describe product background
  -> add or generate project PRD/wiki/architecture context
  -> select a primary repository from authorized repositories
  -> add optional context repositories
  -> build wiki and architecture knowledge
  -> configure planning and execution readiness
  -> create requirement
  -> generate requirement PRD
  -> review generated plan and PR DAG
  -> approve execution
  -> receive reviewable GitHub PRs
  -> handle CI/review feedback
  -> approve merge
```

## 5. Object Model

Users should understand the product through these objects, in this order:

| Object | User-facing meaning |
| --- | --- |
| Workspace | Organization boundary |
| Project | Long-lived product or system context containing background, repositories, wiki, architecture, rules, and delivery history |
| GitHub Connection | Workspace/user-level GitHub App connection that authorizes owners and repositories before any project binds a repo |
| Authorized Repository Pool | Repositories visible to CodingCTO after the GitHub App installation is synced |
| Project PRD | Durable product definition for the project itself: positioning, users, scope, business rules, and constraints |
| Repository | GitHub codebase selected from the authorized repository pool; one project can have a primary writable repo and additional context repos |
| Project Knowledge | Background, PRDs, architecture notes, generated wiki, context snapshots, skills, guardrails, expert policy, and repo memory |
| Requirement | One product or engineering change requested inside a project |
| Requirement PRD | A change-specific PRD generated from the user request and project context |
| Plan | Product understanding, technical plan, task/PR DAG, risks, and assumptions |
| Task | A scoped unit of work derived from a plan; tasks may map to PR nodes, prompt runs, checks, or manual decisions |
| Prompt | Scoped implementation instruction for a PR node |
| Run | Approved execution of a plan |
| PR | GitHub-native delivery unit |

Internal objects such as installation records, runtime heartbeat, context snapshot, expert policy,
task events, and fix attempts should support the flow, but they should not dominate the default UI.

## 6. Page Responsibilities

### Projects

Route:

```text
/console/projects
```

Question answered:

```text
Which product or system context am I working on?
```

Primary action:

```text
Create project
```

This page should stay simple. It should not explain the full GitHub, runtime, expert, planning, and
PR delivery system.

### Project Home

Route:

```text
/console/projects/:projectId
```

Question answered:

```text
What does CodingCTO know about this project, and what should I do next?
```

This page must show:

- Project name and short description.
- Product background or mission, when provided.
- Project PRD and wiki coverage.
- Project status.
- Selected repositories: primary writable repo plus any context repos.
- Wiki, architecture, and context freshness.
- Skills, rules, and expert policy readiness.
- One recommended next action.
- A compact readiness checklist.
- Latest requirement, plan, run, or PR activity.

This page must not default to showing:

- GitHub installation ID forms.
- GitHub App installation internals.
- Full runtime internals.
- Long diagnostics.
- Prompt text.
- CI logs.
- Context snapshot internals.

Those belong in setup, context, plan, run, or PR detail surfaces.

Repository selection on this page should assume GitHub was already connected at the workspace or
user level. If GitHub is not connected, the next action should send the user to the global GitHub
connection flow. If GitHub is connected, the next action should let the user choose a primary
repository from the authorized repository pool. A project should not ask a normal user to manually
enter a GitHub installation ID.

### Repository Context

Route:

```text
/console/projects/:projectId/context
```

Question answered:

```text
Does CodingCTO have enough project, repository, wiki, and architecture evidence to plan safely?
```

This page owns project knowledge: project background, project PRD, connected repositories,
repository analysis, wiki materials, architecture summaries, context snapshots, skills, guardrails,
expert policy, and runtime binding.

It should make the project feel like a memory base, not a GitHub settings screen.

### Requirement Intake

Route:

```text
/console/projects/:projectId/requirements/new
```

Question answered:

```text
What change should CodingCTO plan?
```

The intake should be small: one primary text field, optional type, optional issue/link/context. The
system should propose defaults instead of asking many upfront questions.

### Plan Review

Route:

```text
/console/projects/:projectId/plans/:planId
```

Question answered:

```text
Did CodingCTO understand the change, and should execution start?
```

This is the main decision page. It should show product understanding, decisions, technical summary,
PR DAG, risks, evidence, prompt preview, and approve/start controls.

### Delivery Board

Route:

```text
/console/projects/:projectId/codingcto
```

Question answered:

```text
What is happening across requirements, plans, runs, and PRs?
```

This page is for monitoring, not for initial setup.

### PR Review

Route:

```text
/console/projects/:projectId/prs/:prNodeId
```

Question answered:

```text
Is this PR node ready to merge or does it need changes?
```

This page owns PR status, CI status, review decision, fix attempts, and merge request.

## 7. Interaction Principles

- Show one primary action per page state.
- Move advanced setup and diagnostics behind secondary actions.
- Use product language first, internal system language second.
- Prefer progressive disclosure over large all-in-one pages.
- Keep create flows short and reversible.
- Do not ask users to manage agents; show delivery artifacts instead.
- A blocked state must explain the blocker and the next action in one sentence.
- A ready state must make requirement creation obvious.

## 8. MVP Scope

In scope:

- Create project.
- Add project background.
- Add or generate project PRD/wiki/architecture context.
- Connect GitHub once at workspace/user level.
- Sync authorized GitHub owners, installations, and repositories.
- Select one primary GitHub repository for a project and show the model for additional context repos.
- Analyze repository context, wiki knowledge, and architecture materials.
- Configure readiness inputs needed for safe planning and execution.
- Create requirement.
- Generate requirement PRD from project context.
- Generate plan and PR DAG.
- Generate implementation tasks from the plan.
- Preview scoped prompts.
- Approve plan.
- Dispatch a local runtime.
- Create GitHub PRs.
- Surface CI/review status.

Out of scope:

- Multi-primary repository execution.
- Cross-repo PR orchestration.
- Full project management board.
- Generic agent employee management.
- IDE replacement.
- Enterprise approval workflows.
- Fully autonomous merge without explicit review policy.

## 9. Refactor Direction

The current UI should be refactored around page ownership:

1. Keep `/console/projects` as a minimal project list and creation surface.
2. Make `/console/projects/:projectId` a true project home for business background, project PRD,
   repositories, wiki, architecture, readiness, and one next action.
3. Move setup-heavy controls to context/setup sections or secondary drawers.
4. Move planning-heavy controls to plan review.
5. Move runtime and PR-heavy controls to delivery and PR detail pages.
6. Remove duplicated workbench surfaces once the project-centered flow is stable.

The refactor is successful when a new user can open a project and immediately answer:

```text
What is this project?
What does CodingCTO know about it?
Is it ready?
What should I do next?
Where do I review the latest work?
```
