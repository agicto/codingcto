# CodingCTO Product Architecture

CodingCTO turns a product change request into review-ready GitHub pull requests.

The product should stay focused on one promise:

```text
Describe a change. Approve the plan. Review the PRs.
```

CodingCTO is not an agent dashboard, project-management clone, IDE, or generic chat surface. It is
a GitHub-native delivery compiler that manages product and engineering artifacts.

## 1. Interaction Model

### User Goal

The primary user is a CTO, founder, tech lead, or maintainer who can review GitHub PRs but does not
want to manually write PRDs, split tasks, write prompts, monitor CI, or coordinate dependent PRs.

### Starting Context

The user starts from a workspace and project. A project represents one product or system boundary
and has one writable primary repository plus optional read-only context repositories.

### Objects Being Acted On

Users should understand and act on these objects in this order:

1. `Workspace`: organization and permission boundary.
2. `Project`: product/system boundary.
3. `Repository`: code context and execution boundary.
4. `Requirement`: raw product intent.
5. `Plan`: product understanding, technical plan, PR DAG, risks, and assumptions.
6. `ExecutionRun`: the approved plan being executed.
7. `PullRequest`: the final GitHub-native delivery unit.

### Primary Action

The primary user action is not "run an agent". It is:

```text
Approve a plan and receive reviewable pull requests.
```

### Completion Signal

The user sees completion when the run produces one or more GitHub PRs in `ready_for_review` or
`merged` state, with a test plan, risk notes, and CI status.

### Reversibility

Users must be able to cancel an execution run before a PR node is actively running. Once code is
pushed to GitHub, recovery happens through GitHub-native actions: close PR, request changes,
comment with feedback, or merge.

## 2. Chosen Product Pattern

CodingCTO should use a project-centered delivery console, not a single overloaded workbench.

The current prototype places too many concerns on one page:

- Project setup.
- Repository binding.
- Repo context.
- Skill state.
- Requirement intake.
- Plan review.
- Prompt contract inspection.
- Runtime status.
- Execution run status.
- CI/fix attempts.
- PR delivery.

This makes every state feel equally important. The product should instead use a shallow console
navigation model with one job per screen.

## 3. Screen Flow

### 3.1 Projects

Route:

```text
/console/projects
```

Question answered:

```text
Which product/system am I working on?
```

Primary action:

```text
Create project
```

Secondary actions:

- Open project.
- View repository readiness.
- View latest run status.

### 3.2 Project Overview

Route:

```text
/console/projects/:projectId
```

Question answered:

```text
What is the next useful action for this project?
```

Primary next actions by state:

| State | Next Action |
|-------|-------------|
| No repository | Connect or bind repository |
| Repository bound but no context | Analyze repository context |
| Context ready but no requirement | Create requirement |
| Plan awaiting approval | Review plan |
| Run active | Open run |
| PRs ready | Review PRs |

Overview should show only:

- Project identity.
- Primary repository.
- Context readiness.
- Latest requirement/plan/run.
- Next action.
- Recent PR delivery status.

It should not show full prompt text, CI logs, runtime internals, or editable repo profiles.

### 3.3 Repository Context

Route:

```text
/console/projects/:projectId/context
```

Question answered:

```text
Is this project ready for reliable planning and execution?
```

Primary action:

```text
Analyze context
```

Sections:

- Bound repositories.
- Primary vs read-only context roles.
- Repo profile.
- Architecture snapshot.
- Test commands.
- CI workflows.
- Risk areas.
- Project and repo skills.
- Context readiness warnings.

This page is a quality gate. It should report readiness, not feel like a generic settings editor.

### 3.4 Requirement Intake

Route:

```text
/console/projects/:projectId/requirements/new
```

Question answered:

```text
What product change should CodingCTO plan?
```

Primary action:

```text
Generate plan
```

The intake surface should be intentionally small:

- Product change text.
- Optional mode: feature, bugfix, refactor, docs, test.
- Optional GitHub issue link.
- Optional constraints.

It should not ask twenty questions before generating a recommended plan. Defaults should be
recommended by the system and reviewed during plan approval.

### 3.5 Plan Review

Route:

```text
/console/projects/:projectId/plans/:planId
```

Question answered:

```text
Did CodingCTO understand the change correctly, and should it start execution?
```

This is the most important product page.

Information hierarchy:

1. Product goal.
2. Default decisions.
3. Technical summary.
4. PR DAG.
5. Risks and assumptions.
6. Questions requiring user confirmation.
7. Approval action.

Primary action:

```text
Approve & Start
```

Secondary actions:

- Edit decisions.
- Regenerate plan.
- Cancel.

Plan approval is the only required human checkpoint before execution.

### 3.6 Execution Run

Route:

```text
/console/projects/:projectId/runs/:runId
```

Question answered:

```text
Where are my PRs?
```

Primary information:

- Overall run status.
- PR DAG status.
- Ready PRs.
- Running/fixing nodes.
- Blocked nodes.
- Next system action.

Secondary information:

- Task events.
- Runtime details.
- Failure logs.

The user should not manage individual agents here. They should manage delivery state.

### 3.7 Pull Request Delivery

Route:

```text
/console/projects/:projectId/prs
```

Question answered:

```text
What did CodingCTO deliver, and what needs review?
```

This surface should be GitHub-native:

- GitHub PR link.
- Summary.
- Scope.
- Test plan.
- CI state.
- Risk notes.
- Dependencies.
- Review feedback state.

## 4. Information Hierarchy

