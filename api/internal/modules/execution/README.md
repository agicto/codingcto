# Execution connector module

The execution module is the bridge between CodingCTO delivery artifacts and a
local coding agent CLI.

CodingCTO owns the task protocol. Codex CLI, Claude Code CLI, and future agents
are execution backends behind a connector boundary.

## Protocol boundary

There is no universal "coding agent task protocol" that all agent CLIs share.
MCP is useful for tools and context servers, but it is not the delivery protocol
for claiming a PR task, running it, streaming progress, and submitting the
result.

CodingCTO therefore uses its own runtime protocol:

```text
runtime -> POST /v1/runtimes/heartbeat
runtime -> POST /v1/runtimes/:runtime_id/claim
runtime -> POST /v1/tasks/:id/events
runtime -> POST /v1/tasks/:id/result
```

Direct, non-PR tasks use the same shape:

```text
runtime -> POST /v1/agent-tasks/:id/events
runtime -> POST /v1/agent-tasks/:id/result
```

The stable in-process envelope is
`CodingAgentConnectorProtocolVersion = codingcto.agent.connector.v1`.

## Connector shape

`CodingAgentConnector` is the stable boundary:

```go
type CodingAgentConnector interface {
    Name() string
    ProtocolVersion() string
    Capabilities() CodingAgentConnectorCapabilities
    Run(ctx context.Context, envelope CodingAgentTaskEnvelope, reporter ProgressReporter) (*ExecutionResult, error)
}
```

The envelope carries:

- task kind: `pr_node` or `direct`
- runtime identity and session id
- repository id, branch, and workdir
- compiled prompt snapshot
- optional PR node metadata

`RuntimeWorker` receives API claims, converts them into
`CodingAgentTaskEnvelope`, and runs the connector. This keeps the worker focused
on heartbeat/claim/result transport and keeps agent-specific behavior inside the
connector.

## Current CLI connector

`NewCLIConnector(executor)` adapts the existing `CodeExecutor` implementations:

- `codex_cli`
- `claude_code_cli`

For Codex CLI, the executor uses non-interactive `codex exec` with stdin prompt
input, JSON output, sandbox mode, approval policy, optional extra args, and the
runtime workdir.

OpenAI's Codex docs describe `codex exec` configuration knobs such as prompt,
extra CLI args, sandbox mode, output file, version pinning, and `codex-home`.
They also describe Codex config support for MCP servers. CodingCTO uses those as
backend options, not as its task protocol.

## Runtime CLI

Run a local Codex-backed worker:

```bash
cd api
go run ./cmd/ccto daemon \
  --api-base-url http://localhost:2010/v1 \
  --token "$CODINGCTO_RUNTIME_TOKEN" \
  --repo-dir /path/to/local/repo \
  --repository-id github_owner__repo \
  --executor codex_cli \
  --codex-path codex \
  --sandbox workspace-write
```

Useful modes:

- `--once`: heartbeat, claim at most one task, execute it, then exit.
- `--executor claude_code_cli`: use the Claude Code CLI connector backend.
- `--extra-arg`: pass an agent-specific CLI flag.
- `CODEX_CLI_PATH`: override the Codex executable.
- `CODINGCTO_RUNTIME_TOKEN`: bearer token for the runtime API.

## Adding another coding agent

1. Add a `CodeExecutor` implementation if the backend is a CLI process.
2. Register it in `ExecutorFactory.Create`.
3. If the backend is not CLI-shaped, implement `CodingAgentConnector` directly.
4. Preserve `CodingAgentTaskEnvelope` as the input contract.
5. Emit progress through `ProgressReporter`; do not write directly to task tables.
6. Return `ExecutionResult` with stable status values: `completed`, `failed`, or
   `timeout`.

## Failure model

The connector should fail fast for missing workdir or prompt text. Runtime-level
guards still reject claims before execution when:

- the local runtime has no repo directory
- the claimed repository does not match the configured runtime repository guard
- the backend executable exits non-zero
- the backend times out

The worker submits failures back through the runtime protocol so the API can
retry, auto-fix, or escalate.
