# SpecForge PRD

## Product Goal

SpecForge turns a product idea into review-ready GitHub pull requests.

The target user is a CTO, founder, tech lead, or senior maintainer who can review code but does not want to manually write a PRD, split engineering work, write coding-agent prompts, track CI failures, and coordinate dependent PRs.

The product promise is:

```text
Describe a feature. Review the plan. Get pull requests.
```

## Positioning

SpecForge is not an AI employee dashboard, task board, IDE, or generic coding chat.

SpecForge is a GitHub-native PRD-to-PR compiler:

```text
Product idea
  -> Product plan
  -> Technical plan
  -> PR dependency graph
  -> Coding prompts
  -> Branches and commits
  -> GitHub PRs
  -> CI diagnosis and fixes
  -> Review-ready delivery
```

The product manages delivery artifacts, not agents. Users should see the plan, PR DAG, execution state, blockers, and final PRs. They should not need to manage worker threads or prompt individual agents.

## MVP Scope

The MVP supports one GitHub repository and one product idea at a time.

The core MVP flow is:

1. Connect a GitHub repository.
2. Analyze repository context.
3. Accept a natural-language product idea.
4. Generate a product plan.
5. Generate a technical plan.
6. Generate a PR DAG with 1-5 focused PR nodes.
7. Ask the user to approve the plan once.
8. Create an execution run.
9. Execute PR nodes in dependency order.
10. Create branches and GitHub PRs.
11. Read CI status and failure logs.
12. Attempt automatic fixes for lint, type, and test failures.
13. Escalate when the system needs a product or architecture decision.
14. Deliver ready-to-review PRs in GitHub.

## Non-Goals

The MVP does not try to solve every software delivery workflow.

Out of scope for the initial product:

- Multi-repository dependency orchestration.
- Jira, Linear, Slack, or enterprise workflow integrations.
- Multi-agent employee dashboards.
- Fully autonomous production deployment.
- Enterprise SSO, audit, or private deployment.
- Large legacy monorepo support.
- Design generation as a primary workflow.

## Core Business Objects

- `Repository`: a GitHub repository connected to the workspace.
- `RepoProfile`: a compact summary of stack, structure, CI, test commands, conventions, and risk areas.
- `Idea`: the user's raw product intent.
- `ProductSpec`: product goals, rules, assumptions, non-goals, and acceptance criteria.
- `ImplementationPlan`: technical plan, affected modules, risks, and execution strategy.
- `PRNode`: one reviewable PR unit with dependencies, scope, acceptance criteria, test commands, and branch metadata.
- `ExecutionRun`: one approved plan being executed.
- `AgentTask`: one executor attempt for a PR node.
- `FixAttempt`: one CI or verification repair attempt.
- `EscalationSummary`: a decision-ready explanation when automation cannot safely continue.

## Architecture Direction

SpecForge is built as a set of services around GitHub:

```text
Frontend Console
  -> API Server
  -> Repo Context Service
  -> Planner Service
  -> Prompt Compiler
  -> Execution Orchestrator
  -> Executor Runner
  -> Verification Service
  -> GitHub Integration
```

### Repo Context Service

Responsible for cloning or fetching repository context, detecting stack and conventions, finding test commands, reading CI configuration, identifying risk areas, and producing a compact repo profile for planners and executors.

### Planner Service

Responsible for converting an idea into a product plan, technical plan, and PR DAG. It should validate that every PR node is scoped, testable, reviewable, and connected to a product goal.

### Prompt Compiler

Responsible for compiling PR nodes, fix attempts, and review feedback into deterministic executor prompts. Each prompt should be versioned and traceable to the resulting commits and tasks.

### Execution Orchestrator

Responsible for running the PR DAG, creating tasks, respecting dependencies, preventing unsafe execution on blocked runs, allowing valid retries, and tracking run completion.

### Executor Runner

Responsible for adapting to the actual coding agent. Codex CLI can be the first executor, but the architecture must keep a stable executor interface so future backends can be added.

### Verification Service

Responsible for local checks, GitHub CI status, failure log ingestion, failure classification, auto-fix attempts, retry budgets, and escalation summaries.

### GitHub Integration

Responsible for GitHub App authentication, branch operations, PR operations, Actions workflow status, checks, webhooks, and PR comment/review events.

## Product Principles

### PR Is the Delivery Unit

The system should always converge on GitHub PRs. Plans, prompts, and run logs are supporting artifacts, not the final product.

### One Required Human Decision

The user must approve the generated plan before execution starts. After approval, the system should continue automatically unless it hits a semantic blocker.

### Small PRs Beat Agent Parallelism

Correct PR boundaries and dependencies are more important than showing many agents running at once. Each PR should be understandable, testable, and reviewable.

### Failure Is a First-Class Path

CI and verification failures are expected. The system must classify failures, attempt bounded fixes, and escalate with clear options when it cannot continue safely.

### Executor Independence

The product should not be locked to one coding agent. Codex CLI is a practical first implementation, not the core moat.

## Current Implementation Status

The current Luas implementation has the foundation for:

- SpecForge console UI.
- Repository profile and plan display.
- Product spec, implementation plan, and PR DAG concepts.
- Plan approval and execution run concepts.
- PR node task state tracking.
- Stacked PR dependency behavior.
- Execution events.
- CI fix attempt metadata.
- Auto-fix budget and repeated failure guardrails.
- Blocked execution runs.
- Retry recovery for failed or cancelled tasks.
- Escalation summary display.

## Remaining MVP Work

The next important work items are:

1. Complete production-grade GitHub App installation and permission flow.
2. Implement the real Codex CLI executor runner with sandboxed workspaces.
3. Persist and expose prompt versions for PR nodes and fix attempts.
4. Strengthen CI log ingestion and failure classification.
5. Turn PR comments and review feedback into patch tasks.
6. Add actionable escalation decisions, including replan and continue-with-option flows.
7. Add repo memory from approved plans, merged PRs, and rejected feedback.
8. Add stronger end-to-end tests across plan approval, execution, CI failure, retry, and blocked recovery.

## Success Metrics

The north-star metric is:

```text
Weekly ready-to-review PR sets delivered from approved product ideas.
```

Supporting metrics:

- Repository indexing success rate.
- Plan generation completion rate.
- Plan approval rate.
- PR creation success rate.
- CI first-pass rate.
- CI auto-fix success rate.
- Ready-to-review PR rate.
- PR merge rate.
- User retry and repeat-idea rate.

## MVP Acceptance Criteria

The MVP is acceptable when:

1. A user can connect one GitHub repository.
2. SpecForge can generate a repo profile.
3. A user can submit a feature idea.
4. SpecForge can generate product and technical plans.
5. SpecForge can generate a 1-5 node PR DAG.
6. A user can approve the plan once.
7. SpecForge can create branches and PRs.
8. A coding executor can modify code for each PR node.
9. SpecForge can read GitHub Actions CI status and logs.
10. SpecForge can auto-fix common lint, type, and test failures at least once.
11. SpecForge can block and explain semantic failures.
12. The user can review final PRs directly in GitHub.
