# CodingCTO MVP 测试工作流

这份文档定义了一套可执行的端到端测试流程，用于验证当前 CodingCTO MVP 在项目初始化、规划、执行、PR 交付、评审、修复回路和合并回收上的完整表现。

它面向当前这套已完成的 MVP 分支链路做本地验收，不只是零散的单元测试。

## 1. 目标

验证一个工作区 Owner 是否可以完整走通下面这条 MVP 主链路：

```text
创建项目
  -> 连接 GitHub
  -> 绑定主仓库
  -> 构建项目上下文
  -> 配置专家边界
  -> 创建需求
  -> 生成并批准计划
  -> 编译提示词
  -> 派发本地 runtime
  -> 自动创建 GitHub PR
  -> 处理 CI 和 review 反馈
  -> 批准合并
  -> 将 merged 状态回收同步回 CodingCTO
```

这套工作流覆盖：

- 正常主路径
- 实际操作员路径
- 失败路径
- hardening 和状态回收路径

## 2. 范围

### 包含范围

- 项目 readiness 检查
- GitHub 安装同步与仓库绑定
- 项目 context snapshot 与 readiness
- Expert Policy 持久化
- Runtime 注册与可用性检查
- Requirement 提交与 Plan 生成
- Prompt 编译
- Execution run 启动与 dispatch
- PR 交付
- CI 刷新与失败日志读取
- Fix attempt 与 review patch task
- Review decision 与 merge request 流程
- Webhook / 手工 merge 后的状态回收
- Stale runtime 处理

### 不包含范围

- 单次 run 中的多仓库写入执行
- 生产环境部署验证
- 计费、组织级管理或 merge queue

## 3. 前置条件

只有在包含完整 MVP 闭环切片的分支上，才执行这份工作流。按当前仓库状态，建议使用：

- `feature/mvp-pr10-hardening`

### 本地服务

- API: `http://localhost:2010`
- API base: `http://localhost:2010/v1`
- Web: `http://localhost:2020`

### 必备工具

- Go toolchain
- `pnpm`
- `gh`
- 至少一个本地 CLI 执行器：
  - `codex`
  - 或 `claude`

### 必备外部配置

- API 侧可用的 GitHub App 配置
- 一个测试用 GitHub 仓库，GitHub App 对它至少有：
  - 读取代码权限
  - 创建 PR 权限
  - 合并 PR 权限
- 该仓库在本地的一份 clone，用于 runtime 执行任务

### 建议测试角色

- `Workspace Owner`：负责 UI 上的创建、绑定、批准、合并等动作
- `Runtime Operator`：负责保持 runtime 在线并执行本地任务

在 MVP 验收阶段，一个人也可以同时扮演这两个角色。

## 4. 推荐测试顺序

按下面顺序执行：

1. 自动化基线检查
2. 首次项目初始化流程
3. Context 与 Expert Policy 流程
4. Requirement、Plan 与 Prompt 流程
5. Runtime 派发与 PR 创建流程
6. CI 与 Review Feedback 流程
7. Merge 流程
8. Hardening 与状态回收流程

不要在 happy path 未通过之前，就直接开始 merge 或 webhook 类边界测试。

## 5. 自动化基线检查

在做手工测试前先跑这些命令：

```bash
cd /Users/mingde/item/codingcto/api && make wire
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/project ./internal/modules/githubintegration ./internal/modules/planning ./internal/modules/execution ./internal/modules/review ./database/migrations ./internal/starter

cd /Users/mingde/item/codingcto/web && pnpm type-check
cd /Users/mingde/item/codingcto/web && pnpm lint
cd /Users/mingde/item/codingcto/web && pnpm test
```

最低通过门槛：

- API 测试通过
- Web `type-check` 通过
- Web `lint` 通过
- 关键 feature 测试通过

如果这些基线检查失败，不要进入手工验收，先修掉失败项。

## 6. 测试数据准备

开始前准备好以下测试数据：

### Workspace / Project

- 一个全新的 workspace
- 该 workspace 下一个全新的 project

### Repository

- 一个可写 GitHub 仓库，满足：
  - 有默认分支
  - 有 CI workflow，或者至少有一个可失败的测试命令
  - 代码体量适中，便于理解

