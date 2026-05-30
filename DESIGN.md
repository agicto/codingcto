# CodingCTO Design Direction

CodingCTO is a developer-facing engineering workflow product. The interface should feel precise, quiet, and trustworthy: closer to a command center for plans, repositories, prompts, runs, and PR delivery than a generic task board.

## Palette

- Canvas: graphite-tinted neutrals for calm density.
- Surfaces: white in light mode, near-black graphite in dark mode.
- Primary: electric engineering blue for primary actions and focus.
- Success: green for ready PRs, completed checks, and healthy runtimes.
- Warning: amber for plan review, pending decisions, and CI attention.
- Error: red for blocked runs, failed checks, and destructive states.

## Token Rules

- Components should use semantic theme tokens such as `bg-bg-surface`, `text-text-main`, `border-border-subtle`, `text-primary`, `bg-primary-subtle`, `text-success`, and `text-warning`.
- Raw hex colors should be avoided in app UI. Add or adjust semantic tokens instead of introducing one-off colors.
- Marketing gradients are not the default product UI style. Use blue accents sparingly to show state, selection, and execution affordances.

## Product UI Principles

- Prioritize the business workflow: project, repositories, repo intelligence, skills, plan approval, PR DAG, prompt contracts, Codex execution, and PR delivery.
- Keep controls dense but readable. This is an operational tool for repeated review, not a landing page.
- Avoid agent-management language unless the user is configuring executor runtimes. The main object is the delivery artifact: a plan and its PR set.
