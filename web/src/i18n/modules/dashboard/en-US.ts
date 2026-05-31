// Dashboard translations - English (US)
import type { DashboardMessages } from './zh-Hans';

const messages: DashboardMessages = {
  welcome: 'Welcome back',
  welcomeDescription: "Here's an overview of your AI-powered workflows and integrations",
  newWorkflow: 'New Workflow',
  stats: {
    activeWorkflows: 'Active Workflows',
    apiCalls: 'API Calls Today',
    successRate: 'Success Rate',
    responseTime: 'Avg. Response Time',
    vsLastMonth: 'vs last month',
    last24Hours: 'Last 24 hours',
    withinSla: 'Within SLA',
    pendingApproval: '{count} pending approval',
    avgPerHour: 'Avg. {count} per hour',
  },
  charts: {
    apiCallsTitle: 'API Calls This Week',
    responseTimeTitle: 'Response Time Trend',
    ms: 'ms',
  },
  activity: {
    title: 'System Activity',
    viewAll: 'View All',
  },
  workflows: {
    title: 'Active Workflows',
    id: 'ID',
    name: 'Name',
    status: 'Status',
    calls: 'API Calls',
    success: 'Success Rate',
  },
  actions: {
    title: 'Quick Actions',
    createWorkflow: 'Create Workflow',
    createWorkflowDesc: 'Build a new AI pipeline',
    manageUsers: 'Manage Users',
    manageUsersDesc: 'Team member permissions',
    settings: 'Settings',
    settingsDesc: 'Configure your console',
  },
  sidebar: {
    quick: {
      newRequirement: 'New requirement',
    },
    groups: {
      deliver: 'Deliver',
      review: 'Review',
      platform: 'Platform',
    },
    badges: {
      live: 'Live',
      soon: 'Soon',
    },
    items: {
      delivery: {
        title: 'Delivery Board',
        description: 'Requirement intake, plans, PR DAGs, and runs.',
      },
      projects: {
        title: 'Projects',
        description: 'Project boundaries and repository bindings.',
      },
      review: {
        title: 'Review Queue',
        description: 'Plan approvals, failed CI, and human review actions will appear here.',
      },
      github: {
        title: 'GitHub setup',
        description: 'Install the GitHub App, sync repositories, and bind them to projects.',
      },
    },
    footer: 'GitHub integration settings',
    workspace: {
      title: 'Organization workspace',
      description:
        'Switch the enterprise boundary used by settings, GitHub binding, projects, and CodingCTO delivery.',
      loading: 'Loading...',
      createWorkspace: 'Create workspace',
      current: 'Current',
      empty: 'No workspace yet. Create one below.',
      newWorkspace: 'New workspace',
      name: 'Name',
      slug: 'Slug',
      descriptionPlaceholder: 'Who owns this workspace?',
      creating: 'Creating',
      createAndSwitch: 'Create and switch',
      required: 'Workspace name and slug are required.',
      created: 'Created {name}.',
      createFailed: 'Workspace could not be created. Try another slug or check backend auth.',
    },
  },
  console: {
    eyebrow: 'Enterprise delivery workspace',
    title: 'What needs attention today',
    description:
      'Start from projects, GitHub binding, and the CodingCTO delivery board. This home page now keeps only real business entry points.',
    openDelivery: 'Open delivery board',
    openProjects: 'View projects',
    cards: {
      projects: {
        title: 'Projects and repositories',
        description:
          'Create workspaces and projects, then bind GitHub repositories as primary, dependency, docs, or infra context.',
        action: 'Manage projects',
      },
      delivery: {
        title: 'CodingCTO delivery',
        description:
          'Turn requirements into plans, PR DAGs, execution tasks, and reviewable GitHub pull requests.',
        action: 'Open delivery board',
      },
      github: {
        title: 'GitHub setup',
        description:
          'Install the GitHub App, sync accessible repositories, and bind them to projects.',
        action: 'Configure GitHub',
      },
      review: {
        title: 'Review Queue',
        description:
          'Plan approvals, failed CI, human review, and blockers will be collected here.',
        action: 'Coming soon',
      },
    },
    focusTitle: 'Recommended workflow',
    focusSteps: {
      workspace: 'Create or select a workspace.',
      project: 'Create a project and bind one primary repository.',
      context: 'Complete repo profiles, architecture snapshots, and skills.',
      delivery: 'Write requirements, approve plans, and execute from the project delivery board.',
    },
  },
  deliveryEntry: {
    eyebrow: 'CodingCTO delivery',
    title: 'Start from a project, not a blank prompt',
    description:
      'Enterprise execution needs a workspace, project, GitHub repositories, repo context, and scope guardrails. The global delivery page is now an entry point; real execution should happen inside a project delivery board.',
    primaryAction: 'Open projects',
    githubAction: 'Configure GitHub',
    cards: {
      project: {
        title: 'Project delivery board',
        description:
          'Recommended entry. The project board loads bound repo profiles, architecture snapshots, skills, and guardrails automatically.',
      },
      github: {
        title: 'GitHub binding',
        description:
          'Install the GitHub App, sync repositories, then bind repos as primary, dependency, docs, or infra.',
      },
      review: {
        title: 'Review Queue',
        description:
          'Plan approvals, failed CI, human review, and blockers will be collected here next.',
      },
    },
  },
  projectsConsole: {
    eyebrow: 'Project console',
    title: 'Set up a delivery project',
    description:
      'Create one workspace, one project, and one primary GitHub repository before starting CodingCTO delivery.',
    badges: {
      enterprise: 'Enterprise workspace',
      apiUnavailable: 'API unavailable',
      liveApi: 'Live API',
    },
    actions: {
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      creating: 'Creating',
      newWorkspace: 'New workspace',
      newProject: 'New project',
      createWorkspace: 'Create workspace',
      createProject: 'Create project',
      openProject: 'Open project',
      openCodingCTO: 'Open CodingCTO',
      configureGitHub: 'Configure GitHub',
      signInBackend: 'Sign in with backend',
    },
    metrics: {
      workspaces: {
        label: 'Workspaces',
        caption: 'Enterprise boundary',
      },
      projects: {
        label: 'Projects',
        caption: 'Selected workspace',
      },
      workspace: {
        label: 'Current',
        caption: 'Select a workspace',
        empty: 'Not selected',
      },
      api: {
        label: 'Backend',
        caption: 'Real data source',
      },
    },
    fields: {
      name: 'Name',
      slug: 'Slug',
      description: 'Description',
    },
    workspace: {
      title: 'Current workspace',
      description:
        'The workspace is the shared boundary for organization, permissions, GitHub binding, and CodingCTO execution.',
      selectPlaceholder: 'Select workspace',
      empty: 'No workspace yet. Create one to unlock project and CodingCTO flows.',
      selected: 'Workspace: {name}',
      noDescription: 'No workspace description yet.',
      id: 'ID: {id}',
    },
    backendGate: {
      title: 'Backend session required',
      description:
        'Project, repository, and execution data come from the CodingCTO API. Your current browser session is signed in to the console but does not include a backend API token, so workspace data cannot be trusted.',
      localHint:
        'For local development, enable backend-backed login with LUAS_AUTH_BACKEND_ENABLED=true and sign in with a seeded backend user.',
      emptyTitle: 'Workspace data is unavailable',
      emptyDescription:
        'This is an authentication or API connectivity problem, not an empty workspace. Reconnect the backend session before creating projects.',
    },
    projects: {
      title: 'Delivery projects',
      description:
        'Each project should bind a primary repository and become context for planning, execution, and review.',
      count: '{count} projects',
      loading: 'Loading projects from the selected workspace...',
      emptyForWorkspace:
        'No projects in this workspace yet. Create one to start repository binding.',
      selectWorkspace: 'Select or create a workspace to list projects.',
      emptyDescription:
        'After creating a project, open the CodingCTO delivery board to bind GitHub repositories and generate an execution plan.',
      noDescription: 'No description yet.',
      primaryRepoRequired: 'Review repo context',
      status: {
        active: 'Active',
        inactive: 'Inactive',
      },
    },
    newWorkspace: {
      title: 'New workspace',
      description:
        'A workspace represents an organization or business unit. Projects, repositories, and permissions belong here.',
      descriptionPlaceholder: 'Who owns this product portfolio?',
    },
    newProject: {
      title: 'New project',
      description:
        'Define the product or system boundary first, then open the project delivery board to bind GitHub repositories.',
      descriptionPlaceholder: 'What product or system does this project represent?',
    },
    setup: {
      title: 'Setup path',
      description: 'Finish the setup in order. Each step unlocks the next action.',
      nextAction: 'Next action',
      actions: {
        backend: 'Reconnect the backend session',
        workspace: 'Create the first workspace',
        project: 'Create a delivery project',
        github: 'Open project delivery',
      },
      steps: {
        workspace: {
          title: 'Workspace',
          description: 'Organization boundary for permissions, repositories, and execution.',
        },
        project: {
          title: 'Project',
          description: 'Product or system boundary that CodingCTO will plan against.',
        },
        github: {
          title: 'GitHub repository',
          description: 'Bind the writable primary repository, then generate plans and PRs.',
        },
      },
    },
    messages: {
      workspaceRequired: 'Workspace name and slug are required.',
      workspaceCreateFailed:
        'Workspace could not be created. Check the API connection and slug uniqueness.',
      selectWorkspaceFirst: 'Create or select a workspace before creating a project.',
      projectRequired: 'Project name and slug are required.',
      projectCreateFailed:
        'Project could not be created. Check the API connection and slug uniqueness.',
    },
  },
  projectDelivery: {
    states: {
      invalidProject: {
        title: 'Invalid project',
        description:
          'Open CodingCTO from a real project so repo context, permissions, and execution scope are available.',
      },
      loading: {
        title: 'Loading project context',
        description:
          'Fetching workspace, repository bindings, skills, and architecture readiness before enabling CodingCTO.',
      },
      unavailable: {
        title: 'Project context unavailable',
        description:
          'CodingCTO cannot start from an empty context here. Refresh the project, check backend auth, or create the project again from the Projects page.',
        action: 'Back to projects',
      },
    },
    primaryRequired: {
      title: 'Bind a primary repository to start planning',
      description:
        'CodingCTO can read dependency, docs, and infra repositories as context, but execution only writes to the active primary repository.',
    },
    bindPanel: {
      title: 'Bind GitHub repository',
      description:
        'Select a repository already connected in Settings > GitHub. Primary repositories are writable; dependency, docs, and infra repositories become read-only planning context.',
      repositoryId: 'GitHub repository',
      selectRepository: 'Select connected repository',
      loadingRepositories: 'Loading connected repositories...',
      emptyRepositories: 'No connected repositories exist in this workspace yet.',
      allRepositoriesBound:
        'Every connected GitHub repository in this workspace is already bound to this project.',
      connectRepository: 'Connect GitHub',
      role: 'Role',
      binding: 'Binding',
      submit: 'Bind repository',
      roles: {
        primary: 'Primary',
        dependency: 'Dependency',
        docs: 'Docs',
        infra: 'Infra',
      },
      messages: {
        repositoryRequired:
          'Repository ID is required. Connect a GitHub repository in Settings > GitHub first.',
        bound: '{role} repository {repoId} bound.',
        bindFailed:
          'Repository could not be bound. Confirm it was connected in Settings and belongs to this workspace.',
      },
    },
    readiness: {
      projectScoped: 'Project scoped',
      primaryReady: 'Primary ready',
      primaryRequired: 'Primary repo required',
      projectContext: 'Project context',
      nextAction: 'Next action',
      metrics: {
        repos: 'Repos',
        readOnly: 'Read-only',
        skills: 'Skills',
        warnings: 'Warnings',
      },
      contract: {
        title: 'Context contract',
        execution: 'Execution repo',
        skills: 'Active skills',
        missingEvidence: 'Missing evidence',
      },
      roles: {
        primary: 'Primary',
        dependency: 'Dependency',
        docs: 'Docs',
        infra: 'Infra',
      },
      repository: {
        noProfile: 'No profile yet.',
        active: 'active',
        inactive: 'inactive',
        testCommands: '{count} test commands',
        skills: '{count} skills',
        modules: '{count} modules',
        ciWorkflows: '{count} CI workflows',
        architecture: 'Architecture snapshot',
        stale: 'stale',
        fresh: 'fresh',
        missing: 'missing',
        generateSnapshot: 'Generate a snapshot before approving execution.',
        remove: 'Remove',
        removing: 'Removing',
        removed: 'Repository {repoId} was removed from the project context.',
        removeFailed: 'Repository could not be removed. Refresh and try again.',
        primaryRemoveBlocked:
          'The primary repository cannot be removed directly. Bind another primary repo or adjust the execution boundary first.',
      },
    },
  },
};

export default messages;
