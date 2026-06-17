# CodingCTO

测试 starkwang

> **CodingCTO** is an open-source, GitHub-native PRD-to-PR automation system for AI-assisted engineering teams.

CodingCTO turns a product idea into a product plan, technical plan, PR dependency graph, versioned coding prompts, execution tasks, CI feedback, and review-ready pull requests. The repository contains the Go API and Next.js console that make that workflow shippable.

```
codingcto/
├── api/   # Go backend — Gin + Wire + GORM, DDD modules, AI-capability ready
├── web/   # Next.js 16 + React 19 + Tailwind 4 + shadcn, AI-agent friendly
└── ...
```

## Why CodingCTO

| | |
|---|---|
| **From idea to PR** | Product intent becomes product specs, technical plans, scoped prompts, and pull requests. |
| **Stable rails** | Both halves are battle-tested and conservative: no exotic dependencies, no half-finished abstractions. |
| **Great patterns** | DDD-flavored modules on the API side, feature-first folders on the web side, AGENTS.md on both. |
| **Architecture-first** | The two services share contracts, not code. Cleanly deployable as separate units. |

## What CodingCTO is building

CodingCTO is an AI engineering planner and executor:

1. Connect one GitHub repository or a small project of repositories.
2. Analyze repository context, test commands, CI, conventions, risk areas, and reusable skills.
3. Convert a feature idea into a lightweight product spec and technical implementation plan.
4. Split the plan into reviewable PR nodes with explicit dependencies.
5. Compile each PR node into a scoped coding prompt.
6. Dispatch execution to a selected local CLI runner through `ccto up`.
7. Track task state, CI failures, auto-fix attempts, and final PR delivery.

The product principle is simple: users manage delivery artifacts, not AI workers.

Core product docs:

- [CodingCTO PRD](SPECFORGE_PRD.md)
- [CodingCTO architecture plan](SPECFORGE_ARCHITECTURE_PLAN.md)
- [CodingCTO development implementation plan](SPECFORGE_DEVELOPMENT_IMPLEMENTATION_PLAN.md)

## Quick start

### API (`api/`)

```bash
cd api
cp .env.example .env
make wire     # generate DI
make run      # start server on :2010
```

See [api/README.md](api/README.md) for the full Go backend guide. Some internal module names still use `luas` for compatibility with the original scaffold history.

### Local AI CLI Runtime

Start a local agent with one command. It detects installed coding CLIs, discovers GitHub repositories from the current directory and configured repo roots, heartbeats each executable runtime, and claims matching tasks after plan approval.

```bash
cd api
make install-ccto
cd /path/to/local/repo
ccto up
```

For local development without installing the binary:

```bash
cd api
make build-ccto
cd /path/to/local/repo
/path/to/codingcto/api/bin/ccto status
/path/to/codingcto/api/bin/ccto doctor
/path/to/codingcto/api/bin/ccto up
```

The web console shows detected local agents, CLI choices, matched repositories, and blockers. After expert review, choose the executor CLI in Web; CodingCTO dispatches the selected executor through the local agent. `ccto daemon` remains available for advanced/manual debugging when a fixed runtime id, repository id, or executor flag is required.

### Web (`web/`)

```bash
cd web
pnpm install
pnpm dev      # start Next.js on :2020
```

See [web/README.md](web/README.md) for the full frontend guide.

## Working with AI agents

Both halves were designed for AI-assisted development. The top-level [AGENTS.md](AGENTS.md) plus the per-half [api/AGENTS.md](api/AGENTS.md) and [web/AGENTS.md](web/AGENTS.md) tell coding agents (Claude Code, Cursor, Windsurf, Copilot, etc.) how to navigate, where the boundaries are, and which conventions to follow.

## Contributing

This is a global open-source project. Keep all commits, pull request titles, pull request descriptions, code comments, and user-facing documentation in English unless a task explicitly requires localized product copy.

Commit messages should be short, imperative, and English-only:

```text
feat: add project-aware CodingCTO planning
fix: preserve project skills in execution prompts
docs: clarify CodingCTO development workflow
```

Before opening a pull request, run the checks that match your change:

```bash
# API
cd api
make wire
go test ./...
go vet ./...
make test-kest

# Web
cd web
pnpm type-check
pnpm lint
pnpm test
```

For UI changes, also verify the affected route in a browser and include the result in the PR description.

## History

This repo merges two previous projects, with full commit history preserved:

- `api/` — formerly [`zgiai/zgo`](https://github.com/zgiai/zgo)
- `web/` — formerly [`zgiai/zweb`](https://github.com/zgiai/zweb) (previously branded *LlamaFront* / *Hypership Web Console*)

Historical module / package identifiers were renamed during the earlier scaffold consolidation:

- Go module: `github.com/zgiai/zgo` → `github.com/zgiai/luas/api`
- Web package: `llamafront-ai-scaffold` → `codingcto-web`

The current public project name is **CodingCTO**. The `luas` identifiers above are retained as compatibility details until a dedicated package/module rename is planned.

## License

MIT (inherited from both source repos).
