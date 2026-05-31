import type { ExecutorRuntime, PlanBundle } from '@/features/specforge/types';

export const defaultIdea =
  '添加团队邀请流程。工作区管理员可以通过邮箱邀请成员，受邀用户通过安全链接接受邀请。';

export const demoRuntimeNow = Date.parse('2026-05-29T12:00:00.000Z');

export const demoRuntimes: ExecutorRuntime[] = [
  {
    runtimeId: 'runtime_local_codex',
    executor: 'codex_cli',
    status: 'online',
    hostname: 'local-runner',
    version: '0.1.0',
    availableClis: [
      { name: 'Codex CLI', command: 'codex', version: 'codex 1.0.0', available: true },
    ],
    sandbox: {
      provider: 'codex_cli',
      mode: 'workspace-write',
      networkAccess: true,
      writable: true,
      approvalPolicy: 'never',
    },
    skillRoots: [{ provider: 'codex', path: '~/.codex/skills', writable: true }],
    localSkillCount: 2,
    lastSeenAt: new Date(demoRuntimeNow - 60_000).toISOString(),
  },
  {
    runtimeId: 'runtime_cloud_codex',
    executor: 'codex_cloud',
    status: 'offline',
    hostname: 'cloud-runner',
    version: '0.1.0',
    availableClis: [],
    skillRoots: [],
    localSkillCount: 0,
    lastSeenAt: new Date(demoRuntimeNow - 2 * 60_000).toISOString(),
  },
];

export const demoPlan: PlanBundle = {
  idea: defaultIdea,
  repoProfile: {
    repositoryId: 'repo_123',
    defaultBranch: 'main',
    stack: ['Go', 'Gin', 'GORM', 'Next.js', 'TypeScript', 'Tailwind'],
    testCommands: ['go test ./...', 'go vet ./...', 'pnpm type-check', 'pnpm lint'],
    ciProvider: 'GitHub Actions',
    codingConventions: [
      'API 模块保持 service 和 repository 分层。',
      'Web 代码按 feature-first 目录组织。',
      '认证、迁移和运行器状态属于高风险改动。',
    ],
    riskAreas: ['认证', '数据库迁移', '运行器隔离'],
    summary:
      'CodingCTO 分为 Go API 和 Next.js Web 两部分。规划时应保持契约清晰，避免两个部分共享运行时代码。',
    source: 'demo',
    warnings: [],
    lastIndexedAt: new Date(demoRuntimeNow - 5 * 60_000).toISOString(),
  },
  productSpec: {
    goals: [
      '把功能想法转成产品计划、技术计划和可评审的 PR DAG。',
      '自主执行开始前保留一次人工审批检查点。',
      '围绕交付产物展示执行状态，而不是围绕智能体管理展示。',
    ],
    businessRules: [
      '计划必须审批后才能开始执行。',
      '每个 PR 节点必须声明范围、非目标、验收标准和测试。',
      'MVP 执行限定在一个仓库内，最多五个 PR 节点。',
    ],
    permissionRules: [
      '已认证的工作区成员可以创建需求。',
      '只有授权的工作区用户可以审批计划并启动运行。',
    ],
    acceptanceCriteria: [
      '计划评审页展示产品理解、默认决策、技术计划、PR DAG 和风险说明。',
      '用户可以审批一次计划并启动执行运行。',
      '运行视图展示排队中、执行中、等待中和已完成的 PR 节点任务。',
    ],
    assumptions: [
      '生成计划前仓库画像已经完成索引。',
      '执行器和 GitHub 操作都接在执行编排器边界之后。',
    ],
  },
  implementationPlan: {
    technicalSummary:
      '围绕需求录入、计划评审、PR DAG 检查和执行交付状态，搭建第一版 CodingCTO 工作台。',
    affectedAreas: [
      'web/src/features/specforge',
      'web/src/app/(protected)/(console)/console/specforge',
    ],
    securityRisks: [
      '不要展示未来仓库上下文里的原始密钥。',
      '执行控制必须保留在需要认证的控制台路由之后。',
    ],
    migrationRisks: ['这个 Web 切片不涉及数据库迁移。'],
    status: 'draft',
  },
  prDagReview: [
    'PR DAG 审核：5 个可评审 PR 节点校验通过；依赖都能在生成的计划内解析。',
  ],
  prNodes: [
    {
      id: 'prnode_001',
      nodeKey: 'PR-001',
      order: 1,
      title: '添加工作区邀请数据模型',
      type: 'foundation',
      goal: '创建邀请模型、令牌哈希字段和迁移边界。',
      dependsOn: [],
      estimatedRisk: 'medium',
      expectedFiles: ['api/internal/modules/workspace', 'api/database/migrations'],
      nonGoals: ['不构建 UI。', '不发送邮件。'],
      acceptanceCriteria: [
        '邀请模型已存在。',
        'Token 以哈希形式存储。',
        '迁移可正常应用。',
      ],
      testCommands: ['go test ./...', 'go vet ./...'],
      branchName: 'specforge/team-invite-01-model',
      status: 'planned',
    },
    {
      id: 'prnode_002',
      nodeKey: 'PR-002',
      order: 2,
      title: '添加邀请创建和撤销 API',
      type: 'api',
      goal: '提供工作区管理员创建和撤销邀请的 API。',
      dependsOn: ['PR-001'],
      estimatedRisk: 'medium',
      expectedFiles: ['api/internal/modules/invitation'],
      nonGoals: ['不构建前端 UI。', '不处理邀请令牌接受流程。'],
      acceptanceCriteria: [
        '管理员可以创建邀请。',
        '普通成员会收到 403。',
        '已撤销邀请不能被接受。',
      ],
      testCommands: ['go test ./...'],
      branchName: 'specforge/team-invite-02-api',
      status: 'planned',
    },
    {
      id: 'prnode_003',
      nodeKey: 'PR-003',
      order: 3,
      title: '添加管理员邀请 UI',
      type: 'ui',
      goal: '在成员设置里添加发送和撤销邀请的 UI。',
      dependsOn: ['PR-002'],
      estimatedRisk: 'low',
      expectedFiles: ['web/src/features/workspace'],
      nonGoals: ['不修改计费。', '不添加审计日志。'],
      acceptanceCriteria: [
        '管理员可以提交邀请。',
        '待处理邀请可以展示。',
        '撤销操作会更新状态。',
      ],
      testCommands: ['pnpm type-check', 'pnpm lint'],
      branchName: 'specforge/team-invite-03-ui',
      status: 'planned',
    },
    {
      id: 'prnode_004',
      nodeKey: 'PR-004',
      order: 4,
      title: '添加集成测试',
      type: 'verification',
      goal: '用聚焦测试覆盖邀请创建和 UI 工作流。',
      dependsOn: ['PR-002', 'PR-003'],
      estimatedRisk: 'low',
      expectedFiles: ['api/tests', 'web/src/test'],
      nonGoals: ['不重构无关测试工具。'],
      acceptanceCriteria: ['核心邀请流程已覆盖。', 'CI 命令通过。'],
      testCommands: ['go test ./...', 'pnpm test'],
      branchName: 'specforge/team-invite-04-tests',
      status: 'planned',
    },
  ],
};
