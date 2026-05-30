# SpecForge Architecture Plan

## 1. 目标

SpecForge 的目标是把一个产品需求从自然语言输入，稳定编译成可 review 的 GitHub PR。

核心链路：

```text
Workspace / Project / Repos
  -> Repo architecture analysis
  -> Skill execution
  -> PRD generation
  -> Task / PR DAG planning
  -> Prompt compilation
  -> Codex CLI execution
  -> GitHub PR delivery
  -> CI verification and auto-fix
```

系统的关键不是“调用 Codex CLI 写代码”，而是先建立足够可靠的上下文、拆解和调度层，让 Codex CLI 执行的是明确、可验证、可回滚的工程任务。

## 2. 业务层级

推荐业务层级：

```text
Workspace
  -> Project
      -> ProjectRepository
          -> Repository
```

### Workspace

Workspace 是组织和权限边界。

职责：

- 管理成员。
- 管理 GitHub App installation。
- 管理 billing、quota、审计。
- 管理多个 Project。
- 管理组织级默认策略。

关系：

```text
一个 Workspace 可以有多个 Project
一个 Workspace 可以安装多个 GitHub installation
一个 User 可以属于多个 Workspace
```

### Project

Project 是产品或工程交付单元。

例子：

- SpecForge
- Main SaaS App
- Admin Console
- Public API
- Mobile App

职责：

- 聚合本项目相关 repo。
- 保存项目级业务上下文。
- 保存项目级 skill 配置。
- 承载需求、PRD、计划、执行 run。
- 形成长期 project memory。

关系：

```text
一个 Project 属于一个 Workspace
一个 Project 可以绑定多个 Repository
一个 Requirement 属于一个 Project
一个 ExecutionRun 属于一个 Project
```

### Repository

Repository 是代码读取、分析和执行边界。

职责：

- 保存 GitHub owner/repo/default branch。
- 保存 repo profile。
- 保存 architecture map。
- 保存 test/CI profile。
- 保存 repo-specific instructions。
- 作为 Codex CLI 的执行工作区来源。

### ProjectRepository

ProjectRepository 是 Project 和 Repository 的绑定关系。

一个 Project 可以绑定多个 repo，但每个 repo 在项目中有不同角色：

```text
primary     主要产品代码，默认可执行改动
dependency  依赖库或 SDK，默认只读，必要时可生成独立 PR
docs        文档仓库，默认用于上下文或文档 PR
infra       CI/CD、Terraform、部署配置，默认高风险
```

MVP 约束：

```text
一个 Project 最多绑定 1-3 个 repo
一次 ExecutionRun 默认只修改 1 个 primary repo
其他 repo 默认只作为 context
```

V2 再支持：

```text
一次 Requirement 生成跨 repo PR DAG
每个 repo 独立 branch / PR / CI
跨 repo dependency tracking
```

## 3. 核心领域对象

```text
Workspace
User
WorkspaceMember
GitHubInstallation
Project
Repository
ProjectRepository
RepoProfile
RepoArchitectureSnapshot
Skill
ProjectSkill
Requirement
ProductSpec
ImplementationPlan
TaskNode / PRNode
CompiledPrompt
ExecutionRun
ExecutionTask
FixAttempt
PullRequest
EscalationSummary
```

### Requirement

Requirement 是用户输入的原始需求。

字段方向：

```text
id
workspaceId
projectId
createdBy
rawInput
type: feature | bugfix | refactor | docs | test
status: draft | analyzing | planning | awaiting_approval | approved | executing | completed | cancelled
```

### ProductSpec

ProductSpec 是系统生成的轻量 PRD。

内容：

- 产品目标
- 用户故事
- 业务规则
- 权限规则
- 非目标
- 边界情况
- 验收标准
- 默认决策
- 需要用户确认的问题

### ImplementationPlan

ImplementationPlan 是技术方案。

内容：

- 技术目标
- 影响模块
- 数据模型变化
- API 变化
- UI 变化
- 测试策略
- 安全风险
- 迁移风险
- 推荐 PR 拆解

### PRNode

PRNode 是最小交付单元。

每个 PRNode 必须满足：

- 目标清晰
- 范围有限
- 有 non-goals
- 有验收标准
- 有测试命令
- 有依赖关系
- 可以独立 review
- 可以失败后独立 retry

### CompiledPrompt

CompiledPrompt 是给 Codex CLI 的最终执行说明。

每个 prompt 必须可追踪：

```text
Requirement -> ProductSpec -> ImplementationPlan -> PRNode -> CompiledPrompt -> ExecutionTask -> Commit / PR
```

