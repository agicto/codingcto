import type { SiteMessages } from './zh-Hans';

const messages: SiteMessages = {
  nav: {
    home: 'Home',
    console: 'Console',
  },
  footer: {
    tagline: 'PRD-to-PR Automation',
    rights: 'All rights reserved.',
  },
  hero: {
    eyebrow: 'GitHub-native PRD-to-PR Automation',
    titlePrefix: 'Turn Product Ideas',
    titleHighlight: 'into Pull Requests',
    description:
      'CodingCTO analyzes repositories, generates plans and PR DAGs, compiles scoped prompts, and drives review-ready GitHub pull requests.',
    getStarted: 'Get Started',
    viewDemo: 'View Demo',
  },
  features: {
    title: 'Everything You Need',
    description:
      'A focused product-engineering workflow for planning, execution, verification, and review.',
    items: {
      auth: {
        title: 'Authentication',
        description: 'Workspace access for project, repository, and execution workflows.',
      },
      console: {
        title: 'Admin Console',
        description: 'A delivery console for projects, plans, execution runs, and pull requests.',
      },
      context: {
        title: 'Repository Context',
        description: 'Repository context, skill instructions, and evidence-backed prompt inputs.',
      },
      review: {
        title: 'Review Loops',
        description: 'Bounded CI repair attempts, escalation summaries, and review loops.',
      },
    },
  },
  stack: {
    title: 'Modern Tech Stack',
    description: 'Built with the latest technologies for optimal developer experience.',
  },
  cta: {
    title: 'Ready to Build?',
    description: 'Describe a feature, review the plan, and let CodingCTO prepare the pull requests.',
    getStarted: 'Get Started Free',
    viewGitHub: 'View on GitHub',
  },
};

export default messages;
