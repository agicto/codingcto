---
name: codingcto-product-ui
description: Design, review, and implement CodingCTO console UI and product flows. Use when working on Project, GitHub repository binding, requirements, planning, PR DAG, prompt preview, execution, settings, navigation, information architecture, visual redesign, interaction simplification, or browser-based UI verification for CodingCTO.
---

# CodingCTO Product UI

## Product Anchor

CodingCTO turns a product idea into reviewable GitHub pull requests. Every console screen must serve this flow:

```text
Project context -> Repository readiness -> Requirement intake -> Product plan -> Technical plan -> PR DAG -> Prompt preview -> Execution -> Reviewable PRs
```

Optimize for a technical founder or CTO who wants fewer decisions, clearer delivery state, and trustworthy GitHub output.

## Operating Mode

Before changing UI, write a one-sentence design read:

```text
This is a [page kind] for [user] to [job], so the UI should prioritize [one primary action] and hide [secondary complexity].
```

Then classify the work:

- **Greenfield**: create a new flow from the product model.
- **Preserve**: improve hierarchy without changing routes, field names, or API contracts.
- **Overhaul**: simplify a confusing screen, but preserve business capabilities unless explicitly removed.

## Domain Rules

- **Workspace**: organization/account boundary. Owns users, GitHub installation, settings, authorized repository pool.
- **Project**: business product entity. Stores background, PRDs, wiki, architecture notes, and one or more bound repositories.
- **Repository**: code context. Comes from the workspace GitHub connection, then gets bound to a project.
- **Primary repository**: the default repo used for readiness, requirement planning, prompt generation, and execution.
- **Requirement**: a user idea captured against a project and its context.
- **Plan**: generated product plan, technical plan, PR DAG, and compiled prompts.

Do not confuse workspace GitHub connection with project repository binding:

- Settings connects GitHub and syncs authorized repositories.
- Project selects repositories from the synced pool.
- Requirement and Plan depend on the project context plus selected repository context.

## Page Responsibilities

### Projects List

Purpose: find or create a project.

Keep it simple:

- Project name
- One-line context/status
- Primary repo status
- Last activity
- Create project action

Avoid showing planning internals, long readiness explanations, or GitHub installation details here.

### Project Detail

Purpose: make a project ready to generate requirements.

Primary modules:

- Project background
- Bound repositories with primary repo
- Readiness summary
- New requirement entry
- Recent requirements/plans

Do not place global GitHub setup forms on the project page. If GitHub is not connected, show a concise empty state linking to settings.

### GitHub Settings

Purpose: connect GitHub once for the workspace and sync the authorized repository pool.

Show:

- Connection status
- Connected owner/account
- Authorized repository count
- Sync action
- Reconfigure GitHub App action

Avoid manual project-binding controls here.

### Repository Binding

Purpose: bind an authorized GitHub repository to a project.

Preferred interaction:

- Small "Bind repository" action in the project repository section.
- Dialog lists authorized GitHub repos.
- User selects repo and role, then confirms.
- Already-bound repos are visible but disabled or clearly marked.

### Requirement Intake

Purpose: capture the idea without forcing the user to write a full PRD.

Prefer one focused input with optional structured context. The CTA should be "Generate plan" or equivalent.

### Plan Review

Purpose: CTO decision point before execution.

Show:

- Product understanding
- Key decisions
- Technical summary
- PR DAG
- Risks
- Prompt preview entry
- Approve and start action

Do not turn this into a task board.

## Visual System

Use a Swiss, minimal, production-console style:

- Radius: 4px by default.
- Palette: neutral canvas, black/near-black text, subtle borders, one restrained accent.
- Density: compact but breathable.
- Typography: clear hierarchy, no oversized marketing hero type inside console screens.
- Layout: left navigation, narrow page headers, focused content modules.
- Components: use shadcn primitives and existing app tokens.

Avoid:

- Purple mesh gradients, decorative blobs, fake dashboards, generic three-card rows.
- Long paragraphs in primary task flows.
- Nested cards inside cards.
- Decorative status dots unless they encode real state.
- Large marketing hero sections inside the console.
- Swiss style as a reason to make controls cryptic.

## Interaction Rules

- One primary action per screen or module.
- Put secondary actions in menus, dialogs, or smaller inline buttons.
- Prefer dialogs for binding/selecting repositories; prefer dedicated pages for creating requirements and reviewing plans.
- Keep labels action-oriented: "Bind repository", "Generate plan", "Preview prompts".
- Show readiness as a short decision: ready, needs repository, needs scan, blocked.
- If the user cannot proceed, state the missing prerequisite and provide the next action.
- Do not expose internal IDs unless they help debugging or disambiguation.

## Localization Rules

- Product UI may be localized.
- English locale must be polished English.
- Chinese locale must be natural Chinese, not mixed with English except product or GitHub terms.
- Commit messages, PR descriptions, docs, and code comments stay English.
- Never leave raw i18n keys visible in the browser.

## Implementation Rules

- Follow `web/AGENTS.md`.
- Use feature-first components under `web/src/features`.
- Use semantic tokens and existing primitives before adding custom CSS.
- Keep API contracts explicit; do not invent frontend-only business states when backend state exists.
- Preserve routes, params, and form names unless the task is explicitly an overhaul.
- Do not hard-code localhost, repo names, workspace IDs, or project IDs into product code.

## Browser Verification

After meaningful UI changes, use the in-app browser against the local app and verify the actual user path.

Minimum checks:

- The target page loads without runtime error.
- Primary CTA is visible without hunting.
- Dialogs open and close.
- Empty, loading, success, and disabled states make sense.
- No raw i18n keys are visible.
- Text does not overflow or overlap at desktop width.
- The flow matches the business responsibility of the page.

For Project/GitHub work, verify:

```text
Settings GitHub tab -> repository pool is understandable
Project detail -> bound repository section is understandable
Bind repository dialog -> authorized repos list appears
Already-bound repo -> cannot be rebound accidentally
New requirement entry -> visible once project is ready enough
```

## Pre-Flight Check

Before calling a UI task complete, confirm:

- The screen has one clear job.
- The primary action is obvious.
- Global settings and project-specific binding are not mixed.
- Technical details are collapsed unless needed.
- The page uses the CodingCTO visual system.
- Browser verification was performed or a clear reason is reported.
- Type check and lint were run when code changed.
