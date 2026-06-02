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
      codexReady: 'Codex ready',
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
      agents: {
        title: 'Agents',
        description: 'Inspect locally running agents and assign available skills.',
      },
      review: {
        title: 'Review Queue',
        description: 'Plan approvals, failed CI, and human review actions will appear here.',
      },
      github: {
        title: 'GitHub setup',
        description: 'Install the GitHub App, sync repositories, and bind them to projects.',
      },
      repositories: {
        title: 'Code repositories',
        description: 'Manage Git repository URLs linked to the current workspace.',
      },
      skills: {
        title: 'Skills',
        description: 'Manage reusable agent instructions for this workspace.',
      },
      settings: {
        title: 'Settings',
        description: 'Profile, preferences, and workspace configuration.',
      },
    },
    footer: 'Settings',
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
      nameInvalid: 'Workspace name must be at least 2 characters.',
      slugInvalid: 'Workspace slug must be at least 2 characters. Try a short slug such as coding or cto.',
      created: 'Created {name}.',
      createFailed: 'Workspace could not be created. Try another slug or check backend auth.',
    },
  },
  skills: {
    title: 'Skills',
    headerDescription: 'Instructions any agent in the workspace can use.',
    learnMore: 'Learn more →',
    actions: {
      new: 'New skill',
      cancel: 'Cancel',
      create: 'Create skill',
      creating: 'Creating',
      import: 'Import',
      importing: 'Importing',
      importToWorkspace: 'Import to workspace',
    },
    repository: {
      title: 'Skill storage repository',
      description: 'The current backend stores skills by repository; this page uses the selected workspace repository.',
      connect: 'Connect repository',
    },
    empty: {
      title: 'No skills yet',
      description: 'Create the first skill, import one from URL, or copy one from a connected runtime. Then every agent in the workspace can use it.',
      noRepository: 'Connect a GitHub repository before creating workspace skills.',
    },
    states: {
      loading: 'Loading...',
      noDescription: 'No description yet.',
    },
    badges: {
      active: 'active',
      inactive: 'inactive',
    },
    dialog: {
      title: 'New skill',
      description: 'Choose how to add a skill to the workspace.',
    },
    choose: {
      manual: {
        title: 'Manual create',
        description: 'Start from a blank SKILL.md and write the instructions yourself.',
      },
      url: {
        title: 'Import from URL',
        description: 'Pull a published skill from ClawHub or Skills.sh.',
      },
      runtime: {
        title: 'Copy from runtime',
        description: 'Promote a skill already installed in a local runtime.',
      },
    },
    manual: {
      title: 'Manual create',
      description: 'Start from a blank SKILL.md.',
      defaultContent: 'Write the instructions agents must follow when using this skill.',
    },
    fields: {
      name: 'Name',
      namePlaceholder: 'For example: review-helper',
      nameHint: 'Must be unique inside the workspace.',
      description: 'Description',
      descriptionPlaceholder: 'Say when this skill should be used.',
      content: 'SKILL.md',
      contentPlaceholder: 'Write the skill instructions. If empty, a basic SKILL.md will be generated from the name and description.',
      active: 'Enabled',
      activeHint: 'Enabled skills can be used by agent prompt orchestration.',
    },
    agents: {
      title: 'Assign to agents',
      description: 'Only selected agents receive this skill in their prompts.',
      required: 'Select at least one agent.',
      all: 'All agents',
      summary: '{first} +{count}',
      planning: {
        title: 'Planning agent',
        description: 'Requirement understanding, product plan, technical plan, and PR DAG.',
      },
      codex: {
        title: 'Codex CLI',
        description: 'Local runtime for implementation, fixes, commits, and PR delivery.',
      },
      review: {
        title: 'Review agent',
        description: 'Code review, review patches, and CI repair suggestions.',
      },
    },
    url: {
      title: 'Import from URL',
      description: 'Paste the URL for a published skill.',
      field: 'URL',
      namePlaceholder: 'Leave blank to infer from URL.',
      descriptionPlaceholder: 'Add a workspace description for this URL skill.',
      importedDescription: 'Skill imported from URL.',
      source: 'Source',
      note: 'This currently stores the source URL and metadata; full remote content fetch can replace it once wired.',
    },
    runtime: {
      title: 'Copy from runtime',
      description: 'Scan a local runtime and promote an on-disk skill into the workspace.',
      field: 'Runtime',
      none: 'No online runtime',
      unknown: 'unknown',
      provider: 'provider',
      noRuntime: 'No available runtime found.',
      unsupported: 'This provider does not support local skill listing yet.',
      note: 'Import ignores symlinks, unreadable files, large files, and oversized directories.',
    },
    messages: {
      saveFailed: 'Skill could not be saved. Confirm the backend is available and the repository is connected.',
    },
  },
  agents: {
    title: 'Agents',
    description: 'Detect running local runtimes and the CLIs they can launch when work is assigned.',
    onlineCount: '{count} runtimes online',
    cliCount: '{count} CLIs available',
    runtimeHelp: 'The CodingCTO runtime is online; these CLIs are not long-running processes. The runtime launches a wired CLI only when it receives a task.',
    actions: {
      manageSkills: 'Manage skills',
      openSkills: 'Open skills',
    },
    list: {
      title: 'Local runtimes',
      description: 'Detected from online runtime heartbeats; CLIs are local capabilities reported by each runtime.',
    },
    states: {
      loading: 'Loading...',
      unknown: 'Unknown',
    },
    empty: {
      title: 'No online agents detected',
      description: 'Start a local CodingCTO runtime first. Runtime heartbeats report available CLIs such as Codex, Claude Code, and Cursor.',
      selectAgent: 'Select an online agent.',
    },
    setup: {
      title: 'Start a local runtime',
      description: 'After registration, run a CodingCTO runtime on your machine. It detects local CLIs such as Codex, Claude Code, and Cursor, sends heartbeats to the platform, and claims work after an issue is dispatched.',
      commandTitle: 'Local start command',
      commandDescription: 'Run this on the machine with your checkout. It defaults to the current project path; change --repo-dir when targeting another repository.',
      copy: 'Copy command',
      copied: 'Copied',
      commandLoading: 'Generating start command...',
      noRepositoryCommand: 'Bind a GitHub repository first, then CodingCTO can generate a runtime command for it.',
      steps: {
        start: {
          label: '1. Start',
          value: 'The local runtime connects to the platform with your token.',
        },
        detect: {
          label: '2. Detect',
          value: 'The runtime detects codex, claude, cursor-agent, and other CLIs.',
        },
        claim: {
          label: '3. Claim',
          value: 'After an issue becomes work, the local runtime claims and executes it.',
        },
      },
    },
    status: {
      online: 'online',
      dispatchReady: 'runtime can launch',
      detectOnly: 'detected, not wired for dispatch',
    },
    fields: {
      runtime: 'Runtime',
      command: 'Command',
      executor: 'Executor',
      skills: 'Skills',
      lastSeen: 'Last seen',
      hostname: 'Host',
      version: 'Version',
    },
    tabs: {
      activity: 'Activity',
      tasks: 'Tasks',
      skills: 'Skills',
      environment: 'Environment',
    },
    activity: {
      title: 'No current work',
      description: 'This agent is not running any task right now.',
    },
    tasks: {
      title: 'No completed tasks yet',
      description: 'This agent has not completed any task yet.',
    },
    skills: {
      title: 'Assign skills',
      description: 'Choose which enabled workspace skills this agent receives in its prompt.',
      assignedCount: '{count} assigned',
      assigned: 'Assigned',
      unassigned: 'Unassigned',
      active: 'active',
      inactive: 'inactive',
      noDescription: 'No description yet.',
      empty: 'This repository has no skills yet. Create or import one from the Skills page.',
      noRepository: 'No repository selected',
      noRepositoryHint: 'Connect a GitHub repository before assigning skills to agents.',
    },
    time: {
      justNow: 'just now',
      minutesAgo: '{count} min ago',
      hoursAgo: '{count} hr ago',
      daysAgo: '{count} d ago',
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
  specForge: {
    demoIdea: 'Add a team invite flow. Workspace admins can invite members by email, and invited users accept through a secure link.',
    header: {
      title: 'Project command center',
      description: 'Idea to plan, prompts, Codex run, and PR delivery',
      activeRuns: '{count} active PR nodes',
      analyzeRepo: 'Analyze repo',
      manualPlan: 'Manual plan',
      pipeline: 'Pipeline',
    },
    tabs: {
      allWork: 'All work',
      plans: 'Plans',
      runs: 'Runs',
    },
    progress: {
      awaiting: 'Awaiting plan approval; {reason}',
      ready: '{ready} / {total} PR nodes ready or merged',
    },
    readiness: {
      online: 'A writable runtime with Codex CLI is online.',
      demo: 'Demo mode can simulate execution without a live runtime.',
      startRuntime: 'Start a CodingCTO runtime with Codex CLI before dispatching this plan.',
    },
    status: {
      readyForPlanning: 'Ready for planning',
      needsInput: 'Needs input',
      apiContext: 'API context',
      awaitingPlan: 'Awaiting plan',
      demoFallback: 'Demo fallback',
      approved: 'Approved',
      needsReview: 'Needs review',
      noPlan: 'No plan',
      notStarted: 'Not started',
      current: 'Current',
    },
    stages: {
      intake: {
        title: 'Idea intake',
        empty: 'Waiting for idea',
        itemTitle: 'Capture product intent',
        itemDescription: 'Describe the feature outcome, constraints, and acceptance boundaries.',
      },
      context: {
        title: 'Repo intelligence',
        empty: 'No repo selected',
        itemTitle: 'Analyze repos and skills',
      },
      planning: {
        title: 'Planning',
        empty: 'Plan not generated',
        planTitle: 'Approve product and tech plan',
        planDescription: '{count} PR nodes · one approval checkpoint',
        noPlanDescription: 'Generate a project-scoped plan to continue',
        dagTitle: 'Compile PR DAG and prompts',
        dagDescription: 'Check dependencies, file scope, tests, and prompt contracts.',
        nodeCount: '{count} nodes',
      },
      execution: {
        title: 'Execution',
        empty: 'No run started',
        itemTitle: 'Run Codex and deliver PRs',
      },
      delivery: {
        title: 'PR delivery',
        empty: 'PRs appear here after execution',
      },
      blocked: {
        title: 'Decision needed',
        empty: 'No escalation',
      },
    },
    detail: {
      idea: {
        heading: 'Capture product intent',
        inputLabel: 'Describe the feature CodingCTO should turn into reviewable PRs',
        placeholder: 'Describe the product outcome, constraints, and implementation boundaries...',
        targetRepo: 'Target repository',
        githubConnected: 'GitHub connected',
        unverified: 'Unverified',
        manualEntry: 'Manual entry',
        repositoryId: 'Repository ID',
        verifiedHelp: 'Plans, branches, commits, and PRs will target {repo}.',
        loadingRepos: 'Loading connected repositories...',
        connectHelp: 'Connect a GitHub repository in settings to use a verified repository here.',
        generating: 'Generating',
        generatePlan: 'Generate plan',
        reset: 'Reset',
        summaryTitle: 'Current requirement',
        emptySummaryTitle: 'No requirement selected',
        emptySummary: 'Create a requirement from the left sidebar to add it to this command center.',
      },
    },
    createDialog: {
      title: 'New requirement',
      viaAgent: 'Create with agent',
      placeholder:
        'Tell the agent what you want, for example: "Let Bohan fix the mailbox loading issue in the web project"',
      agentLabel: 'Execution agent',
      noAgent: 'No executable local agent detected',
      repositoryRequired: 'Repository required',
      noRepositoryTitle: 'This workspace has no GitHub repository bound yet',
      noRepositoryDescription:
        'Configure GitHub first, sync installation records, and bind a repository to the current workspace.',
      create: 'Create',
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
      openAgents: 'View agents',
      signInBackend: 'Sign in with backend',
      cancel: 'Cancel',
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
      slugHelp: 'Use at least 2 characters: lowercase letters, numbers, or hyphens.',
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
        delivery: {
          title: 'Open CodingCTO delivery',
          description: 'Generate plans, run tasks, and produce reviewable PRs from repository context.',
        },
        repository: {
          title: 'GitHub repository',
          description: 'Bind the writable primary repository, then generate plans and PRs.',
        },
      },
    },
    wizard: {
      title: 'Guided setup',
      description:
        'Finish the required delivery context in one place: workspace, project, and writable primary repository.',
      status: {
        workspace: 'Workspace needed',
        project: 'Project needed',
        repository: 'Repository needed',
        complete: 'Ready for requirements',
      },
      workspace: {
        title: 'Choose the operating workspace',
        description:
          'The workspace owns GitHub access, permissions, and every project that will later generate PRs.',
      },
      project: {
        title: 'Choose the delivery project',
        description:
          'A project is the product boundary CodingCTO will analyze before writing PRDs, tasks, prompts, and code.',
        selectLabel: 'Delivery project',
        selectPlaceholder: 'Select project',
        selected: 'Project: {name}',
        empty: 'No delivery project selected.',
      },
      repository: {
        title: 'Bind the primary repository',
        description:
          'The primary repository is the only writable execution target. Other repositories can be added later as read-only context.',
        project: 'Project: {name}',
        loading: 'Loading connected GitHub repositories...',
        connectedCount: '{count} connected repositories',
        emptyTitle: 'No connected repositories yet',
        emptyDescription:
          'Connect or sync GitHub in Settings first, then return here to bind the primary repository.',
        allBound:
          'All connected repositories are already bound to this project. Open the project context page to review roles.',
        selectLabel: 'Primary repository',
        selectPlaceholder: 'Select connected repository',
        bindPrimary: 'Bind as primary',
      },
      complete: {
        title: 'Delivery context is ready',
        description:
          'You can now submit a product idea, generate the PRD and technical plan, then compile prompts for execution.',
        ready: '{name} has a writable primary repository.',
        startRequirement: 'Create requirement',
      },
    },
    messages: {
      workspaceRequired: 'Workspace name and slug are required.',
      workspaceCreateFailed:
        'Workspace could not be created. Check the API connection and slug uniqueness.',
      selectWorkspaceFirst: 'Create or select a workspace before creating a project.',
      selectProjectFirst: 'Create or select a project before binding a repository.',
      projectRequired: 'Project name and slug are required.',
      slugInvalid: 'Slug must be at least 2 characters and use lowercase letters, numbers, or hyphens.',
      projectCreateFailed: 'Project could not be created. Check the API connection and slug uniqueness.',
      repositoryRequired: 'Select a connected GitHub repository first.',
      repositoryBound: 'Primary repository {repoId} is bound to this project.',
      repositoryBindFailed:
        'Repository could not be bound. Confirm it belongs to this workspace and try again.',
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
    e2e: {
      title: 'End-to-end trial run',
      description:
        'Run the real delivery path for this repository: create an Issue, generate a plan, call local Codex, and open a PR.',
      defaultIssueTitle: 'CodingCTO end-to-end trial: record one automated delivery',
      defaultIssueBody:
        'Please add a .codingcto/e2e-smoke.md file that records this trial run completed GitHub Issue creation, plan generation, local Codex CLI execution, code commit, and PR creation. Keep the change very small and only submit this note file.',
      issueTitleLabel: 'Trial Issue title',
      issueBodyLabel: 'Trial Issue body',
      readiness: {
        title: 'Preflight checks',
        description:
          'Check GitHub App installation, repository permissions, and access tokens before creating Issues, pushing branches, and opening PRs.',
        error: 'Could not load preflight checks. Confirm the API is running, sign in again, and retry.',
        checkingRepository: 'Checking the current primary repository...',
        noChecks: 'Some preflight checks have not passed yet. Resolve them before retrying.',
        status: {
          ready: 'Ready',
          blocked: 'Needs attention',
          checking: 'Checking',
        },
      },
      button: {
        running: 'Trial running...',
        blocked: 'Resolve checks first',
        start: 'Start end-to-end trial',
      },
      timeline: {
        title: 'Execution timeline',
        empty:
          'After starting, progress appears here: repository checks, Issue, plan, dispatch, Codex execution, and PR.',
      },
      steps: {
        repository: {
          title: 'Check repository binding',
        },
        issue: {
          title: 'Create GitHub Issue',
        },
        plan: {
          title: 'Generate execution plan',
          detail: 'Generated {count} PR nodes',
        },
        approve: {
          title: 'Confirm plan',
          detail: 'Plan #{id} confirmed',
        },
        run: {
          title: 'Start execution',
        },
        dispatch: {
          title: 'Dispatch to local runner',
        },
        codexWaiting: {
          title: 'Waiting for Codex',
          detail: 'Task dispatched. Waiting for the local runner to claim it and call Codex CLI.',
        },
        codexDone: {
          title: 'Codex completed',
          detail: 'The local runner changed code, committed, and pushed the branch.',
        },
        pr: {
          title: 'Create GitHub Pull Request',
          detail: 'PR #{number}',
          missing: 'The task completed, but no PR link was returned.',
        },
        error: {
          title: 'Flow interrupted',
        },
      },
      errors: {
        noRepository: 'This project has no primary repository yet. Finish repository setup first.',
        noExecutableNode: 'The plan did not produce an executable PR node.',
        noDispatchedTask: 'No executable task was dispatched. Confirm the local runner is online.',
        codexFailed: 'Codex CLI execution failed.',
        flowFailed: 'The trial was interrupted. Check the previous step and retry.',
        timeout:
          'The local runner has not completed the task yet. Confirm the runner is still running and check the agent heartbeat page.',
      },
      stepStatus: {
        running: 'Running',
        success: 'Done',
        error: 'Failed',
        pending: 'Waiting',
      },
      checkStatus: {
        ok: 'Passed',
        warning: 'Warning',
        error: 'Missing',
      },
      linkLabel: 'View details',
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