### Requirement

准备一个稳定会改代码并触发测试的需求。示例：

```text
增加一个小型 settings 校验增强，并把结果展示到 UI 上，同时补测试。
```

### 可选失败场景种子

准备一个已知会失败的改动，用于模拟：

- CI 失败
- review changes requested
- fix attempt 生成

## 7. 路由覆盖范围

这份工作流应覆盖以下 UI 页面：

- `/console/projects`
- `/console/projects/:projectId`
- `/console/projects/:projectId/context`
- `/console/projects/:projectId/requirements/new`
- `/console/projects/:projectId/plans/:planId`
- `/console/projects/:projectId/codingcto`
- `/console/projects/:projectId/prs/:prNodeId`

关键后端接口面应覆盖：

- project readiness
- GitHub installation status 与 sync
- project context reindex 与 fetch
- project expert policy read/write
- plan approval
- prompt compilation
- run start 与 dispatch
- runtime heartbeat
- review decision get / approve / reject / request-merge
- GitHub CI refresh 与 webhook intake

## 8. 场景 A：首次初始化流程

### 目标

验证一个新 workspace owner 能否把项目推进到可执行状态。

### 步骤

1. 启动本地 API 和 Web。
2. 打开 `/console/projects`。
3. 创建一个新项目。
4. 打开项目 overview 页面。
5. 确认 readiness 卡片能正确显示缺失项。
6. 进入项目 context / setup 页面。
7. 连接或同步 GitHub App 安装。
8. 确认 installation status 可以正常加载。
9. 同步该 installation 下的 repositories。
10. 绑定一个 repository 作为项目 primary repository。

### 预期结果

- 项目成功创建
- readiness 卡片可见
- GitHub installation status 可读取
- 同步后仓库列表出现
- 可以明确选择一个主仓库
- 项目不再显示“缺少 repository”

### 建议留证

- setup 前 readiness 截图
- 绑定仓库后 readiness 截图
- 如有问题，保存 installation status API 返回

## 9. 场景 B：Context 与 Expert Policy

### 目标

验证 CodingCTO 能否建立项目级 context snapshot，并持久化专家边界。

### 步骤

1. 打开 `/console/projects/:projectId/context`。
2. 触发项目 context 分析 / reindex。
3. 等待最新 context snapshot 可读取。
4. 确认 repo context 信息存在。
5. 如适用，确认 DeepWiki 归一化后的上下文信息存在。
6. 配置项目 expert policy：
   - 目标边界
   - 允许修改范围
   - merge 预期
   - review 深度要求
7. 保存 expert policy。
8. 刷新页面。

### 预期结果

- 存在最新的 project context snapshot
- context readiness 变成绿色或至少给出明确下一步
- expert policy 刷新后仍保留
- context 和 policy 就绪后，project readiness 明显改善

### 建议留证

- snapshot 时间戳
- context summary
- 保存后的 expert policy 字段值

## 10. 场景 C：Requirement、Plan 与 Prompt 编译

### 目标

验证 requirement 能生成可执行 plan，并且 PR node 可以成功编译提示词。

### 步骤

1. 打开 `/console/projects/:projectId/requirements/new`。
2. 提交一个 requirement。
3. 确认成功生成 plan。
4. 打开 `/console/projects/:projectId/plans/:planId`。
5. 检查：
   - product spec
   - implementation plan
   - PR DAG
   - evidence refs
   - active context / policy 引用
6. 对至少一个 PR node 编译以下模式的 prompt：
   - `implementation`
   - `fix`
   - `review_patch`
7. 确认 prompt preview 可以正常渲染。

### 预期结果

- requirement 被系统接收
- plan 成功创建并正确关联到 project
- plan 引用了当前激活的 context 和 policy 输入
- prompt 编译成功
- 编译结果中应包含：
  - 任务目标
  - 代码上下文
  - 约束条件
  - evidence refs

### 可选 API spot check

验证 `POST /v1/pr-nodes/:id/prompts` 对某个节点成功返回。

## 11. 场景 D：Plan 批准与 Runtime Readiness

### 目标

验证只有 execution-ready 的项目才能启动 run，并把任务 dispatch 给健康 runtime。

