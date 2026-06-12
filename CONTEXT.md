# CodingCTO Domain Context

This file defines the product language that should guide future planning, UI, and implementation
work. Keep names user-facing and stable unless the domain model changes deliberately.

## Core Terms

| Term | Meaning |
| --- | --- |
| Workspace | The organization boundary for users, permissions, billing, and GitHub installations. |
| Project | The core business project entity. It is a long-lived context container for a real product, service, platform, or internal system. It stores background, PRDs, connected repositories, wiki knowledge, architecture, rules, readiness, and delivery history. |
| GitHub Connection | The workspace/user-level GitHub App connection. It authorizes GitHub owners and repositories before a project selects any repo. |
| Authorized Repository Pool | The GitHub repositories synced from connected GitHub owners/installations and available for project repository selection. |
| Project Background | The human-written description of what the product/system is, who it serves, and which constraints matter. |
| Project PRD | The durable product definition for the project itself: positioning, target users, business scope, product principles, constraints, and long-term goals. |
| Repository | A GitHub codebase selected from the authorized repository pool. A project can have one primary writable repository and additional read-only context repositories. |
| Primary Repository | The repository where CodingCTO can create branches, commits, and pull requests for the current project. |
| Context Repository | An additional repository used for planning evidence, architecture understanding, or dependency context. |
| Project Knowledge | The collected background, PRDs, repository analysis, wiki materials, architecture summaries, skills, guardrails, expert policy, and repo memory used to reduce hallucination. |
| Wiki | Generated or imported project knowledge that explains modules, architecture decisions, APIs, data model, workflows, and operational notes. |
| Architecture Snapshot | A compact, versioned summary of how the project is structured across repositories, modules, services, data, and runtime boundaries. |
| Skill | A reusable planning or execution procedure that the model can reference while generating plans, prompts, reviews, or fixes. |
| Expert Policy | Project-specific rules and standards used to judge plans and generated changes. |
| Runtime | The local or hosted executor that can run Codex CLI or another coding agent against a project repository. |
| Requirement | One requested product or engineering change inside a project. It must inherit project background, PRDs, wiki, architecture, repository context, skills, and prior delivery history. |
| Requirement PRD | The change-specific PRD generated from a user request and project context. It defines goals, user stories, business rules, decisions, non-goals, and acceptance criteria. |
| Product Plan | The product understanding for a requirement, usually derived from the Requirement PRD. |
| Technical Plan | The implementation strategy for a requirement: affected modules, data changes, APIs, UI, tests, risks, and migration notes. |
| PR DAG | A dependency graph of reviewable pull request nodes generated from a technical plan. |
| Task | A scoped implementation unit derived from a technical plan. A task can become a PR node, prompt run, validation step, or manual decision. |
| PR Node | One planned delivery unit in the PR DAG with scope, dependencies, acceptance criteria, prompt, and status. |
| Prompt | The scoped instruction compiled for a PR node, fix attempt, or review response. |
| Run | An approved execution of a plan through the runtime and GitHub delivery loop. |
| Delivery History | The requirements, plans, runs, prompts, PRs, reviews, CI results, failures, and decisions associated with a project. |

## Product Model

A project is not a one-time task, a single repository form, or an agent dashboard. It is the durable
business context CodingCTO uses to understand a product/system over time.

Requirements, requirement PRDs, plans, tasks, runs, prompts, and pull requests are events or
artifacts inside that project. They should inherit the project background, project PRDs,
repositories, wiki, architecture, skills, rules, and prior delivery history.

The expected implementation flow is:

```text
Workspace/user GitHub connection
  -> Authorized repository pool
  -> Project context
  -> Primary/context repository selection
  -> Requirement
  -> Requirement PRD
  -> Technical plan
  -> Tasks / PR DAG
  -> Compiled prompts
  -> Runtime execution
  -> GitHub PR delivery
```

## UI Implication

The project home should answer:

```text
What is this project?
What does CodingCTO know about it?
Which PRDs, wiki pages, repositories, and architecture snapshots support future work?
Is the knowledge fresh enough to plan safely?
What is the next useful action?
Where is the latest delivery work?
```

Setup details, GitHub installation internals, runtime diagnostics, prompt text, and CI logs should
be available, but they should not dominate the default project home.

The normal repository flow is not project-level manual GitHub setup. Users connect GitHub once from
the global workspace/user settings, CodingCTO syncs authorized owners and repositories, and each
project selects its primary and context repositories from that authorized pool.
