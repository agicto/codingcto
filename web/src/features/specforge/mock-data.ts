import type { ExecutorRuntime, PlanBundle } from "@/features/specforge/types";

export const defaultIdea =
  "新增团队邀请流程。工作区管理员可以通过邮箱邀请成员，受邀用户通过安全链接接受邀请。";

export const demoRuntimeNow = Date.parse("2026-05-29T12:00:00.000Z");

export const demoRuntimes: ExecutorRuntime[] = [
  {
    runtimeId: "runtime_local_codex",
    executor: "codex_cli",
    status: "online",
    hostname: "local-runner",
    version: "0.1.0",
    lastSeenAt: new Date(demoRuntimeNow - 60_000).toISOString(),
  },
  {
    runtimeId: "runtime_cloud_codex",
    executor: "codex_cloud",
    status: "offline",
    hostname: "cloud-runner",
    version: "0.1.0",
    lastSeenAt: new Date(demoRuntimeNow - 2 * 60_000).toISOString(),
  },
];

export const demoPlan: PlanBundle = {
  idea: defaultIdea,
  repoProfile: {
    repositoryId: "repo_123",
    defaultBranch: "main",
    stack: ["Go", "Gin", "GORM", "Next.js", "TypeScript", "Tailwind"],
    testCommands: ["go test ./...", "go vet ./...", "pnpm type-check", "pnpm lint"],
    ciProvider: "GitHub Actions",
    codingConventions: [
      "API 模块保持在 service 和 repository 边界之后。",
      "Web 代码按 feature-first 目录组织。",
      "认证、迁移和执行器状态变更都按高风险处理。",
    ],
    riskAreas: ["认证", "数据库迁移", "执行器隔离"],
    summary:
      "CodingCTO 分为 Go API 和 Next.js Web 应用两部分。SpecForge 工作应保持契约显式，避免在两端共享运行时代码。",
    source: "demo",
    warnings: [],
    lastIndexedAt: new Date(demoRuntimeNow - 5 * 60_000).toISOString(),
  },
  productSpec: {
    goals: [
      "将功能想法转成产品方案、技术方案和可评审的 PR DAG。",
      "在自动执行开始前保留一次审批检查点。",
      "围绕交付产物展示执行状态，而不是暴露执行器管理细节。",
    ],
    businessRules: [
      "方案必须审批后才能开始执行。",
      "每个 PR 节点必须声明范围、非目标、验收标准和测试。",
      "MVP 执行限制在一个仓库内，最多五个 PR 节点。",
    ],
    permissionRules: [
      "已认证的工作区成员可以创建想法。",
      "只有授权工作区用户可以审批方案并启动执行。",
    ],
    acceptanceCriteria: [
      "方案评审页展示产品理解、默认策略、技术方案、PR DAG 和风险说明。",
      "用户可以审批一次方案并启动执行任务。",
      "执行视图展示排队、运行、等待和已完成的 PR 节点任务。",
    ],
    assumptions: [
      "生成方案前仓库画像已经完成索引。",
      "执行器和 GitHub 操作位于执行编排边界之后。",
    ],
  },
  implementationPlan: {
    technicalSummary:
      "围绕需求录入、方案评审、PR DAG 检查和交付状态，新增第一版 SpecForge 工作台界面。",
    affectedAreas: ["web/src/features/specforge", "web/src/app/(protected)/(console)/console/specforge"],
    securityRisks: [
      "不要展示未来仓库上下文中的原始密钥。",
      "执行控制必须保留在已认证的控制台路由之后。",
    ],
    migrationRisks: ["这个 Web 切片不涉及数据库迁移。"],
    status: "draft",
  },
  prDagReview: [
    "PR DAG 审核：校验通过，5 个可评审 PR 节点的依赖都能在生成方案内闭合。",
  ],
  prNodes: [
    {
      id: "prnode_001",
      nodeKey: "PR-001",
      order: 1,
      title: "新增工作区邀请数据模型",
      type: "foundation",
      goal: "创建邀请模型、令牌哈希字段和迁移边界。",
      dependsOn: [],
      estimatedRisk: "medium",
      expectedFiles: ["api/internal/modules/workspace", "api/database/migrations"],
      nonGoals: ["不构建 UI。", "不发送邮件。"],
      acceptanceCriteria: ["邀请模型已存在。", "令牌以哈希形式存储。", "迁移可以执行。"],
      testCommands: ["go test ./...", "go vet ./..."],
      branchName: "specforge/team-invite-01-model",
      status: "planned",
    },
    {
      id: "prnode_002",
      nodeKey: "PR-002",
      order: 2,
      title: "新增邀请创建和撤销 API",
      type: "api",
      goal: "提供工作区管理员用于创建和撤销邀请的 API。",
      dependsOn: ["PR-001"],
      estimatedRisk: "medium",
      expectedFiles: ["api/internal/modules/invitation"],
      nonGoals: ["不构建前端 UI。", "不处理邀请令牌接受流程。"],
      acceptanceCriteria: ["管理员可以创建邀请。", "普通成员收到 403。", "已撤销邀请不可接受。"],
      testCommands: ["go test ./..."],
      branchName: "specforge/team-invite-02-api",
      status: "planned",
    },
    {
      id: "prnode_003",
      nodeKey: "PR-003",
      order: 3,
      title: "新增管理员邀请 UI",
      type: "ui",
      goal: "在成员设置中加入发送和撤销邀请的界面。",
      dependsOn: ["PR-002"],
      estimatedRisk: "low",
      expectedFiles: ["web/src/features/workspace"],
      nonGoals: ["不修改计费。", "不新增审计日志。"],
      acceptanceCriteria: ["管理员可以提交邀请。", "待处理邀请可展示。", "撤销操作会更新状态。"],
      testCommands: ["pnpm type-check", "pnpm lint"],
      branchName: "specforge/team-invite-03-ui",
      status: "planned",
    },
    {
      id: "prnode_004",
      nodeKey: "PR-004",
      order: 4,
      title: "新增集成测试",
      type: "verification",
      goal: "通过聚焦测试覆盖邀请创建和 UI 流程。",
      dependsOn: ["PR-002", "PR-003"],
      estimatedRisk: "low",
      expectedFiles: ["api/tests", "web/src/test"],
      nonGoals: ["不重构无关测试辅助函数。"],
      acceptanceCriteria: ["核心邀请流程有测试覆盖。", "CI 命令通过。"],
      testCommands: ["go test ./...", "pnpm test"],
      branchName: "specforge/team-invite-04-tests",
      status: "planned",
    },
  ],
};
