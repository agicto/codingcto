# SpecForge 开发实施方案

> 基于当前 Luas monorepo、已有 SpecForge PRD、架构计划，以及参考项目实施方案的颗粒度编写。本文面向研发落地，目标是把 SpecForge 从当前原型能力推进到可验证 MVP。

---

## 一、系统概述

SpecForge 是一个 GitHub-native 的 PRD-to-PR 自动化产研系统。

核心业务流程：

```text
创建 Workspace
  -> 创建 Project
  -> 绑定 GitHub Repos
  -> 分析 Repo 架构和工程约束
  -> 用户输入 Requirement
  -> 跑 Skill Pipeline
  -> 生成 PRD / Technical Plan / PR DAG
  -> 用户 Approve Plan
  -> 编译每个 PRNode 的 Prompt
  -> 调用 Codex CLI 执行
  -> 创建 Branch / Commit / PR
  -> 读取 CI
  -> 自动修复或 Escalate
  -> 交付 ready-to-review PR set
```

MVP 的核心判断：

```text
Project 可以绑定多个 repo。
一次 execution run 默认只修改一个 primary repo。
其他 repo 可以作为 context 参与分析。
```

## Delivery Module Roadmap

This roadmap is the working order for the long-running implementation program. Each module should
ship as one large but reviewable PR, with English commits, PR descriptions, PR comments, and test
reports. A module is not considered complete until it has local checks, flow coverage, UI
verification where applicable, a self-review note, green CI, and a merge path from `dev` to `main`.

| Priority | Module | Product Outcome | Engineering Scope | Required Evidence |
|----------|--------|-----------------|-------------------|-------------------|
| P0 | Project and repository foundation | Users can model work as Workspace -> Project -> bound repositories, with one writable primary repo and read-only context repos. | Workspace/project APIs, repository binding, Postgres migrations, project context contract, console entry points. | Kest project context flow, migration verification, browser project setup check. |
| P0 | Repo context and skills | CodingCTO can understand repository structure, risk areas, test commands, architecture snapshots, and reusable repo/project skills. | Repo profile CRUD, architecture indexing, skill registry/runs, context aggregation, context UI. | Repo profile tests, skill tests, Kest context flow, browser CTX panel check. |
| P0 | Plan approval and PR DAG | A requirement becomes a reviewable product/technical plan and bounded PR DAG before execution. | Requirement intake, plan snapshot, decision overrides, PR node graph, plan review UI. | Plan adapter/approval tests, Kest requirement flow, browser PLAN panel check. |
| P0 | Prompt contract compiler | Every PR node produces versioned implementation, CI-fix, and review-feedback prompts with scope, non-goals, tests, and repo context. | Prompt compiler API, prompt preview logic, PR DAG prompt UI, prompt storage/version metadata. | Prompt preview tests, Kest prompt compile step, browser PROMPT panel check. |
| P1 | Codex CLI execution orchestrator | Approved plans can dispatch executable tasks to local runtimes and track task lifecycle. | Runtime heartbeat, task queue/claim/result, executor readiness, run dispatch/cancel, stale-task sweeps. | Runtime unit tests, Kest runtime task flow, browser RUN panel check. |
| P1 | GitHub delivery and CI verification | CodingCTO can prepare branches, open draft PRs, refresh CI, inspect failures, and surface auto-fix attempts. | GitHub App delivery service, branch/PR/check APIs, workflow log ingestion, fix attempt model, escalation summary. | GitHub service tests/mocks, Kest fix/escalation flow, PR delivery browser check. |
| P1 | Guardrails and policy | Execution stays within approved repo, file scope, retry budgets, and human decision boundaries. | Repo role enforcement, PR node scope validation, auto-fix retry limits, blocked escalation rules, audit logs. | Guardrail tests, flow assertions for denied unsafe actions, browser blocker summary check. |
| P2 | Open-source product UI polish | The console feels minimal, Swiss-style, and production-grade for a global open-source project. | Sidebar/workbench information architecture, 4px radius design pass, empty/loading/error states, responsive QA. | Browser screenshots across key flows, lint/type checks, visual self-review comment. |
| P2 | Repo memory and learning loop | Repeated projects improve through approved decisions, merged PR summaries, and rejected feedback. | Memory tables, summary jobs, prompt injection into planner/compiler, settings UI. | Memory tests, flow coverage for saved feedback, browser settings check. |

Current module boundary:

- The workbench shell should own routing, high-level state, and data wiring only.
- Feature panels should be split by business capability: context, plan, prompt contracts, execution,
  delivery, and setup.
- Each extraction must preserve behavior first, then the next module PR can deepen capability.

---

## 二、角色与页面清单

### 2.1 Workspace Owner

| 页面 | 路由建议 | 功能描述 |
|------|----------|----------|
| Workspace 设置 | `/console/workspace` | Workspace 名称、成员、quota、GitHub installation 状态 |
| GitHub 接入 | `/console/integrations/github` | 安装 GitHub App、查看安装状态、选择可访问 repo |
| Project 管理 | `/console/projects` | 创建 Project、查看 Project 列表、进入 Project |
| Project 设置 | `/console/projects/:projectId/settings` | Project 名称、描述、默认策略、repo 绑定 |
| SpecForge Console | `/console/projects/:projectId/specforge` | 输入需求、查看 plan、approve、执行、查看 PR delivery |

关键权限：

- 可以安装/移除 GitHub App。
- 可以创建 Project。
- 可以绑定 repo。
- 可以 approve plan。
- 可以 cancel execution run。

### 2.2 Workspace Member

| 页面 | 路由建议 | 功能描述 |
|------|----------|----------|
| Project 列表 | `/console/projects` | 查看可访问 Project |
| Project 工作台 | `/console/projects/:projectId` | 查看 Project context、最近 requirement、最近 PR set |
| SpecForge Console | `/console/projects/:projectId/specforge` | 创建 requirement、查看 plan、查看 run |
| PR Delivery | `/console/projects/:projectId/runs/:runId` | 查看 PR DAG 状态、CI、fix attempts、blocked reason |

关键权限：

- 可以创建 requirement。
- 可以查看 plan 和 run。
- 默认不能安装 GitHub App。
- 默认不能删除 repo 绑定。
- 是否可 approve plan 由 Workspace policy 控制。

### 2.3 System Admin

| 页面 | 路由建议 | 功能描述 |
|------|----------|----------|
| 系统运行状态 | `/console/admin/specforge` | executor runtime、queue、失败率、GitHub webhook 状态 |
| Skill 管理 | `/console/admin/skills` | 内置 skill registry、版本、schema、启用状态 |
| Executor 管理 | `/console/admin/executors` | Codex CLI runtime、heartbeat、版本、host |

---

## 三、业务对象与关系

### 3.1 关系图

```text
Workspace
  -> WorkspaceMember
  -> GitHubInstallation
  -> Project
      -> ProjectRepository
          -> Repository
      -> ProjectSkill
      -> Requirement
          -> ProductSpec
          -> ImplementationPlan
              -> PRNode
                  -> CompiledPrompt
                  -> ExecutionTask
                      -> FixAttempt
                      -> PullRequest
          -> ExecutionRun
```

### 3.2 Project 与 Repo 规则

Project 是产品/业务系统维度，Repository 是代码仓库维度。

MVP 规则：

```text
一个 Workspace 可以有多个 Project。
一个 Project 可以绑定 1-3 个 Repository。
一个 Repository 在同一个 Project 中只有一个 role。
一次 ExecutionRun 只能修改一个 primary Repository。
dependency/docs/infra repo 默认只作为 context。
```

Repo role：

