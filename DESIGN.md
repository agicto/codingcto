# CodingCTO Design Direction

CodingCTO is a developer-facing engineering workflow product. The interface should feel direct, restrained, and reviewable: a workspace for projects, repositories, plans, prompts, runs, and pull requests.

The product UI uses an Apple-inspired operational style: parchment canvas, near-invisible chrome, blue single-accent actions, restrained typography, and soft utility cards. It should feel quiet, precise, and spacious without turning the console into a marketing page.

## Palette

- Canvas: parchment `#f5f5f7` for main workspace backgrounds.
- Surfaces: white `#ffffff` in light mode, near-black graphite in dark mode.
- Primary: action blue `#0066cc` for primary actions, links, focus rings, and selected markers.
- Primary on dark: sky blue `#2997ff` for dark surfaces only.
- Canvas soft: neutral gray `#f3f3f3` for chips, input rows, subtle buttons, and utility surfaces.
- Text: near-black ink `#1d1d1f` for headings and key UI; muted gray for secondary copy.
- Success: green for ready PRs, completed checks, and healthy runtimes.
- Warning: amber for plan review, pending decisions, and CI attention.
- Error: red for blocked runs, failed checks, and destructive states.

## Token Rules

- Components should use semantic theme tokens such as `bg-bg-surface`, `text-text-main`, `border-border-subtle`, `text-primary`, `bg-primary-subtle`, `text-success`, and `text-warning`.
- Raw hex colors should be avoided in app UI. Add or adjust semantic tokens instead of introducing one-off colors.
- Blue is the only product accent. Do not introduce secondary brand colors for normal UI emphasis.
- Marketing gradients are not the product UI style. Use surface rhythm, spacing, and typography before decoration.
- Buttons, chips, and icon controls use pill radii by default.
- Cards and panels use 18px radii. Smaller 8px radii are reserved for fields and compact utility chrome.
- Default cards are flat with hairline borders. Avoid shadows on cards and buttons; reserve soft elevation for dialogs.

## Typography

- Use the app sans family at weight 600 for page-level product moments. Avoid all-caps display headings.
- Use regular/400 for body and buttons, semibold/600 for emphasis.
- Use subtle negative letter spacing on display and body sizes to get the Apple-tight cadence.
- Keep body text at 17px where the surface is editorial; compact console labels may remain 12-14px.

## Shape & Components

- Primary button: action blue background, white text, 999px pill radius.
- Secondary/outline button: white or pearl surface, action blue or ink text, hairline border, 999px pill radius.
- Sidebar item: white background by default, soft-gray pill on hover, soft-gray pill with ink text and a slim blue left marker when active, reduced-opacity gray for disabled items. Keep menu labels compact; do not reveal descriptions inside the sidebar.
- Content card: white surface, 18px radius, hairline border only when needed.
- Form field: soft-gray or white surface, black text, 8px radius.
- Dialog/project creation surface: large white panel, 18px radius, quiet header/footer, document-like body.

## Product UI Principles

- Prioritize the business workflow: project, repositories, repo intelligence, skills, plan approval, PR DAG, prompt contracts, Codex execution, and PR delivery.
- Keep controls simple and readable. This is an operational tool for repeated review, not a landing page.
- Avoid agent-management language unless the user is configuring executor runtimes. The main object is the delivery artifact: a plan and its PR set.
- Favor concise labels, strong spacing rhythm, quiet white work surfaces, and state color only where it clarifies execution status.
- Project-level screens should stay focused: workspace selector, project list, creation action, and direct navigation into a project.