### ExecutionRun

ExecutionRun 是一次 approved plan 的执行实例。

状态：

```text
queued
running
blocked
completed
cancelled
```

### ExecutionTask

ExecutionTask 是一个 PRNode 的一次执行尝试。

状态：

```text
queued
waiting_on_dependencies
running
pr_opened
ci_running
ready_for_review
failed
cancelled
blocked
completed
```

### FixAttempt

FixAttempt 是 CI 或 verification 失败后的修复尝试。

约束：

- 每个 PRNode 最多自动修复 N 次。
- 同类失败最多连续修复 M 次。
- 同一个 workflow run 不重复创建 fix attempt。
- 超过阈值后进入 blocked，并生成 EscalationSummary。

## 4. 服务架构

```text
Web Console
  -> API Server
      -> Project Service
      -> Repo Context Service
      -> Skill Service
      -> Planner Service
      -> Prompt Compiler
      -> Execution Orchestrator
      -> Executor Runner
      -> Verification Service
      -> GitHub Integration Service
      -> Memory Service
```

### Project Service

职责：

- Workspace / Project / Repository 绑定。
- ProjectRepository role 管理。
- Project-level settings。
- Project memory 入口。

### Repo Context Service

职责：

- clone / fetch repo。
- 扫描文件结构。
- 识别技术栈。
- 识别测试命令。
- 识别 CI workflow。
- 识别 AGENTS.md / CONTRIBUTING.md。
- 识别风险区域。
- 生成 RepoProfile。
- 生成 RepoArchitectureSnapshot。

输出：

```json
{
  "stack": ["Next.js", "Go", "PostgreSQL"],
  "testCommands": ["pnpm type-check", "pnpm lint", "go test ./..."],
  "ciProvider": "github_actions",
  "appStructure": {},
  "codingConventions": [],
  "riskAreas": ["auth", "database", "execution"]
}
```

### Skill Service

职责：

- 管理内置 skill。
- 管理 project-enabled skill。
- 根据需求和 repo context 选择 skill。
- 跑 skill 并保存输出。

Skill 类型：

```text
repo_architecture
product_prd
technical_plan
task_decomposition
prompt_compiler
ci_failure_classifier
security_review
code_review
```

MVP skill 策略：

```text
先做内置 skill registry
每个 skill 是可版本化的 prompt/template + schema
不要一开始做复杂 marketplace
```

### Planner Service

职责：

- Requirement -> ProductSpec。
- ProductSpec -> ImplementationPlan。
- ImplementationPlan -> PR DAG。
- PR DAG 自检。
- 复杂度保护。

关键校验：

- 原始需求是否被覆盖。
- 每个 acceptance criterion 是否映射到 PRNode。
- PRNode 是否过大。
- 是否有隐藏依赖。
- 是否需要拆 milestone。

### Prompt Compiler

职责：

- PRNode -> coding prompt。
- FixAttempt -> fix prompt。
- Review comment -> patch prompt。

每个 prompt 包含：

- 当前 PR 目标。
- 相关 ProductSpec 片段。
- 相关 TechnicalPlan 片段。
- RepoProfile 片段。
- 允许修改范围。
- 禁止事项。
- 依赖 PR 信息。
- 验收标准。
- 测试命令。
- PR description 模板。

### Execution Orchestrator

职责：

- 执行 PR DAG。
- 创建 branch。
- 创建 ExecutionTask。
- 调用 Executor Runner。
- 维护任务状态。
- 处理依赖解锁。
- 阻止 blocked run 继续执行。
- 允许 failed/cancelled task retry。
- 完成 run。

调度规则：

```text
无依赖节点可以并行
有依赖节点按拓扑顺序执行
foundation/schema/API 优先
UI 依赖 API
verification PR 可以靠后
```

### Executor Runner

职责：

- 管理隔离工作区。
- 注入 prompt。
- 调用 Codex CLI。
- 捕获 stdout/stderr。
- 提交 commit。
- push branch。
- 返回 ExecutionResult。

接口方向：

```ts
interface CodeExecutor {
  name: string
  prepare(context: ExecutionContext): Promise<void>
  run(prompt: CompiledPrompt): Promise<ExecutionResult>
  cancel(taskId: string): Promise<void>
  getLogs(taskId: string): Promise<ExecutorLogs>
}
```

### Verification Service

职责：

- 运行本地测试。
- 读取 GitHub Actions 状态。
- 拉取 workflow logs。
- 分类失败。
- 创建 FixAttempt。
- 触发 fix prompt。
- 生成 EscalationSummary。

