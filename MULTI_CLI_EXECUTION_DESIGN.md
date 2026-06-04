# CodingCTO Multi-CLI Execution Design

## Goal

CodingCTO should schedule engineering work from a project board to local AI CLI runtimes. The first supported executors are `codex_cli` and `kimi_cli`.

The API is the control plane. Local runtimes are worker processes. CLI tools are executor adapters.

```text
Project board
  -> approved plan
  -> task DAG
  -> dispatch ready tasks
  -> local runtime claims one task
  -> Codex CLI or Kimi CLI executes
  -> events, result, commits, PR metadata return to API
```

## MVP Boundary

- Single task execution from the board.
- Whole project execution by dispatching multiple task runs from the DAG.
- One runtime process runs one executor kind: `codex_cli` or `kimi_cli`.
- A task has exactly one target executor.
- The runtime only claims tasks matching its executor and available local CLI.
- Runtime auth uses a machine token, separate from user JWT auth.

Parallel multi-executor pools in a single runtime process are a later enhancement.

## Core Objects

```text
Project
  -> Requirement
    -> Plan
      -> PRNode
        -> AgentTask
          -> TaskEvent

SpecForgeRuntime
  -> executor: codex_cli | kimi_cli
  -> available_clis
  -> sandbox
  -> skill_roots
```

## Execution Modes

### Run Selected Task

```text
User clicks Run on one board task
  -> API validates plan approval and task dependencies
  -> AgentTask is created or selected
  -> task.executor is set from user override or node default
  -> task status becomes dispatched
  -> matching runtime claims it
  -> CLI adapter runs prompt
  -> task result updates the board
```

### Run Project

Run Project does not send the whole project to a CLI. It dispatches ready tasks from the project DAG.

```text
User clicks Run Project
  -> API starts ProjectRun / ExecutionRun
  -> scheduler finds PRNodes with satisfied dependencies
  -> each ready node becomes an AgentTask
  -> each AgentTask is dispatched to its target executor
  -> completed tasks unlock downstream tasks
  -> run completes when all tasks are terminal
```

With one local runtime, tasks run sequentially. With multiple runtimes, independent ready tasks can run in parallel.

## Executor Selection

Executor priority:

```text
manual run override
  > PRNode executor
  > project default executor
  > system default codex_cli
```

Supported initial executor IDs:

| Executor | Local command | Runtime ID example |
| --- | --- | --- |
| `codex_cli` | `codex` | `local-codex-runtime` |
| `kimi_cli` | `kimi` | `local-kimi-runtime` |

The scheduler must not silently fallback from `kimi_cli` to `codex_cli`, or the reverse, unless the user explicitly chooses a fallback policy.

## Runtime Startup

Codex runtime:

```bash
cd api
go run ./cmd/specforge-runtime \
  --api-base-url http://localhost:2010/v1 \
  --token "${SPECFORGE_RUNTIME_TOKEN:-local-runtime-token}" \
  --repo-dir /path/to/repo \
  --repository-id github_owner__repo \
  --runtime-id local-codex-runtime \
  --executor codex_cli
```

Kimi runtime:

```bash
cd api
go run ./cmd/specforge-runtime \
  --api-base-url http://localhost:2010/v1 \
  --token "${SPECFORGE_RUNTIME_TOKEN:-local-runtime-token}" \
  --repo-dir /path/to/repo \
  --repository-id github_owner__repo \
  --runtime-id local-kimi-runtime \
  --executor kimi_cli \
  --kimi-path kimi
```

Development accepts `local-runtime-token` when no runtime token env var is set. Production must set a strong `SPECFORGE_RUNTIME_TOKEN` or `CODINGCTO_RUNTIME_TOKEN` on both the API and runtime.

## Dispatch Rules

A task can dispatch only if:

- Its dependencies are terminal successful.
- The selected executor is supported.
- At least one fresh online runtime exists for that executor.
- The runtime reports a writable sandbox.
- The runtime reports the required CLI command as available.

Required CLI commands:

| Executor | Required command |
| --- | --- |
| `codex_cli` | `codex` |
| `kimi_cli` | `kimi` |
| `claude_code_cli` | `claude` |

## CLI Adapter Contract

All CLI adapters normalize into the same result shape:

```text
ExecutionResult
  status
  output
  error
  exit_code
  duration_ms
  process_ref
```

Adapters should stream stdout/stderr as `TaskEvent` records and submit exactly one final result.

## Safety Rules

- CLI execution receives one task prompt, not a whole project prompt.
- The prompt must include allowed files, forbidden files, acceptance criteria, and required tests.
- Each task should run in a prepared branch or worktree.
- Result submission should be idempotent.
- Runtime claim should be atomic and lease-based before scaling parallel workers.
- Failed tasks pause dependent tasks until retry or cancellation.

## Next Implementation Steps

1. Add task-level executor editing on the project board.
2. Add runtime setup UI that renders Codex and Kimi startup commands.
3. Add lease fields and atomic claim semantics for robust parallel runtimes.
4. Add explicit ProjectRun scheduler that dispatches ready DAG layers.
5. Add per-executor prompt templates for Codex and Kimi.