### 步骤

1. 启动本地 runtime，或使用本地 CLI helper 持续发送 runtime heartbeat。
2. 在 CodingCTO 的 runtime / delivery 视图中确认 runtime 处于 online。
3. 回到 plan review 页面。
4. 批准 plan。
5. 启动 execution run。
6. 在开启 runtime-readiness 校验的前提下 dispatch run。

### 预期结果

- runtime 显示为在线
- 已批准的 plan 能正常启动 run
- 系统根据 PR DAG 创建 queued tasks
- 只有 runtime readiness 满足时 dispatch 才成功
- run 状态进入 `queued` 或 `running`

### 负向检查

确认以下情况会阻止 dispatch：

- 没有在线 runtime
- runtime heartbeat 已过期
- 必需的 CLI 不存在

## 12. 场景 E：本地 Agent 执行与 PR 交付

### 目标

验证 runtime 能 claim task、本地执行，并自动创建 GitHub PR。

### 步骤

1. 在 runtime 环境中 claim 一个 dispatched task。
2. 在本地仓库 worktree 中执行该任务。
3. 让 runtime 提交任务结果。
4. 确认 CodingCTO 执行 commit / push / PR delivery。
5. 打开项目 delivery board。
6. 确认对应 PR node 展示了：
   - branch name
   - GitHub PR number
   - GitHub PR URL
   - 最新 node status

### 预期结果

- task 按顺序流转：dispatched / running / completed
- branch 能正确创建或复用
- commit 和 push 成功
- GitHub PR 成功创建
- PR node 进入 `pr_opened`、`ci_running` 或 `ready_for_review`

### 建议留证

- run ID
- task ID
- PR URL
- CodingCTO 内的 node status

## 13. 场景 F：CI 刷新、失败日志与 Fix Attempt

### 目标

验证 CI 校验回路，包括绿色路径和失败路径。

### 绿色路径

1. 在 PR node 上刷新 CI 状态。
2. 如果检查通过，确认 node 进入 `ready_for_review`。

### 失败路径

1. 准备一个会失败 CI 的 PR。
2. 刷新 CI 状态。
3. 读取 failure log。
4. 确认 CodingCTO 能创建或已经创建 fix attempt。
5. 如适用，确认 escalation summary 可读。

### 预期结果

- CI refresh 能更新 PR node 状态
- 有 workflow 数据时，可以读取 failure log
- CI 失败能驱动 fix attempt
- fix attempt 元信息可见
- escalation summary 能告诉操作者下一步该做什么

### 负向检查

确认以下情况处理正确：

- 还没有 workflow run
- 有 workflow run，但日志不可用
- CI 状态超时或不确定

## 14. 场景 G：Review Feedback 与 Review Patch

### 目标

验证 GitHub review feedback 能否回流到 CodingCTO，并驱动 patch 工作。

### 步骤

1. 在 GitHub PR 上添加可执行的 review feedback：
   - review comment
   - 或 changes requested review
2. 触发 webhook 投递到本地 API。
3. 确认 CodingCTO 成功接收 webhook。
4. 当 review 为 changes requested 时，确认 PR node 被置为 blocked。
5. 确认反馈内容进入系统事件链。
6. 创建或观察该节点的 review patch task。

### 预期结果

- review feedback 被正确接收
- 纯噪音反馈不会创建 patch work
- 可操作反馈会创建 patch work
- 当 review 阻塞时，node 状态同步变更

## 15. 场景 H：PR Review Decision 与 Merge

### 目标

验证 CodingCTO 自身的显式审批流和 merge request 流程。

### 步骤

1. 打开 `/console/projects/:projectId/prs/:prNodeId`。
2. 确认 review 页面展示：
   - PR metadata
   - merge readiness checklist
   - fix attempt signals
   - escalation summary
   - 当前 decision state
3. 对当前 head SHA 执行 approve。
4. 确认 decision status 变为 approved。
5. 请求 merge。
6. 若所有检查通过，确认 merge 成功。

### 预期结果

- review 页面能直接回答“现在能不能 merge”
- approval 绑定到当前 head SHA
- 未满足必需检查前，merge 按钮不可用或请求会失败
- merge request 能成功发送到 GitHub
- GitHub 接受 merge 后，CodingCTO 立即把 PR node 标成 merged