失败分类：

```text
lint_failure
type_error
unit_test_failure
missing_dependency
migration_failure
auth_permission_failure
flaky_test
product_mismatch
unknown
```

### GitHub Integration Service

职责：

- GitHub App authentication。
- installation token。
- repository access。
- branch operations。
- PR operations。
- workflow run operations。
- check run/status。
- webhook processing。

Webhook：

```text
pull_request
pull_request_review
issue_comment
check_run
check_suite
workflow_run
push
```

### Memory Service

职责：

- 保存 approved plan history。
- 保存 merged PR summary。
- 保存 rejected feedback。
- 保存 repo/project conventions。
- 保存常见 CI failure 和修复方式。

MVP 先做轻量 memory：

```text
RepoProfile
ApprovedPlanSummary
MergedPRSummary
RejectedFeedbackSummary
```

## 5. 主流程

### 5.1 Project Setup

```text
1. 用户创建 Workspace
2. 安装 GitHub App
3. 创建 Project
4. 绑定 1-3 个 repo
5. 给每个 repo 设置 role
6. 系统分析 repo
7. 生成 Project Context
```

### 5.2 Requirement to Plan

```text
1. 用户选择 Project
2. 输入 Requirement
3. 系统选择相关 repo
4. 跑 Repo Context Service
5. 跑相关 skills
6. 生成 ProductSpec
7. 生成 ImplementationPlan
8. 生成 PR DAG
9. 自检 plan
10. 展示 Plan Review
```

### 5.3 Plan Approval

```text
1. 用户查看 ProductSpec
2. 用户查看默认决策
3. 用户查看 TechnicalPlan
4. 用户查看 PR DAG
5. 用户确认风险和假设
6. 用户点击 Approve & Start
7. 系统创建 immutable plan snapshot
```

### 5.4 Execution

```text
1. 创建 ExecutionRun
2. 找到无依赖 PRNode
3. 编译 prompt
4. 创建 branch
5. 调用 Codex CLI
6. 提交 commit
7. push branch
8. 创建 PR
9. 进入 verification
10. 通过后解锁下游节点
```

### 5.5 CI Auto-fix

```text
1. CI failed
2. 拉取 workflow run
3. 拉取 failed job logs
4. 分类 failure
5. 判断是否可自动修复
6. 创建 FixAttempt
7. 编译 fix prompt
8. 调用 Codex CLI patch
9. push commit
10. 重新等待 CI
11. 成功则继续 DAG
12. 失败超过阈值则 blocked
```

### 5.6 Escalation

当系统不能安全继续时，生成 EscalationSummary：

```text
原因
最新失败
影响范围
可选方案
推荐方案
是否需要重新规划
```

用户可操作：

```text
Retry failed task
Continue with recommended option
Replan PR DAG
Cancel run
```

## 6. 数据模型草案

### ProjectRepository

```json
{
  "id": "proj_repo_123",
  "workspaceId": "workspace_123",
  "projectId": "project_123",
  "repositoryId": "repo_123",
  "role": "primary",
  "active": true,
  "createdAt": "...",
  "updatedAt": "..."
}
```

### RepoArchitectureSnapshot

```json
{
  "id": "arch_123",
  "repositoryId": "repo_123",
  "commitSha": "abc123",
  "summary": "...",
  "modules": [],
  "entrypoints": [],
  "testCommands": [],
  "ciWorkflows": [],
  "riskAreas": [],
  "generatedAt": "..."
}
```

### ProjectSkill

```json
{
  "id": "project_skill_123",
  "projectId": "project_123",
  "skillKey": "task_decomposition",
  "version": "v1",
  "enabled": true,
  "config": {}
}
```

### Requirement

```json
{
  "id": "req_123",
  "workspaceId": "workspace_123",
  "projectId": "project_123",
  "rawInput": "Add team invite feature",
  "type": "feature",
  "status": "awaiting_approval"
}
```

### CompiledPrompt

```json
{
  "id": "prompt_123",
  "requirementId": "req_123",
  "planId": "plan_123",
  "prNodeId": "prnode_123",
  "promptType": "implementation",
  "version": 1,
  "content": "...",
  "createdAt": "..."
}
```

## 7. API 设计方向

