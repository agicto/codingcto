# Contributing to CodingCTO Web

Thank you for helping improve CodingCTO. This repository is a global open-source project, so public documentation, commit messages, pull request titles, pull request descriptions, and code comments should be written in English unless a task explicitly requires localized product copy.

## Development Process

1. Fork the repository and create a branch from `main`.
2. Keep changes scoped to one reviewable slice.
3. Add or update tests when behavior changes.
4. Run the relevant checks before opening a pull request.
5. Include browser verification for visible UI changes.

## Local Setup

```bash
git clone https://github.com/agicto/codingcto.git
cd codingcto/web
pnpm install
pnpm dev
```

Open `http://localhost:2020`.

## Checks

```bash
pnpm type-check
pnpm lint
pnpm test run
```

Use focused test commands while developing, then run the broader checks before pushing.

## Commit Messages

Use short English conventional commits:

```text
feat: add project-aware planning
fix: preserve execution prompt context
docs: clarify frontend setup
test: cover project console routing
```

## Branch Names

Use descriptive branch names. For agent-created branches in this workspace, prefer the `coco/` prefix:

```text
coco/specforge-project-context
coco/fix-execution-prompt-context
```

## Pull Requests

A good pull request includes:

- A concise summary
- The product or technical scope
- The tests that were run
- Screenshots or browser notes for UI changes
- Known risks or follow-up work

## Code Style

- Use TypeScript for React code.
- Keep feature-specific code under `src/features/*`.
- Prefer existing shadcn/ui primitives and semantic theme tokens.
- Keep UI copy concise and user-facing text professional.
- Avoid adding global state unless the state is genuinely shared.
- Keep comments useful and in English.

## Reporting Issues

Please open issues at `https://github.com/agicto/codingcto/issues` with:

- A short summary
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details when relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
