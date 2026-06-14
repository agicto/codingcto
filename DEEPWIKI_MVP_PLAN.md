# DeepWiki MVP Plan

## 1. Goal

DeepWiki MVP turns a repository into a browsable engineering wiki.

Input:

- GitHub URL
- Local path
- Optional PAT for private GitHub repositories

Output:

- Markdown wiki pages
- HTML-rendered reading experience
- Mermaid architecture diagrams
- Source code references
- Basic code and wiki search

DeepWiki is a read-only repository understanding feature. It is not an executor runtime, coding agent dashboard, PR automation surface, or code modification workflow.

## 2. MVP Scope

### In Scope

- Public GitHub repository ingestion.
- Private GitHub repository ingestion with PAT.
- Local path ingestion when the API process can access the path.
- Repository file filtering.
- Secret and irrelevant file exclusion.
- File tree, language, entrypoint, route, service, model, and config analysis.
- Code chunking.
- Keyword index.
- Embedding index behind a provider interface.
- Wiki page planning.
- LLM-generated Markdown.
- Mermaid diagram generation.
- Source reference capture.
- Frontend wiki reader.

### Out of Scope

- Multi-repository graph analysis.
- Realtime incremental indexing.
- IDE plugin.
- Code editing.
- Pull request creation.
- Runtime management.
- Fine-grained collaboration permissions.

## 3. User Flow

```text
GitHub URL / local path / PAT
        |
        v
Read repository source
        |
        v
Filter irrelevant and sensitive files
        |
        v
Parse file tree, languages, entrypoints, routes, services, models, config
        |
        v
Code chunk + embedding + keyword index
        |
        v
Cluster and plan wiki pages
        |
        v
LLM generates Markdown
        |
        v
Render HTML + Mermaid architecture diagram + source references
```

## 4. Backend Module

Add a new API module:

```text
api/internal/modules/deepwiki/
  model.go
  dto.go
  repository.go
  service.go
  handler.go
  routes.go
  provider.go
  service_test.go
```

Keep DeepWiki separate from `repocontext` and `execution`.

- `repocontext` can inform implementation patterns, but DeepWiki produces user-facing documentation.
- `execution` and runtime capability logic are not part of this feature.

## 5. Data Model

### `deepwiki_sources`

Stores the repository source.

```text
id
source_type: github_url | local_path
repo_url
local_path
branch
pat_secret_ref or encrypted_pat
status
last_indexed_at
created_at
updated_at
```

### `deepwiki_indexes`

Stores one indexing result for a source.

```text
id
source_id
commit_sha
file_count
chunk_count
language_summary_json
file_tree_json
entrypoints_json
routes_json
services_json
models_json
configs_json
status
error_message
created_at
updated_at
```

### `deepwiki_chunks`

Stores searchable code chunks.

```text
id
index_id
file_path
language
symbol_name
start_line
end_line
content
content_hash
embedding_json
keyword_text
created_at
updated_at
```

If `pgvector` is not enabled, store embeddings as JSON for MVP and add a later migration to vector columns.

### `deepwiki_pages`

Stores generated wiki pages.

```text
id
index_id
slug
title
page_type
markdown
html
mermaid
source_refs_json
order_index
status
error_message
created_at
updated_at
```

## 6. API Design

```text
POST /v1/deepwiki/sources
GET  /v1/deepwiki/sources
GET  /v1/deepwiki/sources/:id

POST /v1/deepwiki/sources/:id/index
GET  /v1/deepwiki/sources/:id/index

GET  /v1/deepwiki/indexes/:indexId/pages
GET  /v1/deepwiki/pages/:pageId

GET  /v1/deepwiki/indexes/:indexId/search?q=
GET  /v1/deepwiki/indexes/:indexId/source?path=&start=&end=
```

Example GitHub source request:

```json
{
  "source_type": "github_url",
  "repo_url": "https://github.com/owner/repo",
  "branch": "main",
  "pat": "ghp_xxx"
}
```

Example local source request:

```json
{
  "source_type": "local_path",
  "local_path": "/Users/mingde/item/codingcto"
}
```

## 7. Repository Reader

Implement a `RepoReader` service.

Responsibilities:

- Clone or download GitHub repositories into a temporary workspace.
- Read local repositories directly from disk.
- Resolve branch and commit SHA.
- Enforce file count, file size, and repository size limits.
- Normalize paths to repository-relative paths.

MVP limits:

- Max files: 10,000.
- Max single text file size: 512 KB.
- Max indexed repository size: 200 MB after filtering.

## 8. File Filtering

Always ignore:

```text
.git
node_modules
dist
build
.next
turbo
coverage
vendor
.env
.env.*
*.pem
*.key
*.crt
*.sqlite
*.db
*.png
*.jpg
*.jpeg
*.gif
*.webp
*.pdf
*.zip
```

Secret detection should exclude files containing:

- Private keys.
- GitHub tokens.
- OpenAI, Anthropic, or similar API keys.
- AWS access keys.
- `.env`-style credential blocks.

Files excluded for secret risk must not be persisted, embedded, or sent to the LLM.

## 9. Repository Analyzer

Generate a structured repository profile:

- File tree.
- Language distribution.
- Package manager.
- Framework detection.
- Entrypoints.
- Routes.
- Services.
- Models and entities.
- Configuration files.
- Test files.
- CI files.
- Existing docs.

MVP language/framework rules:

