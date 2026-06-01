const messages = {
  nav: {
    home: '首页',
    console: '控制台',
  },
  footer: {
    tagline: 'PRD 到 PR 自动化',
    rights: '保留所有权利。',
  },
  hero: {
    eyebrow: 'GitHub 原生 PRD 到 PR 自动化',
    titlePrefix: '把产品想法变成',
    titleHighlight: '可评审的 Pull Request',
    description:
      'CodingCTO 会分析仓库、生成计划和 PR DAG、编译有边界的提示词，并推动产出可评审的 GitHub Pull Request。',
    getStarted: '开始使用',
    viewDemo: '查看演示',
  },
  features: {
    title: '你需要的一切',
    description: '一个聚焦规划、执行、验证和评审的产品工程工作流。',
    items: {
      auth: {
        title: '身份与工作区',
        description: '用工作区承载项目、仓库和执行流程的访问边界。',
      },
      console: {
        title: '交付控制台',
        description: '统一管理项目、计划、执行运行和 Pull Request。',
      },
      context: {
        title: '仓库上下文',
        description: '注入仓库画像、技能说明和有证据支撑的 prompt 输入。',
      },
      review: {
        title: '评审闭环',
        description: '限制 CI 修复尝试、生成升级摘要，并支持人工评审循环。',
      },
    },
  },
  stack: {
    title: '现代技术栈',
    description: '基于最新技术构建，带来更顺畅的开发体验。',
  },
  cta: {
    title: '准备开始构建？',
    description: '描述一个功能、审阅计划，然后让 CodingCTO 准备 Pull Request。',
    getStarted: '免费开始',
    viewGitHub: '查看 GitHub',
  },
};

export default messages;

export type SiteMessages = typeof messages;