### 负向检查

确认以下情况 merge 会被拒绝：

- 缺少 approval
- approval 已过期
- merge 前刷新 CI 后发现 node 已 blocked
- head SHA 已变化

## 16. 场景 I：Hardening 与状态回收

### 目标

验证最终 hardening 切片覆盖的生命周期边界情况。

### I.1 新 commit 导致审批过期

1. 在 PR review 页面批准某个 head。
2. 向同一分支推送一个新 commit。
3. 刷新 review decision。

预期：

- decision 变为 `expired`
- 未重新批准前不能 merge

### I.2 Merge 前强制刷新 CI

1. 批准一个 PR。
2. 将 CI 状态变为 failing 或 blocked。
3. 从 CodingCTO 请求 merge。

预期：

- CodingCTO 会在 merge 前刷新 CI
- 如果 CI 不再满足条件，merge 请求被拒绝

### I.3 在 GitHub 外部手工 merge

1. 直接在 GitHub 上 merge 这个 PR。
2. 将 merge webhook 投递到本地 API。

预期：

- PR node 变为 `merged`
- 下游 dependency-satisfied 事件被触发
- 如果选定路径已完成，execution run 能收敛为 completed

### I.4 关闭但不合并的 PR

1. 在 GitHub 上关闭一个 PR，但不 merge。
2. 投递对应 webhook。

预期：

- PR node 变为 `closed`
- 被这个 closed dependency 阻塞的下游 task 被取消
- 如果选定路径不可再完成，run 变为 blocked

### I.5 Stale Runtime

1. 让 runtime heartbeat 过期。
2. 触发 stale runtime sweep。

预期：

- runtime 被标为 offline
- 该 runtime 上的 tasks 被失败化
- 必要时，对应 PR nodes 被标为 blocked

## 17. 自动化回归矩阵

在判断 MVP 稳定前，至少跑下面这组回归：

### API

```bash
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/project
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/githubintegration
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/planning
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/execution
cd /Users/mingde/item/codingcto/api && go test ./internal/modules/review
cd /Users/mingde/item/codingcto/api && go test ./database/migrations ./internal/starter
```

### Web

```bash
cd /Users/mingde/item/codingcto/web && pnpm type-check
cd /Users/mingde/item/codingcto/web && pnpm lint
cd /Users/mingde/item/codingcto/web && pnpm test --run src/features/project/project-readiness.test.ts
cd /Users/mingde/item/codingcto/web && pnpm test --run src/features/review/review-adapter.test.ts
```

### 可选 Browser Smoke

- 创建项目
- 打开 context 页面
- 打开 plan review 页面
- 打开 PR review 页面

## 18. 通过标准

只有当下面这些条件都成立，才算 MVP 测试通过：

1. 一个全新项目可以仅通过 UI 进入 execution-ready 状态。
2. 一个 requirement 能生成 plan，并成功编译 prompt。
3. 一个 runtime 能启动并 dispatch 工作。
4. 至少一个 PR 能被自动创建。
5. CI 和 review feedback 能正确回流进 CodingCTO。
6. 一个 PR 能从 CodingCTO 内批准并 merge。
7. 在 GitHub 外部手工 merge 也能被系统正确回收同步。
8. stale runtime 和 closed PR 这些边界情况不会把 run 留在不一致状态。

## 19. 失败记录格式

当某个场景失败时，至少记录：

- branch name
- commit SHA
- route 或 endpoint
- 失败发生的步骤编号
- 预期结果
- 实际结果
- 截图
- API / server logs
- 如适用，对应 GitHub PR URL

建议用下面这个模板：

```text
场景：
步骤：
输入：
预期：
实际：
日志：
附件：
```

## 20. 实际执行建议

- 先跑一轮纯 happy path，再开始做失败场景。
- 第一次端到端验收尽量选一个小仓库。
- 最好保留一条“绿色 PR”路径和一条“失败 PR”路径，避免 CI 和 merge 场景相互干扰。
- 只要涉及 `webhook`、`review`、`execution`、`githubintegration` 这些模块的改动，都要重跑 review + merge 场景。