- Go: `go.mod`, `cmd/*`, `internal/modules/*`, Gin route registration.
- TypeScript/Next.js: `package.json`, `src/app/**/page.tsx`, `route.ts`, `src/features/*`.
- Python: `pyproject.toml`, `requirements.txt`, `app.py`, `main.py`.
- Java: `pom.xml`, `build.gradle`, Spring-style package structure.
- Generic fallback: infer from extensions and directory names.

## 10. Chunking And Indexing

Chunk strategy:

- Prefer functions, classes, structs, interfaces, route handlers, and exported symbols.
- Fall back to 120-200 line windows for unsupported languages.
- Split Markdown by heading.
- Store file path, language, symbol name, start line, end line, and hash.

Indexes:

- Keyword index is required in MVP.
- Embedding index is optional at runtime but must be abstracted behind an `EmbeddingProvider`.
- If embedding fails, DeepWiki should still generate pages using keyword retrieval and repo profile.

## 11. Wiki Planning

The planner creates a page outline from the repository profile and indexed chunks.

Default page candidates:

```text
overview
architecture
setup-and-run
frontend
backend
data-model
api-routes
key-flows
configuration
testing
deployment
glossary
```

The MVP planner should remove irrelevant pages. For example, a backend-only Go service should not produce a frontend page.

Planner output:

```json
{
  "pages": [
    {
      "slug": "architecture",
      "title": "Architecture",
      "purpose": "Explain the major components and request flow.",
      "required_evidence": [
        "api/routes/api.go",
        "api/internal/modules/*/routes.go"
      ]
    }
  ]
}
```

## 12. LLM Generation

Add an LLM capability layer:

```text
api/internal/capabilities/llm/
  client.go
  openai_compatible.go
  prompts.go
```

Interfaces:

```go
type ChatProvider interface {
    Generate(ctx context.Context, req ChatRequest) (ChatResponse, error)
}

type EmbeddingProvider interface {
    Embed(ctx context.Context, texts []string) ([]Embedding, error)
}
```

Environment variables:

```text
DEEPWIKI_LLM_BASE_URL
DEEPWIKI_LLM_API_KEY
DEEPWIKI_LLM_MODEL
DEEPWIKI_EMBEDDING_MODEL
```

Generation rules:

- Do not invent modules, files, routes, or data models.
- Every important claim must include source references.
- Source references use repository-relative paths and line ranges.
- Mermaid output must be valid and isolated from prose.
- Page generation failures should mark only the failed page, not the full index.

Source reference format:

```md
[api/routes/api.go:12-28]
[web/src/features/specforge/services/specforge-service.ts:40-88]
```

## 13. Rendering

MVP rendering should be frontend-first:

- Store Markdown, Mermaid text, and source references in the API.
- Render Markdown in the web app.
- Render Mermaid in the web app.
- Open source references in a side panel.

This avoids adding backend HTML sanitization complexity in the first version.

## 14. Frontend Feature

Add:

```text
web/src/features/deepwiki/
  types.ts
  services/deepwiki-service.ts
  hooks/use-deepwiki.ts
  components/deepwiki-console.tsx
  components/source-form.tsx
  components/index-progress.tsx
  components/wiki-layout.tsx
  components/wiki-page-viewer.tsx
  components/source-reference-panel.tsx
  components/wiki-search.tsx
```

Routes:

```text
/console/deepwiki
/console/deepwiki/:sourceId
/console/deepwiki/:sourceId/pages/:slug
```

MVP layout:

- Left: wiki page navigation.
- Center: Markdown reader.
- Right: source reference panel.
- Top: source status, branch, commit SHA, re-index action.
- Search: keyword search across generated pages and chunks.

## 15. Indexing State Machine

MVP can use database status plus a goroutine.

```text
queued
reading
filtering
analyzing
indexing
planning
generating
ready
failed
```

Failure reasons:

```text
failed_read
failed_filter
failed_analyze
failed_index
failed_plan
failed_generate
```

Each phase should persist status, progress, and error message.

## 16. Implementation Order

1. Add `deepwiki` backend module, migrations, routes, DTOs, and repository methods.
2. Implement source creation and listing.
3. Implement repository reader for GitHub URL and local path.
4. Implement file filtering and secret exclusion.
5. Implement repository analyzer for Go, Next.js, Python, Java, and generic fallback.
6. Implement chunker and keyword index.
7. Add LLM and embedding provider interfaces.
8. Implement page planner with fixed templates and rule-based pruning.
9. Implement Markdown and Mermaid generation.
10. Implement page/source/search APIs.
11. Add frontend DeepWiki console and source form.
12. Add indexing progress UI.
13. Add wiki reader, Mermaid rendering, and source reference side panel.
14. Add tests for filtering, chunking, analysis, planning, and core APIs.

## 17. MVP Acceptance Criteria

- A user can submit a GitHub URL or local path.
- DeepWiki can read the repository.
- DeepWiki skips `node_modules`, `dist`, `.git`, `.env`, and secret-like files.
- DeepWiki identifies languages, entrypoints, routes, services, models, and configuration.
- DeepWiki creates chunks and a keyword index.
- DeepWiki generates at least five useful pages for this repository type.
- Generated pages include source references.
- At least one generated page includes a Mermaid architecture diagram.
- The frontend can browse pages.
- The frontend can search wiki pages and code chunks.
- Clicking a source reference opens the relevant code snippet.
- If indexing fails, the UI shows the failed phase and error message.
