```flow
@flow id=specforge-project-context
@name SpecForge Project Context Flow
@version 1.0
@tags specforge, project, repo-context
@env local
```

```step
@id register
@name Register User
@retry 2

POST /v1/register
Content-Type: application/json

{
  "username": "project_user_{{run_id}}",
  "email": "project_{{run_id}}@example.com",
  "password": "password123",
  "nickname": "Project User"
}

[Captures]
email = data.email

[Asserts]
status == 201
body.data.id exists
```

```step
@id login
@name Login
@retry 2

POST /v1/login
Content-Type: application/json

{
  "username": "{{email}}",
  "password": "password123"
}

[Captures]
token = data.access_token

[Asserts]
status == 200
body.data.access_token exists
```

```step
@id installation
@name Save GitHub Installation

POST /v1/github/installations
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "workspace_id": "workspace_{{run_id}}",
  "installation_id": {{run_id}},
  "account_login": "specforge-test",
  "permissions": {
    "contents": "write",
    "pull_requests": "write"
  }
}

[Captures]
installation_id = data.id

[Asserts]
status == 200
body.data.id exists
```

```step
@id repository
@name Save Repository

POST /v1/github/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "repo_{{run_id}}",
  "workspace_id": "workspace_{{run_id}}",
  "github_installation_id": {{installation_id}},
  "github_owner": "specforge-test",
  "github_repo": "app",
  "default_branch": "main",
  "is_private": true
}

[Captures]
repo_id = data.repository_id

[Asserts]
status == 200
body.data.repository_id exists
```

```step
@id profile
@name Save Repo Profile

POST /v1/repositories/{{repo_id}}/profile
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "default_branch": "main",
  "stack": ["Go", "Next.js"],
  "test_commands": ["go test ./...", "pnpm type-check"],
  "ci_provider": "github_actions",
  "app_structure": ["api/internal/modules", "web/src/features"],
  "coding_conventions": ["Keep API and web contracts explicit."],
  "risk_areas": ["auth", "database migrations"],
  "summary": "Primary app repository for SpecForge project context flow.",
  "source": "kest_flow"
}

[Asserts]
status == 200
body.data.id exists
body.data.summary exists
```

```step
@id skill
@name Save Repo Skill

POST /v1/repositories/{{repo_id}}/skills
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "name": "module-boundaries",
  "description": "Project context flow skill",
  "content": "Keep API and web contracts explicit.",
  "active": true
}

[Asserts]
status == 201
body.data.skill.id exists
```

```step
@id project
@name Create Project

POST /v1/projects
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "workspace_id": "workspace_{{run_id}}",
  "name": "SpecForge Flow",
  "slug": "specforge-flow-{{run_id}}",
  "description": "Kest project context flow"
}

[Captures]
project_id = data.project.id

[Asserts]
status == 201
body.data.project.id exists
```

```step
@id bind
@name Bind Repository

POST /v1/projects/{{project_id}}/repositories
Content-Type: application/json
Authorization: Bearer {{token}}

{
  "repository_id": "{{repo_id}}",
  "role": "primary"
}

[Asserts]
status == 201
body.data.repository.id exists
```

```step
@id context
@name Fetch Project Context

GET /v1/projects/{{project_id}}/context
Authorization: Bearer {{token}}

[Asserts]
status == 200
body.data.context.project.id exists
body.data.context.repositories.0.repository_id exists
body.data.context.repository_contexts.0.repository.repository_id exists
body.data.context.repository_contexts.0.profile.summary exists
body.data.context.repository_contexts.0.skills.0.name exists
```

```edge
@from register
@to login
@on success
```

```edge
@from login
@to installation
@on success
```

```edge
@from installation
@to repository
@on success
```

```edge
@from repository
@to profile
@on success
```

```edge
@from profile
@to skill
@on success
```

```edge
@from skill
@to project
@on success
```

```edge
@from project
@to bind
@on success
```

```edge
@from bind
@to context
@on success
```