| Role | 说明 | MVP 是否可修改 |
|------|------|----------------|
| `primary` | 主要产品代码仓库 | 是 |
| `dependency` | SDK、shared package、内部依赖 | 否，V2 支持 |
| `docs` | 文档仓库 | 否，V2 支持 |
| `infra` | CI/CD、Terraform、部署配置 | 否，V2 支持，高风险 |

---

## 四、数据库设计

> Go API 侧沿用当前 Luas 约定：GORM PO、DDD module、repository/service/handler 分层、migration 文件版本化。

### 4.1 现有可复用表

| 表名 | 用途 |
|------|------|
| `users` | 用户基础信息 |
| `api_keys` | API key 管理 |
| `audit_logs` | 审计日志 |
| 已有 SpecForge 相关表 | plan/run/task/fix attempt/pr node 等已实现基础 |

### 4.2 需补齐的业务表

#### 4.2.1 Workspaces `workspaces`

```go
type WorkspacePO struct {
    ID        uint           `gorm:"primaryKey"`
    CreatedAt time.Time
    UpdatedAt time.Time
    DeletedAt gorm.DeletedAt `gorm:"index"`
    Name      string         `gorm:"size:100;not null"`
    Slug      string         `gorm:"size:80;not null;uniqueIndex"`
    Plan      string         `gorm:"size:30;not null;default:'free'"`
    Status    string         `gorm:"size:30;not null;default:'active'"`
    CreatedBy uint           `gorm:"not null;index"`
}

func (WorkspacePO) TableName() string { return "workspaces" }
```

#### 4.2.2 Workspace Members `workspace_members`

```go
type WorkspaceMemberPO struct {
    ID          uint           `gorm:"primaryKey"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    DeletedAt   gorm.DeletedAt `gorm:"index"`
    WorkspaceID uint           `gorm:"not null;uniqueIndex:idx_workspace_user"`
    UserID      uint           `gorm:"not null;uniqueIndex:idx_workspace_user"`
    Role        string         `gorm:"size:30;not null"` // owner, admin, member
    Status      string         `gorm:"size:30;not null;default:'active'"`
}

func (WorkspaceMemberPO) TableName() string { return "workspace_members" }
```

#### 4.2.3 GitHub Installations `github_installations`

```go
type GitHubInstallationPO struct {
    ID             uint           `gorm:"primaryKey"`
    CreatedAt      time.Time
    UpdatedAt      time.Time
    DeletedAt      gorm.DeletedAt `gorm:"index"`
    WorkspaceID    uint           `gorm:"not null;index"`
    InstallationID int64          `gorm:"not null;uniqueIndex"`
    AccountLogin   string         `gorm:"size:100;not null"`
    AccountType    string         `gorm:"size:30;not null"` // User, Organization
    PermissionsJSON string        `gorm:"type:text"`
    Status         string         `gorm:"size:30;not null;default:'active'"`
}

func (GitHubInstallationPO) TableName() string { return "github_installations" }
```

#### 4.2.4 Projects `projects`

```go
type ProjectPO struct {
    ID          uint           `gorm:"primaryKey"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    DeletedAt   gorm.DeletedAt `gorm:"index"`
    WorkspaceID uint           `gorm:"not null;index"`
    Name        string         `gorm:"size:120;not null"`
    Slug        string         `gorm:"size:100;not null"`
    Description string         `gorm:"type:text"`
    Status      string         `gorm:"size:30;not null;default:'active'"`
    CreatedBy   uint           `gorm:"not null;index"`
}

func (ProjectPO) TableName() string { return "projects" }
```

索引：

```text
unique(workspace_id, slug)
index(workspace_id, status)
```

#### 4.2.5 Repositories `repositories`

```go
type RepositoryPO struct {
    ID                   uint           `gorm:"primaryKey"`
    CreatedAt            time.Time
    UpdatedAt            time.Time
    DeletedAt            gorm.DeletedAt `gorm:"index"`
    WorkspaceID          uint           `gorm:"not null;index"`
    GitHubInstallationID uint           `gorm:"not null;index"`
    GitHubRepoID         int64          `gorm:"not null;uniqueIndex"`
    Owner                string         `gorm:"size:100;not null"`
    Name                 string         `gorm:"size:100;not null"`
    FullName             string         `gorm:"size:220;not null;index"`
    DefaultBranch        string         `gorm:"size:100;not null;default:'main'"`
    Private              bool           `gorm:"not null;default:true"`
    Status               string         `gorm:"size:30;not null;default:'active'"`
}

func (RepositoryPO) TableName() string { return "repositories" }
```

#### 4.2.6 Project Repositories `project_repositories`

```go
type ProjectRepositoryPO struct {
    ID           uint           `gorm:"primaryKey"`
    CreatedAt    time.Time
    UpdatedAt    time.Time
    DeletedAt    gorm.DeletedAt `gorm:"index"`
    WorkspaceID  uint           `gorm:"not null;index"`
    ProjectID    uint           `gorm:"not null;uniqueIndex:idx_project_repo"`
    RepositoryID uint           `gorm:"not null;uniqueIndex:idx_project_repo"`
    Role         string         `gorm:"size:30;not null"` // primary, dependency, docs, infra
    Active       bool           `gorm:"not null;default:true"`
    CreatedBy    uint           `gorm:"not null;index"`
}

func (ProjectRepositoryPO) TableName() string { return "project_repositories" }
```

约束：

```text
每个 Project 至少 1 个 active primary repo。
MVP 每个 Project 最多 1 个 active primary repo。
MVP 每个 Project 最多 3 个 active repo。
```

#### 4.2.7 Repo Architecture Snapshots `repo_architecture_snapshots`

```go
type RepoArchitectureSnapshotPO struct {
    ID            uint           `gorm:"primaryKey"`
    CreatedAt     time.Time
    UpdatedAt     time.Time
    DeletedAt     gorm.DeletedAt `gorm:"index"`
    RepositoryID  uint           `gorm:"not null;index"`
    CommitSHA     string         `gorm:"size:80;not null;index"`
    StackJSON     string         `gorm:"type:text"`
    ModulesJSON   string         `gorm:"type:text"`
    EntrypointsJSON string       `gorm:"type:text"`
    TestCommandsJSON string     `gorm:"type:text"`
    CIWorkflowsJSON string      `gorm:"type:text"`
    RiskAreasJSON string        `gorm:"type:text"`
    Summary       string         `gorm:"type:text"`
    GeneratedBy   string         `gorm:"size:80;not null;default:'repo_context_service'"`
}

func (RepoArchitectureSnapshotPO) TableName() string {
    return "repo_architecture_snapshots"
}
```

#### 4.2.8 Skills `skills`

```go
type SkillPO struct {
    ID          uint           `gorm:"primaryKey"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    DeletedAt   gorm.DeletedAt `gorm:"index"`
    Key         string         `gorm:"size:100;not null;uniqueIndex"`
    Name        string         `gorm:"size:120;not null"`
    Category    string         `gorm:"size:60;not null"`
    Version     string         `gorm:"size:30;not null;default:'v1'"`
    InputSchema string         `gorm:"type:text"`
    OutputSchema string        `gorm:"type:text"`
    PromptTemplate string      `gorm:"type:text"`
    Enabled     bool           `gorm:"not null;default:true"`
}

