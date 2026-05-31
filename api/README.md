# CodingCTO API

The CodingCTO API is the Go backend for the GitHub-native PRD-to-PR automation system. It owns workspace and project state, GitHub repository metadata, repository profiling, planning artifacts, execution runs, CI verification, and audit-ready backend workflows.

The Go module path is still `github.com/zgiai/luas/api` for compatibility with the repository history. Treat `luas` as an internal identifier only; the public project name is **CodingCTO**.

## What It Provides

- Gin HTTP server with versioned `/v1` routes
- Wire dependency injection
- GORM persistence and migration registry
- DDD-flavored domain and module boundaries
- Starter modules for users, API keys, and audit logs
- GitHub-native SpecForge planning and execution modules
- Repository profile, skill, plan, prompt, execution, and verification services
- Unified API responses, pagination, validation, logging, JWT, and middleware
- Kest flow tests and Go unit/integration tests
- Optional integrations for Redis, mail, OpenTelemetry, ClickHouse, and Sentry

## Quick Start

### Requirements

- Go 1.24+
- PostgreSQL 12+ or SQLite
- Redis 6+ when cache-backed features are enabled

### Configure

```bash
cp .env.example .env
```

Minimum local values:

```bash
APP_NAME=CodingCTO
APP_ENV=development
SERVER_PORT=8025

DB_DRIVER=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=luas

JWT_SECRET=replace-me
```

`DB_NAME=luas` is currently a compatibility default. You may use a different local database name.

### Generate Dependency Injection

```bash
make wire
```

### Run the Server

```bash
make run
```

For browser-driven local development without a local PostgreSQL password, run the API against
SQLite:

```bash
make migrate-sqlite
make dev-sqlite
```

This creates `tmp/luas-dev.sqlite`, disables optional AI/tracing/log sinks, and keeps production
configuration validation unchanged.

Default local endpoints:

- Home: `http://localhost:8025/`
- Health: `http://localhost:8025/v1/health`
- Swagger: `http://localhost:8025/swagger/index.html`

### Run the CLI

```bash
go run ./cmd/luas version
go run ./cmd/luas route:list
go run ./cmd/luas migrate
go run ./cmd/luas seed
go run ./cmd/luas ai:chat "Summarize this project in one sentence"
```

The CLI binary path remains `cmd/luas` until a dedicated compatibility migration is planned.

### Run a Local Codex Runtime

The SpecForge execution module can be driven by a local runtime process. The runtime talks to the API over `/v1`, claims dispatched `codex_cli` tasks, runs Codex CLI in a local repository directory, records task events, and submits the final result.

```bash
go run ./cmd/specforge-runtime \
  --api-base-url http://localhost:8025/v1 \
  --token "$CODINGCTO_RUNTIME_TOKEN" \
  --runtime-id local-codex-1 \
  --repo-dir /path/to/local/repo \
  --repository-id github_owner__repo
```

Useful flags:

- `--once`: perform one heartbeat/claim/execute cycle and exit.
- `--poll-interval 10s`: set daemon polling cadence.
- `--codex-path codex`: select the Codex CLI binary.
- `--sandbox workspace-write`: pass the Codex sandbox mode.
- `--approval-policy never`: keep execution non-interactive for automation.

Environment equivalents are available with `SPECFORGE_API_BASE_URL`, `SPECFORGE_RUNTIME_TOKEN`, `SPECFORGE_RUNTIME_ID`, `SPECFORGE_RUNTIME_REPO_DIR`, `SPECFORGE_RUNTIME_REPOSITORY_ID`, `CODEX_CLI_PATH`, `SPECFORGE_CODEX_SANDBOX`, `SPECFORGE_CODEX_APPROVAL_POLICY`, and `SPECFORGE_CODEX_TIMEOUT`.

## Repository Layout

```text
api/
├── cmd/
│   ├── luas/              # compatibility CLI entrypoint
│   └── server/            # HTTP server entrypoint
├── database/
│   ├── migrations/        # ordered migration registry
│   └── seeders/
├── internal/
│   ├── bootstrap/         # application startup
│   ├── capabilities/      # technical helpers such as idgen and crypto
│   ├── domain/            # domain entities and contracts
│   ├── infra/             # infrastructure adapters
│   ├── modules/           # feature modules and services
│   └── wiring/            # Wire-generated dependency graph
├── pkg/                   # public helper packages
├── routes/                # global route registration
└── tests/                 # Kest and integration flows
```

## Architecture Rules

- Keep the API and web apps independent. The API never imports from `web/`.
- Flow request handling through `handler -> service -> repository -> database`.
- Use domain structs at service boundaries; keep persistence objects in module repositories.
- Keep route-owning modules close to the starter shape: `model`, `dto`, `repository`, `service`, `handler`, `routes`, `provider`, and tests.
- Keep package names lowercase and singular.
- Use `snake_case` JSON tags.
- Use explicit interfaces only at real seams such as repositories, external services, clocks, or runners.
- Keep all new comments and documentation in English.

## SpecForge Modules

SpecForge is the CodingCTO workflow that turns product intent into delivery artifacts:

1. Repository context indexing
2. Product plan generation
3. Technical plan generation
4. PR DAG planning
5. Prompt compilation
6. Execution orchestration
7. GitHub PR delivery
8. CI verification and auto-fix
9. Review feedback loops

The core implementation lives under `internal/modules/planning`, `internal/modules/execution`, `internal/modules/githubintegration`, `internal/modules/verification`, and related domain files.

## Common Commands

```bash
make wire          # generate Wire dependency injection
make run           # start the API server
make test          # run Go tests
go test ./...      # run all Go packages
go vet ./...       # quick correctness check
make test-kest     # run Kest API flow tests
```

Run checks from `api/` unless noted otherwise.

## Migrations

Migrations are registered in `database/migrations`. Keep migrations small, ordered, reversible, and covered by migration tests when adding schema that is part of the SpecForge workflow.

Useful commands:

```bash
go run ./cmd/luas migrate
go run ./cmd/luas migrate:status
```

## Testing

Recommended validation before opening a PR that touches the API:

```bash
make wire
go test ./...
go vet ./...
make test-kest
```

For focused work, run the affected module package first, then run the full suite before pushing.

## Environment Notes

- Never commit secrets.
- Do not read or inject `.env` values into AI prompts.
- Keep GitHub App permissions minimal.
- Redact tokens and sensitive logs.
- Treat runner workspaces as isolated execution environments.

## Compatibility Notes

Some internal names still include `luas` because this repository preserves scaffold history and module paths. New user-facing copy should say **CodingCTO**. A full module/package rename should be done as a separate, planned compatibility migration.
