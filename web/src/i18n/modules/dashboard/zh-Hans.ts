// Dashboard translations - Simplified Chinese
const messages = {
  welcome: '欢迎回来',
  welcomeDescription: '这里是您的 AI 工作流和集成概览',
  newWorkflow: '新工作流',
  stats: {
    activeWorkflows: '活跃工作流',
    apiCalls: '今日 API 调用',
    successRate: '成功率',
    responseTime: '平均响应时间',
    vsLastMonth: '较上月',
    last24Hours: '最近 24 小时',
    withinSla: '符合 SLA',
    pendingApproval: '{count} 个待审批',
    avgPerHour: '平均每小时 {count} 次',
  },
  charts: {
    apiCallsTitle: '本周 API 调用',
    responseTimeTitle: '典型响应时间趋势',
    ms: '毫秒',
  },
  activity: {
    title: '系统活动',
    viewAll: '查看全部',
  },
  workflows: {
    title: '活跃工作流',
    id: 'ID',
    name: '名称',
    status: '状态',
    calls: 'API 调用',
    success: '成功率',
  },
  actions: {
    title: '快捷操作',
    createWorkflow: '创建工作流',
    createWorkflowDesc: '构建新的 AI 管道',
    manageUsers: '管理用户',
    manageUsersDesc: '团队成员权限',
    settings: '设置',
    settingsDesc: '配置您的控制台',
  },
  sidebar: {
    quick: {
      newRequirement: '新建需求',
    },
    groups: {
      deliver: '交付',
      review: 'Review',
      platform: '平台',
    },
    badges: {
      live: '可用',
      soon: '即将上线',
    },
    items: {
      delivery: {
        title: '交付板',
        description: '需求录入、计划、PR DAG 和执行记录。',
      },
      projects: {
        title: '项目',
        description: '项目边界和仓库绑定。',
      },
      review: {
        title: 'Review Queue',
        description: '计划审批、失败 CI 和人工 review 会汇总到这里。',
      },
      github: {
        title: 'GitHub 设置',
        description: '安装 GitHub App、同步仓库并绑定到项目。',
      },
    },
    footer: 'GitHub 集成设置',
    workspace: {
      title: '组织 workspace',
      description: '切换设置、GitHub 绑定、项目和 CodingCTO 交付使用的企业边界。',
      loading: '加载中...',
      createWorkspace: '创建 workspace',
      current: '当前',
      empty: '暂无 workspace。请先在下方创建。',
      newWorkspace: '新建 workspace',
      name: '名称',
      slug: 'Slug',
      descriptionPlaceholder: '这个 workspace 由谁负责？',
      creating: '创建中',
      createAndSwitch: '创建并切换',
      required: '请填写 workspace 名称和 slug。',
      created: '已创建 {name}。',
      createFailed: 'workspace 创建失败。请换一个 slug，或检查后端登录状态。',
    },
  },
  console: {
    eyebrow: '企业交付工作台',
    title: '今天需要关注什么',
    description: '从这里进入项目、GitHub 绑定和 CodingCTO 交付板。首页只保留真实业务入口，不再展示开发脚手架。',
    openDelivery: '打开交付板',
    openProjects: '查看项目',
    cards: {
      projects: {
        title: '项目与仓库',
        description: '创建 workspace 和 project，把 GitHub repo 绑定成 primary、dependency、docs 或 infra。',
        action: '管理项目',
      },
      delivery: {
        title: 'CodingCTO 交付',
        description: '把需求转成计划、PR DAG、执行任务和可 review 的 GitHub PR。',
        action: '进入交付板',
      },
      github: {
        title: 'GitHub 设置',
        description: '安装 GitHub App，同步可访问仓库，并绑定到项目。',
        action: '配置 GitHub',
      },
      review: {
        title: 'Review Queue',
        description: '待审批计划、失败 CI、人工 review 和阻塞项将汇总到这里。',
        action: '即将上线',
      },
    },
    focusTitle: '推荐工作流',
    focusSteps: {
      workspace: '先创建或选择 workspace。',
      project: '创建 project，并绑定一个 primary repo。',
      context: '补齐 repo profile、architecture snapshot 和 skills。',
      delivery: '在项目交付板里写需求、审批计划并执行。',
    },
  },
  deliveryEntry: {
    eyebrow: 'CodingCTO 交付',
    title: '从项目开始，而不是从空白 prompt 开始',
    description: '企业级执行需要 workspace、项目、GitHub repo、repo context 和权限边界。全局交付页只做入口，真实执行请进入项目交付板。',
    primaryAction: '打开项目',
    githubAction: '配置 GitHub',
    cards: {
      project: {
        title: '项目交付板',
        description: '推荐入口。项目交付板会自动读取绑定 repo 的 profile、architecture、skills 和 guardrails。',
      },
      github: {
        title: 'GitHub 绑定',
        description: '先安装 GitHub App，同步仓库，再把 repo 绑定为 primary、dependency、docs 或 infra。',
      },
      review: {
        title: 'Review Queue',
        description: '计划审批、失败 CI、人工 review 和阻塞项会在后续集中到这里。',
      },
    },
  },
  projectsConsole: {
    title: '项目',
    description: '创建 workspace，把仓库按项目组织起来，然后基于真实后端记录运行 CodingCTO 计划、prompt 和 PR 执行。',
    badges: {
      enterprise: '企业 workspace',
      apiUnavailable: 'API 不可用',
      liveApi: 'Live API',
    },
    actions: {
      refresh: '刷新',
      refreshing: '刷新中',
      creating: '创建中',
      createWorkspace: '创建 workspace',
      createProject: '创建项目',
      openCodingCTO: '打开 CodingCTO',
    },
    fields: {
      name: '名称',
      slug: 'Slug',
      description: '描述',
    },
    workspace: {
      title: 'Workspace',
      description: '选择拥有这些项目的企业边界。',
      selectPlaceholder: '选择 workspace',
      empty: '暂无 workspace。创建后才能解锁项目和 CodingCTO 流程。',
      noDescription: '暂无 workspace 描述。',
      id: 'ID: {id}',
    },
    projects: {
      loading: '正在从所选 workspace 加载项目...',
      emptyForWorkspace: '当前 workspace 暂无项目。创建项目后即可开始绑定仓库。',
      selectWorkspace: '请选择或创建 workspace 以列出项目。',
      noDescription: '暂无描述。',
      primaryRepoRequired: '需要 primary repo',
    },
    newWorkspace: {
      title: '新建 workspace',
      description: '先创建真实企业容器，再创建项目并绑定 GitHub。',
      descriptionPlaceholder: '这个产品组合由谁负责？',
    },
    newProject: {
      title: '新建项目',
      description: '先定义产品边界，下一步再绑定仓库。',
      descriptionPlaceholder: '这个项目代表哪个产品或系统？',
    },
    messages: {
      workspaceRequired: '请填写 workspace 名称和 slug。',
      workspaceCreateFailed: 'workspace 创建失败。请检查 API 连接和 slug 是否唯一。',
      selectWorkspaceFirst: '请先创建或选择 workspace，再创建项目。',
      projectRequired: '请填写项目名称和 slug。',
      projectCreateFailed: '项目创建失败。请检查 API 连接和 slug 是否唯一。',
    },
  },
  projectDelivery: {
    states: {
      invalidProject: {
        title: '项目无效',
        description: '请从真实项目进入 CodingCTO，这样才能加载 repo context、权限边界和执行范围。',
      },
      loading: {
        title: '正在加载项目上下文',
        description: '正在获取 workspace、仓库绑定、skills 和架构就绪状态，然后再启用 CodingCTO。',
      },
      unavailable: {
        title: '项目上下文不可用',
        description: '这里不会再从空上下文启动 CodingCTO。请刷新项目、检查后端登录状态，或从项目页重新创建项目。',
        action: '返回项目',
      },
    },
    primaryRequired: {
      title: '先绑定 primary 仓库才能开始规划',
      description: 'CodingCTO 可以读取 dependency、docs 和 infra 仓库作为上下文，但执行写入只会发生在当前 primary 仓库。',
    },
    bindPanel: {
      title: '绑定 GitHub 仓库',
      description: '使用 Settings > GitHub 创建的 repository ID。Primary 仓库可写入；dependency、docs 和 infra 仓库会作为只读规划上下文。',
      repositoryId: 'Repository ID',
      role: '角色',
      binding: '绑定中',
      submit: '绑定仓库',
      roles: {
        primary: 'Primary',
        dependency: 'Dependency',
        docs: 'Docs',
        infra: 'Infra',
      },
      messages: {
        repositoryRequired: '请填写 repository ID。请先在 Settings > GitHub 连接 GitHub 仓库。',
        bound: '{role} 仓库 {repoId} 已绑定。',
        bindFailed: '仓库无法绑定。请确认它已经在 Settings 中连接，并且属于当前 workspace。',
      },
    },
    readiness: {
      projectScoped: '项目级',
      primaryReady: 'Primary 已就绪',
      primaryRequired: '需要 primary 仓库',
      projectContext: '项目上下文',
      nextAction: '下一步',
      metrics: {
        repos: '仓库',
        readOnly: '只读',
        skills: 'Skills',
        warnings: '警告',
      },
      roles: {
        primary: 'Primary',
        dependency: 'Dependency',
        docs: 'Docs',
        infra: 'Infra',
      },
      repository: {
        noProfile: '暂无 profile。',
        active: 'active',
        inactive: 'inactive',
        testCommands: '{count} 个测试命令',
        skills: '{count} 个 skills',
        modules: '{count} 个模块',
        ciWorkflows: '{count} 个 CI workflow',
        architecture: '架构快照',
        stale: '过期',
        fresh: '最新',
        missing: '缺失',
        generateSnapshot: '请先生成架构快照，再审批执行。',
      },
    },
  },
};

export default messages;

export type DashboardMessages = typeof messages;