```http
POST /api/workspaces
POST /api/projects
POST /api/projects/:projectId/repositories
GET  /api/projects/:projectId/context

POST /api/projects/:projectId/requirements
GET  /api/requirements/:requirementId/plan
POST /api/plans/:planId/approve
POST /api/plans/:planId/run

GET  /api/runs/:runId
POST /api/tasks/:taskId/retry
POST /api/tasks/:taskId/cancel

GET  /api/pr-nodes/:prNodeId/escalation-summary
POST /api/pr-nodes/:prNodeId/replan
```

## 8. 实施计划

### Phase 1: Project / Repo Context Foundation

目标：

```text
让系统从 Workspace 进入 Project，再绑定 repo 并生成 repo/project context。
```

任务：

1. 增加 Project 和 ProjectRepository 后端模型。
2. 增加 Project CRUD API。
3. 增加 repo 绑定 API。
4. 增加 Project Context 聚合接口。
5. 前端增加 Project selector 和 repo binding 页面。
6. 将现有 SpecForge console 从固定 repo 改为 project-scoped。

验收：

```text
用户可以创建 Project，绑定 repo，并看到 Project Context。
```

### Phase 2: Skill Pipeline

目标：

```text
让 requirement planning 通过可版本化 skill pipeline 执行。
```

任务：

1. 增加 Skill registry。
2. 增加 ProjectSkill 配置。
3. 定义 skill input/output schema。
4. 将 ProductSpec / TechnicalPlan / PRDAG 生成拆成 skill steps。
5. 保存每次 skill run 的输入、输出、版本。

验收：

```text
每次 plan 都能追踪由哪些 skills、哪些版本、哪些输入生成。
```

### Phase 3: Prompt Compiler

目标：

```text
让每个 PRNode 生成可追踪、可复现的 Codex CLI prompt。
```

任务：

1. 增加 CompiledPrompt 模型。
2. 增加 prompt compiler service。
3. 保存 implementation prompt。
4. 保存 fix prompt。
5. 保存 review patch prompt。
6. 前端展示 prompt version 和 prompt preview。

验收：

```text
每个 ExecutionTask 都能关联到一个 CompiledPrompt。
```

### Phase 4: Codex CLI Executor

目标：

```text
让 ExecutionTask 真正调用 Codex CLI，并产出 commit / branch / PR。
```

任务：

1. 定义 CodeExecutor interface。
2. 实现 CodexCLIExecutor。
3. 增加隔离工作区管理。
4. 增加 stdout/stderr 捕获。
5. 增加 task cancel。
6. 增加 commit/push/PR 创建。
7. 增加 executor runtime heartbeat。

验收：

```text
一个 approved PRNode 可以被 Codex CLI 实现并创建 GitHub PR。
```

### Phase 5: Verification and Auto-fix

目标：

```text
闭环处理 CI failure。
```

任务：

1. 拉取 GitHub Actions workflow run。
2. 拉取 failed job logs。
3. 分类 failure。
4. 创建 FixAttempt。
5. 编译 fix prompt。
6. 调用 Codex CLI patch。
7. 控制 retry budget。
8. blocked 时生成 EscalationSummary。

验收：

```text
lint/type/test failure 可以自动修复至少一次，不能修复时能给出决策摘要。
```

### Phase 6: Multi-repo Read Context

目标：

```text
一个 Project 可以绑定多个 repo，但一次 run 只修改一个 primary repo。
```

任务：

1. Project Context 支持多个 repo。
2. Planner 可读取 dependency/docs/infra repo context。
3. PRNode 明确 targetRepositoryId。
4. ExecutionRun 校验只执行一个 repo。

验收：

```text
需求生成计划时可以参考多个 repo，但只在 primary repo 创建 PR。
```

### Phase 7: Cross-repo PR DAG

目标：

```text
支持一个需求拆成多个 repo 的 PR。
```

任务：

1. PRNode 支持 target repo。
2. DAG 支持跨 repo dependency。
3. 每个 repo 独立 branch strategy。
4. CI 和 merge 状态跨 repo 解锁。
5. Escalation 支持跨 repo blocker。

验收：

```text
一个需求可以生成 app repo + sdk repo + docs repo 的关联 PR set。
```

## 9. 当前下一步建议

最近的开发顺序建议：

1. 先做 Project / ProjectRepository 后端模型和 migration。
2. 再把当前 SpecForge console 从固定 repo 改成 project-scoped。
3. 然后实现 Skill registry 和 skill run history。
4. 再实现 CompiledPrompt 持久化。
5. 最后接真实 Codex CLI executor。

原因：

```text
没有 Project/Repo 上下文，后面的 skill、planner、prompt、executor 都缺少稳定归属。
先把业务边界定住，再推进执行层。
```