Across all product surfaces, information should be ordered by decision value:

1. Current state.
2. Primary object identity.
3. Next action.
4. Blocking risks.
5. Supporting details.
6. Logs and metadata.

Avoid giving equal visual weight to setup, planning, prompt, execution, and CI internals on one
screen. If everything is visible, the user cannot tell what matters.

## 5. Interaction Rules

### Navigation

Use stable left navigation for primary areas:

- Projects.
- Delivery.
- Review Queue.
- GitHub Setup.
- Runtimes.
- Skills.
- Settings.

Within a project, use project-level tabs or subnavigation:

- Overview.
- Context.
- Requirements.
- Plans.
- Runs.
- PRs.
- Settings.

### Primary Actions

Each screen gets one dominant primary action:

| Screen | Primary Action |
|--------|----------------|
| Projects | Create project |
| Project overview | Continue next action |
| Context | Analyze context |
| Requirement intake | Generate plan |
| Plan review | Approve & Start |
| Execution run | Open ready PR |
| PR delivery | Review in GitHub |

### Secondary Actions

Secondary actions must stay near the object they affect:

- Repository edit actions live on context/settings surfaces.
- Prompt inspection lives under plan/run developer details, not the main happy path.
- Runtime sweeps live under runtime settings/admin, not run delivery.
- CI logs live behind failed PR nodes, not always visible.

### Destructive Actions

Require explicit confirmation for:

- Removing a repository binding.
- Cancelling an active run.
- Closing or abandoning a PR node.
- Regenerating a plan after approval.

### Prompt Visibility

Compiled prompts are important for trust and debugging, but they are not the default product view.
Show a prompt preview behind a `View prompt` action on the PR node.

## 6. State Model

Every major surface must define these states:

| State | Required Behavior |
|-------|-------------------|
| Loading | Skeleton or compact progress message tied to the object being loaded |
| Empty | Explain what is missing and offer one next action |
| Populated | Show current status, object identity, and next action first |
| Validation error | Keep user input, show field-level or section-level correction |
| System error | Explain what failed, whether retry is safe, and where to check setup |
| Permission denied | Explain the missing role or GitHub permission |
| Success | Show the resulting artifact and next action |
| Long content | Collapse logs/prompts/details behind progressive disclosure |

## 7. Feedback and Recovery

User actions should give immediate, local feedback:

- `Analyze context`: show context job status and update readiness.
- `Generate plan`: show generation progress and route to plan review when ready.
- `Approve & Start`: freeze the plan snapshot and create an execution run.
- `Cancel run`: show which tasks were cancelled and which PRs already exist.
- `Read failure log`: attach logs to the failed PR node.

Failure recovery should be decision-oriented:

```text
What failed?
Why did it likely fail?
Can CodingCTO safely retry?
What decision does the user need to make?
```

## 8. Product Module Roadmap

The implementation should proceed in larger, coherent module PRs:

1. Project Overview IA
   - Split the overloaded workbench into a project overview and focused subroutes.
   - Outcome: users can understand the current project state and next action quickly.

2. Context Readiness
   - Turn repo profile, architecture, skills, and warnings into a clear readiness gate.
   - Outcome: users know whether the project is safe to plan against.

3. Requirement Intake
   - Make requirement creation minimal and product-focused.
   - Outcome: users can describe a change without managing implementation details.

4. Plan Review
   - Make product/technical plan approval the central decision page.
   - Outcome: users understand goal, decisions, risks, and PR DAG before approving.

5. Execution Run Delivery
   - Move run progress, PR DAG status, CI/fix attempts, blockers, and GitHub PR links into a
     delivery-first view.
   - Outcome: users can track PR delivery without managing agents.

6. PR Delivery History
   - Provide a GitHub-native history of delivered PR sets.
   - Outcome: users can review what CodingCTO produced over time.

7. Runtime and Admin Settings
   - Move executor runtime, sweeps, and low-level operational details out of the main workflow.
   - Outcome: setup and operations remain available without distracting from delivery.

## 9. Visual and Interaction Direction

CodingCTO should use a restrained, Swiss-inspired console style:

- Dense but readable information.
- Clear grid alignment.
- Low ornamentation.
- Mostly neutral surfaces with restrained semantic color for status.
- 4px radius for buttons and compact controls where practical.
- Cards only for repeated entities, panels, and modals.
- No marketing-style hero sections inside the console.
- No agent avatars or employee-like metaphors in the core workflow.

## 10. Usability Risks

### Risk: The Product Becomes an Agent Dashboard

Mitigation:

Focus labels on artifacts: plan, PR DAG, run, PR, blocker. Avoid presenting workers as entities
the user must manage.

### Risk: The Project Page Becomes a Dumping Ground

Mitigation:

Project overview should only show identity, readiness, next action, and recent delivery. Move
details to context, plans, runs, and PR pages.

### Risk: Prompt Controls Overwhelm Non-Expert Users

Mitigation:

Keep prompt inspection available but secondary. The default user path should not require reading or
editing prompts.

### Risk: Context Readiness Is Too Hidden

Mitigation:

Expose context readiness before plan generation and show exactly what is missing.

### Risk: Blockers Are Too Technical

Mitigation:

Escalation summaries must be written as decision options with recommended action, impact, and risk.

## 11. Next Implementation Decision

The next UI module should not add more controls to the current workbench. It should create a clean
project overview and route-level separation for:

```text
Project overview -> Context -> Requirement -> Plan -> Run -> PRs
```

This creates a stable product spine for the remaining backend and executor work.