func (SkillPO) TableName() string { return "skills" }
```

#### 4.2.9 Project Skills `project_skills`

```go
type ProjectSkillPO struct {
    ID          uint           `gorm:"primaryKey"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    DeletedAt   gorm.DeletedAt `gorm:"index"`
    ProjectID   uint           `gorm:"not null;uniqueIndex:idx_project_skill"`
    SkillID     uint           `gorm:"not null;uniqueIndex:idx_project_skill"`
    Enabled     bool           `gorm:"not null;default:true"`
    ConfigJSON  string         `gorm:"type:text"`
}

func (ProjectSkillPO) TableName() string { return "project_skills" }
```

#### 4.2.10 Skill Runs `skill_runs`

```go
type SkillRunPO struct {
    ID             uint           `gorm:"primaryKey"`
    CreatedAt      time.Time
    UpdatedAt      time.Time
    DeletedAt      gorm.DeletedAt `gorm:"index"`
    WorkspaceID    uint           `gorm:"not null;index"`
    ProjectID      uint           `gorm:"not null;index"`
    RequirementID  *uint          `gorm:"index"`
    SkillID        uint           `gorm:"not null;index"`
    SkillKey       string         `gorm:"size:100;not null;index"`
    SkillVersion   string         `gorm:"size:30;not null"`
    Status         string         `gorm:"size:30;not null;default:'queued'"`
    InputJSON      string         `gorm:"type:text"`
    OutputJSON     string         `gorm:"type:text"`
    ErrorMessage   string         `gorm:"type:text"`
    StartedAt      *time.Time
    CompletedAt    *time.Time
}

func (SkillRunPO) TableName() string { return "skill_runs" }
```

#### 4.2.11 Requirements `requirements`

```go
type RequirementPO struct {
    ID          uint           `gorm:"primaryKey"`
    CreatedAt   time.Time
    UpdatedAt   time.Time
    DeletedAt   gorm.DeletedAt `gorm:"index"`
    WorkspaceID uint           `gorm:"not null;index"`
    ProjectID   uint           `gorm:"not null;index"`
    CreatedBy   uint           `gorm:"not null;index"`
    RawInput    string         `gorm:"type:text;not null"`
    Type        string         `gorm:"size:30;not null;default:'feature'"`
    Status      string         `gorm:"size:40;not null;default:'draft'"`
}

func (RequirementPO) TableName() string { return "requirements" }
```

#### 4.2.12 Compiled Prompts `compiled_prompts`

```go
type CompiledPromptPO struct {
    ID              uint           `gorm:"primaryKey"`
    CreatedAt       time.Time
    UpdatedAt       time.Time
    DeletedAt       gorm.DeletedAt `gorm:"index"`
    WorkspaceID     uint           `gorm:"not null;index"`
    ProjectID       uint           `gorm:"not null;index"`
    RequirementID   uint           `gorm:"not null;index"`
    PlanID          uint           `gorm:"not null;index"`
    PRNodeID        uint           `gorm:"not null;index"`
    PromptType      string         `gorm:"size:40;not null"` // implementation, fix, review_patch
    Version         int            `gorm:"not null;default:1"`
    Content         string         `gorm:"type:text;not null"`
    InputRefsJSON   string         `gorm:"type:text"`
    Checksum        string         `gorm:"size:80;not null;index"`
}

func (CompiledPromptPO) TableName() string { return "compiled_prompts" }
```

---

## 五、状态机设计

### 5.1 Requirement 状态机

```text
draft
  -> analyzing_context
  -> running_skills
  -> generating_product_spec
  -> generating_technical_plan
  -> generating_pr_dag
  -> awaiting_approval
  -> approved
  -> executing
  -> completed
```

异常状态：

```text
cancelled
blocked
failed
```

### 5.2 ExecutionRun 状态机

```text
queued
  -> running
  -> completed
```

异常状态：

```text
blocked
cancelled
failed
```

规则：

- `queued` 可以 cancel。
- `running` 可以 cancel。
- `blocked` 可以 cancel。
- `blocked` 只能通过 retry/replan/continue decision 恢复。
- `completed` 和 `cancelled` 不允许继续执行 task。

### 5.3 PRNode 状态机

```text
planned
  -> queued
  -> waiting_on_dependencies
  -> running
  -> code_generated
  -> pr_opened
  -> ci_running
  -> ready_for_review
  -> merged
```

异常状态：

```text
failed
cancelled
blocked
closed
```

### 5.4 FixAttempt 状态机

```text
created
  -> running
  -> succeeded
```

异常状态：

```text
failed
skipped
blocked
```

---

## 六、核心业务规则

### 6.1 Repo 绑定规则

- Project 必须至少绑定一个 primary repo。
- MVP 一个 Project 只能有一个 active primary repo。
- Project 最多绑定 3 个 repo。
- dependency/docs/infra repo 默认只读。
- infra repo 参与计划时必须标记 high risk。

### 6.2 Repo 分析规则

每次进入 planning 前，需要检查 RepoProfile 是否过期。

过期条件：

```text
没有 RepoProfile
default branch head SHA 变化
距离 last_indexed_at 超过 24 小时
用户手动触发 re-index
```

输出必须包含：

- stack
- package manager
- test commands
- CI workflows
- app structure
- coding conventions
- risk areas
- repo instructions
- compact summary

### 6.3 Skill Pipeline 规则

MVP 固定 pipeline：

```text
repo_architecture
  -> product_prd
  -> technical_plan
  -> task_decomposition
  -> pr_dag_review
  -> prompt_compile
```

每个 skill run 必须保存：

- skill key
- skill version
- input JSON
- output JSON
- status
- error
- started/completed time

### 6.4 Plan Approval 规则

- 未 approve 的 plan 不能执行。
- Approve 后生成 immutable snapshot。
- Snapshot 后 ProductSpec、ImplementationPlan、PR DAG 不可原地修改。
- 修改必须生成新 plan version。

### 6.5 PR DAG 规则

每个 PRNode 必须包含：

- title
- type
- goal
- target repository
- dependsOn
- expectedFiles
- nonGoals
- acceptanceCriteria
- testCommands
- branchName

Guardrails：

```text
单次最多 5 个 PRNode
单个 PRNode 建议核心 diff < 800 行
一个 PRNode 不应同时做 database + API + UI + email
schema / contract PR 必须优先
UI PR 默认依赖 API PR
verification PR 默认靠后
```

### 6.6 Prompt 规则

每个 implementation prompt 必须包含：

- PRNode goal。
- ProductSpec 相关片段。
- TechnicalPlan 相关片段。
- RepoProfile 相关片段。
- target repo。
- allowed file scope。
- non-goals。
- dependency PR information。
- acceptance criteria。
- test commands。
- PR description template。

### 6.7 Execution 规则

- 无依赖 PRNode 可以并行。
- 有依赖 PRNode 需要等待上游 ready_for_review 或 merged。
- blocked run 不允许自动 dispatch 新 task。
- failed/cancelled task 可以 retry。
- dependency_closed task 不允许 retry，必须 replan。

### 6.8 CI Auto-fix 规则

- 同一个 workflow run 只创建一个 FixAttempt。
- 每个 PRNode 最多 3 次 auto-fix。
- 同类 failure 最多连续 2 次。
- flaky test 可以自动 rerun 一次。
- migration/auth/permission 高风险失败默认需要 escalation。

---

## 七、API 草案

### 7.1 Project

```http
POST /api/workspaces/:workspaceId/projects
GET  /api/workspaces/:workspaceId/projects
GET  /api/projects/:projectId
PATCH /api/projects/:projectId
DELETE /api/projects/:projectId
```

创建 Project：

```json
{
  "name": "SpecForge",
  "slug": "specforge",
  "description": "PRD-to-PR automation product"
}
```

### 7.2 Project Repository

```http
POST /api/projects/:projectId/repositories
GET  /api/projects/:projectId/repositories
PATCH /api/projects/:projectId/repositories/:repositoryId
DELETE /api/projects/:projectId/repositories/:repositoryId
```

绑定 repo：

```json
{
  "repositoryId": 123,
  "role": "primary"
}
```

### 7.3 Project Context

```http
POST /api/projects/:projectId/context/reindex
GET  /api/projects/:projectId/context
```

响应：

```json
{
  "project": {},
  "repositories": [],
  "repoProfiles": [],
  "architectureSnapshots": [],
  "skills": [],
  "summary": "..."
}
```

### 7.4 Requirements

```http
POST /api/projects/:projectId/requirements
GET  /api/projects/:projectId/requirements
GET  /api/requirements/:requirementId
POST /api/requirements/:requirementId/generate-plan
```

创建 requirement：

```json
{
  "type": "feature",
  "input": "Add team invite feature"
}
```

### 7.5 Plans

```http
GET  /api/requirements/:requirementId/plan
POST /api/plans/:planId/approve
POST /api/plans/:planId/run
```

### 7.6 Execution

```http
GET  /api/runs/:runId
POST /api/runs/:runId/cancel
POST /api/tasks/:taskId/retry
POST /api/tasks/:taskId/cancel
GET  /api/tasks/:taskId/events
```

### 7.7 Escalation

```http
GET  /api/pr-nodes/:prNodeId/escalation-summary
POST /api/pr-nodes/:prNodeId/decisions
```

Decision payload：

```json
{
  "decision": "continue_with_recommended_option",
  "notes": "Add a workspace role helper first"
}
```

---

## 八、后端模块拆分

### 8.1 `project` module

目录建议：

```text
api/internal/modules/project/
  domain.go
  repository.go
  service.go
  handler.go
  routes.go
  wire.go
```

职责：

- Project CRUD。
- ProjectRepository 管理。
- Project Context 聚合。
- Project 权限校验。

### 8.2 `github` module

职责：

- GitHub App installation。
- Installation token。
- Repo metadata sync。
- Branch / PR / workflow API。
- Webhook event ingest。

### 8.3 `repoctx` module

职责：

- clone/fetch。
- analyze stack。
- analyze tests。
- analyze CI。
- read AGENTS/CONTRIBUTING。
- persist RepoProfile and RepoArchitectureSnapshot。

### 8.4 `skill` module

职责：

- Skill registry。
- ProjectSkill。
- SkillRun。
- Skill execution interface。

### 8.5 `planner` module

职责：

- Requirement to ProductSpec。
- ProductSpec to TechnicalPlan。
- TechnicalPlan to PR DAG。
- PR DAG review。

### 8.6 `prompt` module

职责：

- Compile implementation prompt。
- Compile fix prompt。
- Compile review patch prompt。
- Persist CompiledPrompt。

### 8.7 `execution` module

职责：

- ExecutionRun。
- ExecutionTask。
- DAG scheduling。
- Retry/cancel。
- Executor dispatch。
- Run completion。

### 8.8 `verification` module

职责：

- CI status ingestion。
- CI log extraction。
- Failure classification。
- FixAttempt。
- EscalationSummary。

---

## 九、前端页面拆分

### 9.1 Project Console

```text
web/src/features/project/
  components/
  hooks/
  services/
  types.ts
```

页面：

```text
/console/projects
/console/projects/:projectId
/console/projects/:projectId/settings
```

### 9.2 SpecForge Project Console

当前 `/console/specforge` 后续迁移为：

```text
/console/projects/:projectId/specforge
```

页面区块：

- Project Context Summary。
- Bound Repositories。
- Requirement Intake。
- Skill Pipeline Status。
- ProductSpec。
- TechnicalPlan。
- PR DAG。
- Plan Approval。
- ExecutionRun。
- PR Delivery。
- Escalation Summary。

### 9.3 Skill Admin

页面：

```text
/console/projects/:projectId/skills
```

功能：

- 查看 enabled skills。
- 查看 skill versions。
- 查看最近 SkillRuns。
- 查看 input/output。

---

## 十、实施阶段

### Phase 1: Project / Repo Binding

目标：

```text
把 SpecForge 从固定 repo demo 升级为 project-scoped 产品。
```

后端任务：

1. 新增 `projects` migration。
2. 新增 `repositories` migration。
3. 新增 `project_repositories` migration。
4. 实现 project module repository。
5. 实现 Project CRUD service。
6. 实现 ProjectRepository bind/unbind。
7. 增加 Project Context API。
8. 增加 role guardrails。

前端任务：

1. 增加 Project list 页面。
2. 增加 Project create flow。
3. 增加 Project settings。
4. 增加 repo binding UI。
5. SpecForge console 接收 `projectId`。

测试：

```bash
cd api && go test ./internal/modules/project/...
cd api && go test ./...
cd web && pnpm type-check
cd web && pnpm lint
```

验收：

- 用户可以创建 Project。
- 用户可以绑定 primary repo。
- Project context 可以返回 bound repos。
- SpecForge console 不再依赖固定 repo。

### Phase 2: Repo Architecture Analysis

目标：

```text
每个 Project 可以分析绑定 repo 的工程结构。
```

后端任务：

1. 新增 `repo_architecture_snapshots` migration。
2. 实现 repoctx analyzer interface。
3. 识别 package manager。
4. 识别 test commands。
5. 识别 GitHub Actions workflows。
6. 读取 AGENTS.md / README / CONTRIBUTING。
7. 生成 compact summary。
8. 加入 stale profile 判断。

验收：

- 点击 reindex 能生成 repo architecture snapshot。
- Planning 前能自动检查 repo context 是否过期。

### Phase 3: Skill Registry and Skill Runs

目标：

```text
让 plan 生成过程可追踪、可版本化。
```

后端任务：

1. 新增 `skills` migration。
2. 新增 `project_skills` migration。
3. 新增 `skill_runs` migration。
4. seed 内置 skills。
5. 实现 SkillRun service。
6. 将 ProductSpec/TechnicalPlan/PRDAG 生成过程写入 SkillRun。

前端任务：

1. Project skills 页面。
2. Plan 页面展示 skill pipeline。
3. SkillRun detail 展示 input/output。

验收：

- 每次 plan generation 都有 skill run history。
- 能看到 skill version 和输出。

### Phase 4: Requirement and Plan Versioning

目标：

```text
把用户输入和 plan snapshot 建成稳定版本链。
```

任务：

1. 新增 `requirements` migration。
2. 将现有 idea 概念迁移/兼容为 Requirement。
3. Plan approve 时冻结 snapshot。
4. 修改 decision overrides 生成新 plan version。
5. PRNode 关联 targetRepositoryId。

验收：

- Requirement 可以生成多个 plan version。
- Approved plan 不可原地修改。
- PR DAG 每个节点知道目标 repo。

### Phase 5: Prompt Compiler Persistence

目标：

```text
每个 Codex CLI 执行 prompt 都可复现。
```

任务：

1. 新增 `compiled_prompts` migration。
2. 实现 implementation prompt compiler。
3. 实现 fix prompt compiler。
4. 实现 review patch prompt compiler。
5. ExecutionTask 关联 prompt id。
6. 前端展示 prompt preview。

验收：

- 每个 ExecutionTask 有 prompt id。
- 能从 PRNode 回溯到 prompt content。

### Phase 6: Codex CLI Executor

目标：

```text
真正调用 Codex CLI 完成代码改动。
```

任务：

1. 定义 CodeExecutor interface。
2. 实现 CodexCLIExecutor。
3. 创建隔离 workspace。
4. checkout target branch。
5. 注入 prompt。
6. 执行 Codex CLI。
7. 捕获 logs。
8. git diff review。
9. commit。
10. push branch。
11. create/update PR。
12. task cancel。

验收：

- 单个 PRNode 可以自动生成代码 PR。
- PR description 包含 scope/non-goals/test plan。

### Phase 7: Verification and Auto-fix

目标：

```text
完成 CI failure -> fix prompt -> patch -> rerun 的闭环。
```

任务：

1. workflow_run webhook 接入。
2. 拉取 failed job logs。
3. 失败分类。
4. fix budget enforcement。
5. 自动生成 fix prompt。
6. 调 Codex CLI patch。
7. push fix commit。
8. blocked escalation。

验收：

- lint/type/test failure 至少能自动修一次。
- 超过阈值时有 EscalationSummary。

### Phase 8: Human Review Loop

目标：

```text
让 GitHub review feedback 回到 SpecForge 执行链路。
```

任务：

1. 处理 pull_request_review。
2. 处理 issue_comment。
3. 将 actionable feedback 生成 review patch task。
4. 执行 patch。
5. 更新 PR。
6. request changes 时更新 PRNode 状态。

验收：

- 用户在 PR 评论中要求修改，系统能生成 patch task。

### Phase 9: Multi-repo Context

目标：

```text
一个 Project 多 repo 分析，但仍只执行 primary repo。
```

任务：

1. Project Context 聚合多个 repo。
2. Planner 读取 dependency/docs/infra repo summary。
3. PRNode target repo guardrail。
4. 禁止 MVP 修改非 primary repo。

验收：

- Plan 能引用多个 repo 的上下文。
- Execution 只会修改 primary repo。

### Phase 10: Cross-repo PR DAG

目标：

```text
支持一个需求生成多 repo PR set。
```

任务：

1. PRNode 支持跨 repo dependency。
2. 每个 repo 独立 branch strategy。
3. 多 repo CI status 聚合。
4. 跨 repo blocker escalation。
5. Delivery 页面展示 multi-repo DAG。

验收：

- 一个 requirement 可以生成 app + sdk + docs 的关联 PR set。

---

## 十一、测试策略

### 11.1 后端测试

必测：

- Project CRUD。
- ProjectRepository role guardrails。
- Repo context stale 判断。
- SkillRun 创建和状态流转。
- Plan approve snapshot。
- PR DAG validation。
- Prompt checksum。
- Retry blocked run。
- FixAttempt dedupe。

### 11.2 前端测试

必测：

- Project selector。
- Repo binding form。
- Requirement intake。
- Plan review。
- PR DAG rendering。
- Execution run blocked notice。
- Retry action。
- SkillRun history rendering。

### 11.3 集成测试

最小 E2E：

```text
Create Project
  -> bind repo
  -> reindex context
  -> create requirement
  -> generate plan
  -> approve
  -> create execution run
  -> dispatch one task
  -> mark PR ready
  -> complete run
```

---

## 十二、MVP 上线验收

MVP 完成标准：

1. Workspace owner 可以创建 Project。
2. Project 可以绑定 GitHub repo。
3. Project 可以生成 repo architecture snapshot。
4. 用户可以在 Project 下创建 Requirement。
5. 系统可以跑 skill pipeline。
6. 系统可以生成 ProductSpec。
7. 系统可以生成 ImplementationPlan。
8. 系统可以生成 1-5 个 PRNode。
9. 用户可以 approve plan。
10. 系统可以编译 prompt。
11. 系统可以调用 Codex CLI 执行一个 PRNode。
12. 系统可以创建 GitHub PR。
13. 系统可以读取 CI。
14. 系统可以创建 FixAttempt。
15. 系统可以 blocked 并给出 EscalationSummary。

---

## 十三、推荐 PR 拆解

### PR 1: Project Domain Foundation

- migrations: projects, repositories, project_repositories
- project domain/repository/service/handler
- API routes
- tests

### PR 2: Project Console UI

- project list
- project create
- project settings
- repo binding UI

### PR 3: Repo Architecture Snapshot

- migration
- repoctx service
- analyzer
- reindex API
- context UI

### PR 4: Skill Registry

- skills/project_skills/skill_runs migrations
- seed built-in skills
- skill run service
- skill run UI

### PR 5: Requirement Model and Plan Versioning

- requirement migration
- plan snapshot versioning
- PRNode target repo
- compatibility with current SpecForge UI

### PR 6: CompiledPrompt Persistence

- compiled_prompts migration
- prompt compiler service
- task prompt linkage
- prompt preview UI

### PR 7: Codex CLI Executor

- executor interface
- Codex CLI implementation
- isolated workspace
- logs
- commit/push/PR creation

### PR 8: CI Auto-fix Hardening

- workflow log ingestion
- failure classification
- fix prompt
- bounded patch task
- escalation action UI

### PR 9: Human Review Loop

- PR comment webhook
- review feedback parser
- patch task
- PR update flow

### PR 10: Multi-repo Context

- multi-repo project context
- target repo guardrails
- primary-only execution rule

### PR 11: Hallucination Reduction Guardrails

- skill output validation
- evidence refs
- prompt contracts
- pre-PR diff risk review
- grounded planning scores
- escalation thresholds

---

## 十四、当前下一步

建议立即开始：

```text
PR 1: Project Domain Foundation
```

原因：

- Workspace / Project / Repo 是后续所有功能的归属边界。
- 没有 ProjectRepository，skill、prompt、run 都只能挂在固定 demo repo 上。
- 这一步风险低，能快速把 SpecForge 从 demo 转成真正产品结构。

完成 PR 1 后，再做 Project Console UI，让用户能在浏览器里创建 Project 并绑定 repo。

### 14.1 长任务执行协议

本计划按长任务推进。每个大 PR 都必须完成“实现、验证、自审、合并、继续”的闭环。

每个 PR 的固定流程：

```text
1. 从 main 拉最新代码
2. 创建 coco/* 工作分支
3. 实现当前切片
4. 写或更新 flow tests
5. 运行本地 API/Web 检查
6. 对 UI 改动做浏览器验证
7. 做自我 code review
8. 生成测试报告
9. push 分支并创建 PR
10. 等 GitHub CI
11. CI 通过后 squash merge 到 main
12. 回到 main 并继续下一个 PR
```

每个 PR 的测试报告必须包含：

```text
Scope
Local commands
Flow tests
Browser/UI verification
Self-review findings
Known residual risk
CI result
```

如果某个 PR 无 UI 变更，测试报告必须明确说明：

```text
UI test not applicable for this backend-only slice.
```

如果某个 PR 使用外部项目作为参考，只允许学习结构和实现思路：

```text
Reference implementation ideas only.
Do not copy branding, product names, UI identity, or proprietary identifiers.
```

### 14.2 大 PR 迭代路线

长任务按以下大 PR 推进，每个大 PR 可以视实际风险再拆成子 PR：

| PR | 目标 | 验收 |
|----|------|------|
| PR-A | Project / Repository domain foundation | Project、Repository、ProjectRepository 后端模型/API/测试完成 |
| PR-B | Project Console UI | 用户可创建 Project、绑定 repo、查看 Project context |
| PR-C | Repo architecture analysis | Project 可对绑定 repo 生成 architecture snapshot |
| PR-D | Skill pipeline foundation | Skill registry、ProjectSkill、SkillRun、pipeline history 完成 |
| PR-E | Requirement and plan versioning | Requirement、plan snapshot、PRNode target repo 完成 |
| PR-F | Prompt compiler and guardrails | CompiledPrompt contract、PR DAG validation、evidence refs 完成 |
| PR-G | Codex CLI executor | 隔离工作区、Codex CLI 调用、日志、commit/push/PR 创建完成 |
| PR-H | Verification and CI auto-fix | workflow logs、failure classification、fix prompt、bounded retry 完成 |
| PR-I | Human review loop | PR comment/review feedback 生成 patch task |
| PR-J | Multi-repo context | 多 repo context 可读，MVP 仍只修改 primary repo |

交互和 UI 原则：

```text
极简、低管理成本、围绕交付物。
用户管理 Project、Plan、PR DAG、Run、PR，不管理 agent。
默认展示摘要和下一步动作，复杂日志和证据放在可展开区域。
```

### 14.3 Open Source Module Delivery Protocol

CodingCTO is a global open source project. New implementation PRs, commits, PR comments,
test reports, screenshots, and public documentation updates must be written in English.

Work should proceed as larger reviewable module PRs, not tiny cosmetic slices. Each module PR must
finish one coherent product or architecture capability before starting the next module.

Current module priority:

| Priority | Module | Outcome | PR report must include |
|----------|--------|---------|------------------------|
| P0 | Project and Repository Foundation | Workspace/project/repository boundaries, primary vs context repo rules, and PostgreSQL-backed APIs are stable. | API commands, Kest project flow, migration status |
| P1 | Project Console and Repository Binding UI | Users can create projects, bind repositories, and understand the current project context with minimal interaction. | Browser route, screenshot, console log status |
| P2 | Repo Context and Skill Pipeline | Bound repositories produce repo profiles, architecture snapshots, skills, and SkillRun history that can ground plans. | Flow coverage for repo profile, architecture, skills, and project context |
| P3 | Requirement, Plan, and Approval Contracts | Requirements produce immutable product specs, technical plans, PR DAGs, and approval snapshots. | Plan-generation flow, approval flow, evidence refs |
| P4 | Prompt Contract and Guardrails | PR nodes compile implementation/fix/review prompts with evidence refs, scope, non-goals, tests, and hallucination guardrails. | Prompt preview, browser prompt panel, guardrail tests |
| P5 | Codex CLI Execution Runtime | Runs can dispatch PR-node tasks to a Codex CLI runtime with isolated workspaces, logs, commits, and branch/PR delivery. | Runtime heartbeat/claim/result flow, local runner smoke test |
| P6 | Verification and CI Auto-fix | GitHub workflow logs are classified, fix attempts are bounded, and escalation summaries are actionable. | Failed-CI fixture or live workflow evidence, bounded retry report |
| P7 | Human Review Loop | PR comments and review changes create patch tasks and update PR-node state without user agent management. | Webhook flow, review-comment task creation, browser delivery status |
| P8 | Multi-repo Context Guardrails | Multiple repositories can ground planning while MVP execution remains constrained to the primary repo. | Multi-repo flow, target-repo guardrail evidence |
| P9 | Production UI Polish | The console remains minimal, Swiss-style, 4px-radius where practical, and focused on Project, Plan, PR DAG, Run, and PR delivery. | Desktop browser screenshot, interaction notes, accessibility smoke check |

Every module PR must receive an English PR comment after local verification with this structure:

```text
Module outcome
Implemented scope
Validation
- Local commands
- Flow tests
- Browser/UI verification
Self-review
Residual risk
Next module
```

If a module references `multica-ai/multica`, the PR comment must say:

```text
Reference used for product and workflow ideas only. No branding, identifiers, or copied UI identity.
```

---

## 十五、Domain 层实体设计

> Domain 层不直接暴露 GORM PO。每个模块应有独立 domain entity、repository interface、service orchestration。PO 只属于 repository 实现。

### 15.1 Project Aggregate

```go
type Project struct {
    ID           uint
    WorkspaceID  uint
    Name         string
    Slug         string
    Description  string
    Status       ProjectStatus
    Repositories []ProjectRepository
}

type ProjectRepository struct {
    ID           uint
    ProjectID    uint
    RepositoryID uint
    Role         ProjectRepositoryRole
    Active       bool
}

type ProjectRepositoryRole string

const (
    ProjectRepositoryRolePrimary    ProjectRepositoryRole = "primary"
    ProjectRepositoryRoleDependency ProjectRepositoryRole = "dependency"
    ProjectRepositoryRoleDocs       ProjectRepositoryRole = "docs"
    ProjectRepositoryRoleInfra      ProjectRepositoryRole = "infra"
)
```

Domain 规则：

- `Project` 创建时必须属于一个 Workspace。
- `Project` 可以先无 repo 创建，但不能开始 planning。
- `BindRepository` 必须校验 Project repo 数量上限。
- `BindRepository` 必须校验 active primary repo 唯一性。
- `UnbindRepository` 如果删除最后一个 primary repo，需要阻止或要求先绑定新的 primary。

### 15.2 Requirement Aggregate

```go
type Requirement struct {
    ID          uint
    WorkspaceID uint
    ProjectID   uint
    CreatedBy   uint
    RawInput    string
    Type        RequirementType
    Status      RequirementStatus
}
```

Domain 规则：

- `RawInput` 不能为空。
- `Project` 必须至少有一个 active primary repo 才能进入 planning。
- `Requirement` 进入 `awaiting_approval` 后可以重新生成 plan，但旧 plan 需要保留。
- `Requirement` 进入 `executing` 后不能直接编辑 raw input。

### 15.3 Plan Aggregate

```go
type Plan struct {
    ID                 uint
    RequirementID      uint
    ProductSpec        ProductSpec
    ImplementationPlan ImplementationPlan
    PRNodes            []PRNode
    Version            int
    Status             PlanStatus
    ApprovedBy         *uint
    ApprovedAt         *time.Time
}
```

Domain 规则：

- `Approve` 只能对最新 draft plan 执行。
- `Approve` 必须冻结当前 ProductSpec、ImplementationPlan、PRNodes。
- Approved plan 不能被原地覆盖。
- 如果用户改默认决策，生成新 version。

### 15.4 Execution Aggregate

```go
type ExecutionRun struct {
    ID        uint
    PlanID    uint
    ProjectID uint
    Status    ExecutionRunStatus
    Tasks     []ExecutionTask
}

type ExecutionTask struct {
    ID               uint
    RunID            uint
    PRNodeID         uint
    CompiledPromptID *uint
    Status           ExecutionTaskStatus
    AttemptNumber    int
    FailureReason    string
}
```

Domain 规则：

- `ExecutionRun` 只能从 approved plan 创建。
- `DispatchNext` 必须遵守 DAG dependency。
- `blocked` run 不允许自动 dispatch 新 task。
- `RetryTask` 仅允许 failed/cancelled task。
- `dependency_closed` failure 不允许 retry，必须 replan。

---

## 十六、权限矩阵

| 功能 | Owner | Admin | Member | System Admin |
|------|-------|-------|--------|--------------|
| 创建 Workspace | 是 | 否 | 否 | 是 |
| 安装 GitHub App | 是 | 是 | 否 | 否 |
| 移除 GitHub App | 是 | 否 | 否 | 否 |
| 创建 Project | 是 | 是 | 可配置 | 是 |
| 删除 Project | 是 | 否 | 否 | 是 |
| 绑定 Repository | 是 | 是 | 否 | 是 |
| 修改 Repository role | 是 | 是 | 否 | 是 |
| 触发 Repo Reindex | 是 | 是 | 是 | 是 |
| 创建 Requirement | 是 | 是 | 是 | 是 |
| 查看 Plan | 是 | 是 | 是 | 是 |
| Approve Plan | 是 | 可配置 | 否 | 是 |
| Start Execution | 是 | 可配置 | 否 | 是 |
| Cancel Run | 是 | 是 | 创建者可取消 | 是 |
| Retry Task | 是 | 是 | 创建者可 retry | 是 |
| 查看 Prompt | 是 | 是 | 可配置 | 是 |
| 查看 Executor Logs | 是 | 是 | 可配置 | 是 |
| 管理 Skill Registry | 否 | 否 | 否 | 是 |

MVP 默认策略：

```text
Owner/Admin 可以 approve 和 start execution。
Member 可以创建 requirement，但不能 approve。
Prompt 和 executor logs 默认对 Owner/Admin 可见。
```

---

## 十七、跨模块依赖与数据流

### 17.1 模块依赖

```text
project
  -> github
  -> repoctx

planner
  -> project
  -> repoctx
  -> skill

prompt
  -> planner
  -> repoctx

execution
  -> planner
  -> prompt
  -> github
  -> executor
  -> verification

verification
  -> github
  -> prompt
  -> execution
```

约束：

- `repoctx` 不依赖 `planner`。
- `skill` 不直接调用 `execution`。
- `prompt` 不直接操作 GitHub。
- `executor` 不生成业务计划，只执行 compiled prompt。
- `verification` 可以触发 execution 侧 fix task，但不能绕过 run 状态机。

### 17.2 创建 Requirement 到 Plan 的完整数据流

```text
POST /projects/:id/requirements
  -> ProjectService.ValidateProjectReadyForPlanning
  -> RequirementService.Create
  -> RepoContextService.EnsureFreshProjectContext
  -> SkillService.Run(repo_architecture)
  -> SkillService.Run(product_prd)
  -> SkillService.Run(technical_plan)
  -> SkillService.Run(task_decomposition)
  -> PlannerService.ValidatePRDAG
  -> PlanService.CreateDraftVersion
  -> return PlanBundle
```

### 17.3 Approve Plan 到 ExecutionRun 的完整数据流

```text
POST /plans/:id/approve
  -> PlanService.ValidateDraft
  -> PlanService.ApplyDecisionOverrides
  -> PlanService.FreezeSnapshot
  -> PlanService.MarkApproved

POST /plans/:id/run
  -> ExecutionService.CreateRun
  -> ExecutionService.QueueRunnablePRNodes
  -> PromptCompiler.CompileImplementationPrompt
  -> ExecutionService.CreateExecutionTask
  -> ExecutorRunner.Dispatch
```

### 17.4 CI Failure 到 Auto-fix 的完整数据流

```text
GitHub workflow_run webhook
  -> GitHubWebhookService.VerifySignature
  -> VerificationService.LoadWorkflowRun
  -> VerificationService.LoadFailedJobLogs
  -> VerificationService.ClassifyFailure
  -> VerificationService.CheckFixBudget
  -> FixAttemptService.CreateOrDedupe
  -> PromptCompiler.CompileFixPrompt
  -> ExecutionService.CreateFixTask
  -> ExecutorRunner.Dispatch
```

### 17.5 PR Review Comment 到 Patch Task 的完整数据流

```text
GitHub issue_comment / pull_request_review webhook
  -> GitHubWebhookService.VerifySignature
  -> ReviewFeedbackService.ParseActionableFeedback
  -> PRNodeService.FindByPRNumber
  -> PromptCompiler.CompileReviewPatchPrompt
  -> ExecutionService.CreateReviewPatchTask
  -> ExecutorRunner.Dispatch
```

---

## 十八、事件驱动设计

### 18.1 Domain Events

| Event | Publisher | Subscriber | 用途 |
|-------|-----------|------------|------|
| `project.repository_bound` | project | repoctx | 触发 repo profile 初次分析 |
| `repo.profile_indexed` | repoctx | planner | planning 可使用最新 context |
| `requirement.created` | planner | skill | 启动 skill pipeline |
| `plan.awaiting_approval` | planner | notification | 通知用户确认 |
| `plan.approved` | planner | execution | 创建 execution run |
| `execution.task_started` | execution | audit | 记录执行开始 |
| `execution.task_failed` | execution | verification | 判断是否需要修复 |
| `github.workflow_failed` | github | verification | CI failure 分类 |
| `fix_attempt.created` | verification | execution | 创建 fix task |
| `pr_node.needs_decision` | verification | execution | block run |
| `pull_request.merged` | github | execution | 解锁下游 PRNode |
| `pull_request.closed` | github | execution | block dependent PRNode |

### 18.2 Webhook 幂等

所有 GitHub webhook 必须保存 delivery id：

```text
github_event_deliveries
  id
  delivery_id
  event_type
  repository_id
  payload_checksum
  status
  received_at
  processed_at
```

处理规则：

- 相同 delivery id 只处理一次。
- payload 校验失败直接拒绝。
- 已处理事件重复到达时返回 success。
- 处理失败可重试，但必须保证业务写入幂等。

---

## 十九、数据库迁移注意事项

### 19.1 Migration 顺序

推荐顺序：

```text
1. workspaces
2. workspace_members
3. github_installations
4. repositories
5. projects
6. project_repositories
7. repo_architecture_snapshots
8. skills
9. project_skills
10. skill_runs
11. requirements
12. compiled_prompts
13. github_event_deliveries
```

### 19.2 Seed 数据

MVP 需要 seed：

```text
默认 Workspace
默认 Project
默认 demo Repository
内置 Skills
默认 ProjectSkills
```

内置 Skill key：

```text
repo_architecture
product_prd
technical_plan
task_decomposition
pr_dag_review
implementation_prompt
fix_prompt
review_patch_prompt
ci_failure_classifier
```

### 19.3 Backfill 策略

当前已有 SpecForge demo 数据需要兼容：

```text
固定 repo_123 -> 默认 Repository
现有 plan -> 默认 Project
现有 execution run -> 默认 Project
现有 PRNode -> primary Repository
```

Backfill 要求：

- 不删除现有 demo 数据。
- 新字段先 nullable，再 backfill，再改 not null。
- 每一步 migration 可重复执行。

---

## 二十、前端对接说明

### 20.1 路由迁移

当前：

```text
/console/specforge
```

目标：

```text
/console/projects
/console/projects/:projectId
/console/projects/:projectId/settings
/console/projects/:projectId/specforge
/console/projects/:projectId/runs/:runId
```

兼容策略：

```text
/console/specforge 暂时 redirect 到默认 Project 的 SpecForge 页面。
```

### 20.2 前端数据类型

核心类型：

```ts
interface Project {
  id: number;
  workspaceId: number;
  name: string;
  slug: string;
  description: string;
  status: "active" | "archived";
}

interface ProjectRepository {
  id: number;
  projectId: number;
  repositoryId: number;
  role: "primary" | "dependency" | "docs" | "infra";
  active: boolean;
  repository: Repository;
}

interface ProjectContext {
  project: Project;
  repositories: ProjectRepository[];
  repoProfiles: RepoProfile[];
  architectureSnapshots: RepoArchitectureSnapshot[];
  skills: ProjectSkill[];
  summary: string;
}
```

### 20.3 UI 状态要求

Project Setup 页面必须覆盖：

- no GitHub installation。
- GitHub installation connected, no repos。
- Project has no primary repo。
- Repo context indexing。
- Repo context stale。
- Repo context ready。

SpecForge 页面必须覆盖：

- no project selected。
- no primary repo。
- requirement draft。
- plan generating。
- awaiting approval。
- executing。
- blocked。
- completed。

---

## 二十一、风险与处理

| 风险 | 表现 | 处理 |
|------|------|------|
| Project/Repo 边界不清 | Prompt 修改错误 repo | PRNode 必须带 targetRepositoryId |
| Skill 输出不可追踪 | plan 不可复现 | SkillRun 保存 input/output/version |
| Prompt 不可复现 | 任务失败难排查 | CompiledPrompt 持久化 + checksum |
| Codex CLI 改动越界 | 破坏非目标模块 | allowed file scope + diff review |
| CI 修复循环 | 反复 patch 失败 | fix budget + same failure cap |
| 多 repo 过早复杂化 | DAG 调度失控 | MVP 只修改 primary repo |
| GitHub webhook 重复 | 状态重复推进 | delivery id 幂等 |
| 权限过大 | 用户不敢安装 | GitHub App 最小权限 |

---

## 二十二、减少幻觉控制机制

SpecForge 的核心质量目标不是让模型“更会写”，而是让模型不能在缺少证据、边界和验证的情况下自由发挥。

控制思路：

```text
Grounded context
  -> Structured skill output
  -> Evidence refs
  -> Prompt contract
  -> Diff risk review
  -> Verification
  -> Escalation
```

### 22.1 Grounded Planning

所有规划类 skill 必须基于可追踪证据生成结论。

可用证据来源：

```text
repo_profile
repo_architecture_snapshot
AGENTS.md
README.md
package/go module files
CI workflow files
existing routes/models/services/tests
recent merged PR summaries
approved plan history
rejected feedback history
```

Planner 输出中的关键判断必须能关联 evidence ref。

示例：

```json
{
  "claim": "Use existing service layer instead of calling the ORM directly in handlers.",
  "evidence_refs": [
    {
      "source_type": "file",
      "source_path": "api/AGENTS.md",
      "excerpt": "Handlers call services; repositories own persistence."
    },
    {
      "source_type": "code_pattern",
      "source_path": "api/internal/modules/user/handler.go"
    }
  ]
}
```

### 22.2 EvidenceRefs 数据结构

建议新增通用结构，供 SkillRun、ProductSpec、ImplementationPlan、PRNode、CompiledPrompt 引用。

```go
type EvidenceRef struct {
    SourceType string `json:"source_type"` // file, code_pattern, ci_workflow, prior_plan, pr_summary, user_input
    SourcePath string `json:"source_path,omitempty"`
    LineStart  *int   `json:"line_start,omitempty"`
    LineEnd    *int   `json:"line_end,omitempty"`
    CommitSHA  string `json:"commit_sha,omitempty"`
    Excerpt    string `json:"excerpt,omitempty"`
    Claim      string `json:"claim,omitempty"`
}
```

存储方式：

```text
MVP: EvidenceRefsJSON 字段挂在 SkillRun / Plan / PRNode / CompiledPrompt
V2: 独立 evidence_refs 表，支持跨对象查询
```

### 22.3 Skill Output Validation

每个 skill 不能只保存 output，还必须保存 validation result。

建议给 `skill_runs` 增加：

```text
validation_status: passed | warning | failed
validation_errors_json
coverage_score
grounding_score
risk_score
confidence_score
```

评分含义：

| Score | 含义 | 低分处理 |
|-------|------|----------|
| `coverage_score` | 是否覆盖用户需求和验收标准 | 重新生成或要求用户确认 |
| `grounding_score` | 是否有 repo evidence 支撑 | 补 context 或阻塞 |
| `risk_score` | 是否触及高风险模块 | 降低自动执行权限 |
| `confidence_score` | 综合可信度 | 低于阈值进入 needs decision |

MVP 阈值建议：

```text
coverage_score < 0.75 -> plan failed
grounding_score < 0.65 -> needs more repo context
risk_score > 0.80 -> require explicit approval
confidence_score < 0.70 -> needs user decision
```

### 22.4 PR DAG Validation

PR DAG 生成后必须做结构化校验。

校验项：

```text
所有 acceptance criteria 至少映射到一个 PRNode
每个 PRNode 至少有一个 acceptance criterion
每个 PRNode 有 targetRepositoryId
targetRepositoryId 属于当前 Project
MVP targetRepositoryId 必须是 primary repo
dependsOn 不存在循环
dependsOn 引用真实 PRNode
expectedFiles 不为空
testCommands 来自 repo profile 或 CI workflow
高风险模块必须出现在 risk notes
PRNode 不同时包含 database + API + UI + email
PRNode 的 expectedFiles 不跨越过多模块
```

输出结构：

```json
{
  "status": "passed",
  "errors": [],
  "warnings": [
    "PR-003 touches auth and database; require explicit risk note."
  ],
  "coverage_score": 0.91,
  "dependency_score": 0.88,
  "reviewability_score": 0.82
}
```

### 22.5 Prompt Contract

CompiledPrompt 需要拆成自然语言正文和机器可校验 contract。

建议给 `compiled_prompts` 增加：

```text
contract_json
```

Contract 示例：

```json
{
  "target_repository_id": 123,
  "branch_name": "specforge/team-invite-02-api",
  "allowed_files": [
    "api/internal/modules/invitation/**",
    "api/database/migrations/**"
  ],
  "forbidden_files": [
    ".env",
    "api/config/secrets/**",
    "web/**"
  ],
  "required_commands": [
    "go test ./internal/modules/invitation/..."
  ],
  "non_goals": [
    "Do not build UI in this PR",
    "Do not change billing logic"
  ],
  "acceptance_criteria": [],
  "max_core_diff_lines": 800
}
```

Executor 只能执行带 contract 的 prompt。

### 22.6 Pre-PR Diff Risk Review

Codex CLI 执行完成后，创建 PR 前必须做 diff risk review。

检查项：

```text
是否修改 forbidden_files
是否修改 target repo 之外的文件
是否大幅超出 expectedFiles
是否删除测试
是否引入 secret/token
是否修改 lockfile 但没有说明
是否改动超过 max_core_diff_lines
是否没有运行 required_commands
是否 PR description 缺少 test plan
是否触及 high-risk area 但没有 risk note
```

Diff review 输出：

```json
{
  "status": "warning",
  "risk_level": "medium",
  "violations": [],
  "warnings": [
    "Changed package lockfile; require implementation note."
  ],
  "required_actions": [
    "Add lockfile note to PR description."
  ]
}
```

阻塞规则：

```text
forbidden_files 被修改 -> block
secret/token 被检测到 -> block
target repo 之外改动 -> block
未运行 required_commands -> warning，MVP 可允许人工确认
diff 过大 -> needs decision
```

### 22.7 Hallucination Guardrail Service

建议新增 `guardrail` module。

职责：

```text
Validate SkillRun output
Validate PR DAG
Validate CompiledPrompt contract
Run pre-PR diff review
Compute grounded planning scores
Emit needs_decision events
```

目录建议：

```text
api/internal/modules/guardrail/
  domain.go
  service.go
  validators.go
  handler.go
  repository.go
```

服务接口方向：

```go
type GuardrailService interface {
    ValidateSkillRun(ctx context.Context, runID uint) (SkillValidationResult, error)
    ValidatePRDAG(ctx context.Context, planID uint) (PRDAGValidationResult, error)
    ValidatePromptContract(ctx context.Context, promptID uint) (PromptContractValidationResult, error)
    ReviewDiff(ctx context.Context, taskID uint) (DiffRiskReviewResult, error)
}
```

### 22.8 Escalation Thresholds

以下情况必须进入 `needs_user_decision`：

```text
ProductSpec coverage_score < 0.75
TechnicalPlan grounding_score < 0.65
PR DAG validation failed
Prompt contract validation failed
Diff risk review blocked
Executor touched forbidden files
CI failure classified as product_mismatch
Same failure type exceeded retry limit
Migration failure confidence < 0.80
Auth/permission failure confidence < 0.80
```

EscalationSummary 必须包含：

```text
reason
evidence_refs
risk_level
recommended_option
decision_options
blocked_object_type
blocked_object_id
```

### 22.9 前端展示要求

Plan Review 页面增加：

```text
Grounding score
Coverage score
Risk score
Evidence refs
PR DAG validation result
```

Execution 页面增加：

```text
Prompt contract preview
Diff risk review result
Guardrail violations
Escalation evidence
```

展示原则：

```text
不要把所有原始日志暴露给用户。
默认展示决策摘要。
允许用户展开查看证据和验证错误。
```

### 22.10 推荐新增 PR

为了把减少幻觉机制落地，建议在 `Prompt Compiler Persistence` 后增加一个独立 PR：

```text
PR 6.5: Guardrail Validation Foundation
```

范围：

- 新增 guardrail module。
- 新增 SkillRun validation result 字段。
- 新增 CompiledPrompt contract_json。
- 实现 PR DAG validator。
- 实现 prompt contract validator。
- 前端展示 validation summary。

不做：

- 不接真实 Codex CLI。
- 不做复杂 security scanner。
- 不做跨 repo diff review。

验收：

```text
一个 plan 只有通过 PR DAG validation 才能 approve。
一个 ExecutionTask 只有 prompt contract validation 通过才可 dispatch。
```
