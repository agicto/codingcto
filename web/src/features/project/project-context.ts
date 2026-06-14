import type {
  ProjectContextContractDTO,
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
  ProjectContextSnapshotDTO,
} from './services/project-service';

export interface ProjectContextReadiness {
  hasPrimaryRepository: boolean;
  activeRepositoryCount: number;
  readOnlyRepositoryCount: number;
  skillCount: number;
  warningCount: number;
  guardrails: string[];
  summary: string;
  nextAction: string;
}

export type ProjectOverviewStepID = 'bind_repository' | 'review_context' | 'create_requirement';

export interface ProjectOverviewDecision {
  step: ProjectOverviewStepID;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  tone: 'warning' | 'info' | 'success';
}

export interface ProjectRepositoryEvidence {
  repositoryId: string;
  role: string;
  writable: boolean;
  hasProfile: boolean;
  hasArchitectureSnapshot: boolean;
  architectureStale: boolean;
  skillCount: number;
  warningCount: number;
  missingEvidence: string[];
}

export interface ProjectSkillContract {
  pinnedSkillCount: number;
  repositorySkillCount: number;
  effectiveSkillNames: string[];
  promptEvidenceRefs: string[];
  repositoriesMissingSkills: string[];
  canPlanWithSkills: boolean;
  summary: string;
}

export interface ProjectContextSnapshotState {
  snapshot?: ProjectContextSnapshotDTO;
  status: 'missing' | 'blocked' | 'attention' | 'ready';
  repositoryCount: number;
  deepWikiCount: number;
  missingEvidenceCount: number;
  warningCount: number;
}

export function primaryRepositoryContext(
  context?: ProjectContextDTO
): ProjectRepositoryContextDTO | undefined {
  if (!context?.repository_contexts?.length) {
    return undefined;
  }
  return context.repository_contexts.find(
    item =>
      item.repository.active &&
      item.repository.role === 'primary' &&
      (!context.primary_repository_id ||
        item.repository.repository_id === context.primary_repository_id)
  );
}

export function projectContextContract(
  context?: ProjectContextDTO
): ProjectContextContractDTO | undefined {
  return context?.context_contract;
}

export function projectContextSnapshotState(
  context?: ProjectContextDTO
): ProjectContextSnapshotState {
  const snapshot = context?.latest_snapshot;
  if (!snapshot) {
    return {
      status: 'missing',
      repositoryCount: 0,
      deepWikiCount: 0,
      missingEvidenceCount: 0,
      warningCount: 0,
    };
  }

  return {
    snapshot,
    status:
      snapshot.snapshot_status === 'blocked' ||
      snapshot.snapshot_status === 'attention' ||
      snapshot.snapshot_status === 'ready'
        ? snapshot.snapshot_status
        : 'attention',
    repositoryCount: snapshot.repositories?.length ?? 0,
    deepWikiCount:
      snapshot.repositories?.filter(repository => Boolean(repository.deepwiki?.index_id)).length ??
      0,
    missingEvidenceCount: snapshot.missing_evidence?.length ?? 0,
    warningCount: snapshot.warning_count ?? 0,
  };
}

export function projectRepositoryEvidence(
  context?: ProjectContextDTO
): ProjectRepositoryEvidence[] {
  return (context?.repository_contexts ?? []).map(item => {
    const repositoryId = item.repository.repository_id;
    const missingEvidence = [
      !item.profile ? `repo_profile:${repositoryId}` : '',
      !item.architecture_snapshot ? `architecture_snapshot:${repositoryId}` : '',
      item.skills.length === 0 ? `skills:${repositoryId}` : '',
    ].filter(Boolean);
    const warningCount =
      (item.warnings?.length ?? 0) +
      (item.architecture_warnings?.length ?? 0) +
      (item.profile?.warnings?.length ?? 0) +
      (item.architecture_stale ? 1 : 0);

    return {
      repositoryId,
      role: item.repository.role,
      writable: item.repository.active && item.repository.role === 'primary',
      hasProfile: Boolean(item.profile),
      hasArchitectureSnapshot: Boolean(item.architecture_snapshot),
      architectureStale: item.architecture_stale,
      skillCount: item.skills.length,
      warningCount,
      missingEvidence,
    };
  });
}

export function projectContextMissingEvidence(context?: ProjectContextDTO): string[] {
  const contractMissingEvidence = context?.context_contract?.missing_evidence ?? [];
  if (contractMissingEvidence.length > 0) {
    return contractMissingEvidence;
  }

  return projectRepositoryEvidence(context).flatMap(item => item.missingEvidence);
}

export function projectSkillContract(context?: ProjectContextDTO): ProjectSkillContract {
  const contractSkillNames = context?.context_contract?.skill_names ?? [];
  const repositoryContexts = context?.repository_contexts ?? [];
  const repositorySkills = repositoryContexts.flatMap(item =>
    (item.skills ?? [])
      .filter(skill => skill.active)
      .map(skill => ({
        id: skill.id,
        name: skill.name,
        repositoryId: skill.repository_id || item.repository.repository_id,
      }))
  );
  const effectiveSkillNames = normalizeSkillNames(
    contractSkillNames.length > 0 ? contractSkillNames : repositorySkills.map(skill => skill.name)
  );
  const promptEvidenceRefs = normalizeSkillNames(
    repositorySkills
      .filter(skill => skill.id > 0)
      .map(skill => `skill:${skill.id}`)
      .concat(effectiveSkillNames.map(name => `skill_name:${name}`))
  );
  const repositoriesMissingSkills = repositoryContexts
    .filter(
      item =>
        item.repository.active && (item.skills ?? []).filter(skill => skill.active).length === 0
    )
    .map(item => item.repository.repository_id);
  const canPlanWithSkills =
    effectiveSkillNames.length > 0 && repositoriesMissingSkills.length === 0;

  return {
    pinnedSkillCount: contractSkillNames.length,
    repositorySkillCount: repositorySkills.length,
    effectiveSkillNames,
    promptEvidenceRefs,
    repositoriesMissingSkills,
    canPlanWithSkills,
    summary: skillContractSummary(effectiveSkillNames.length, repositoriesMissingSkills.length),
  };
}

export function projectContextReadiness(
  context?: ProjectContextDTO,
  locale = 'zh-Hans'
): ProjectContextReadiness {
  const localize = (text?: string) => localizeProjectContextText(text, locale);

  if (context?.readiness) {
    return {
      hasPrimaryRepository: context.readiness.has_primary_repository,
      activeRepositoryCount: context.readiness.active_repository_count,
      readOnlyRepositoryCount: context.readiness.read_only_repository_count,
      skillCount: context.readiness.skill_count,
      warningCount: context.readiness.warning_count,
      guardrails: (context.readiness.guardrails ?? context.execution_guardrails ?? []).map(
        localize
      ),
      summary: localize(context.readiness.summary),
      nextAction: localize(context.readiness.next_action),
    };
  }

  const repositories = context?.repository_contexts ?? [];
  const activeRepositories = repositories.filter(item => item.repository.active);
  const primaryRepository = primaryRepositoryContext(context);
  const readOnlyRepositoryCount =
    context?.read_only_repository_ids?.length ??
    activeRepositories.filter(item => item.repository.role !== 'primary').length;
  const skillCount = repositories.reduce((count, item) => count + (item.skills?.length ?? 0), 0);
  const warningCount = repositories.reduce(
    (count, item) =>
      count +
      (item.warnings?.length ?? 0) +
      (item.architecture_warnings?.length ?? 0) +
      (item.profile?.warnings?.length ?? 0),
    0
  );
  const guardrails = (context?.execution_guardrails ?? []).map(localize);

  return {
    hasPrimaryRepository: Boolean(primaryRepository),
    activeRepositoryCount: activeRepositories.length,
    readOnlyRepositoryCount,
    skillCount,
    warningCount,
    guardrails,
    summary: localize(
      readinessSummary(activeRepositories.length, primaryRepository?.repository.repository_id)
    ),
    nextAction: localize(readinessNextAction(Boolean(primaryRepository), warningCount, skillCount)),
  };
}

export function localizeProjectContextText(text?: string, locale = 'zh-Hans') {
  if (!text) {
    return '';
  }
  if (!locale.startsWith('zh')) {
    return text;
  }

  let next = text;
  const replacements: Array<[RegExp, string]> = [
    [
      /^No active repositories are bound to this project yet\.$/,
      '当前项目还没有绑定启用中的仓库。',
    ],
    [
      /^(\d+) active repositories are bound, but none is the primary execution repository\.$/,
      '已绑定 $1 个启用中的仓库，但还没有主执行仓库。',
    ],
    [
      /^Execution will modify (.+); other active repositories are read-only planning context\.$/,
      '执行只会修改 $1；其他启用仓库仅作为只读规划上下文。',
    ],
    [
      /^Review repository context warnings before approving execution\.$/,
      '审批执行前请先查看仓库上下文警告。',
    ],
    [
      /^Bind one active primary repository before generating a plan\.$/,
      '生成计划前请先绑定一个启用的主仓库。',
    ],
    [
      /^Add project or repo skills to reduce prompt ambiguity\.$/,
      '添加项目或仓库技能，减少提示词歧义。',
    ],
    [
      /^Generate a requirement plan from this project context\.$/,
      '基于当前项目上下文生成需求计划。',
    ],
    [/^MVP execution is primary-repository only\.$/, '当前 MVP 仅支持主仓库执行。'],
    [
      /^Planner may read dependency, docs, and infra repositories as context\.$/,
      '规划器可以读取依赖、文档和基础设施仓库作为上下文。',
    ],
    [
      /^Executor must modify only (.+); other bound repositories are read-only context\.$/,
      '执行器只能修改 $1；其他已绑定仓库是只读上下文。',
    ],
    [
      /^Project currently has (\d+) active repositories bound; maximum supported is (\d+)\.$/,
      '当前项目已绑定 $1 个启用仓库；最多支持 $2 个。',
    ],
    [/^Repo profile has not been generated yet\.$/, '仓库画像尚未生成。'],
  ];

  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }

  return next;
}

export function projectOverviewDecision(context?: ProjectContextDTO): ProjectOverviewDecision {
  const readiness = projectContextReadiness(context);
  if (!readiness.hasPrimaryRepository) {
    return {
      step: 'bind_repository',
      title: 'Select a primary repository',
      description:
        'CodingCTO needs one writable primary repository before it can generate or execute a plan.',
      actionLabel: 'Select repository',
      actionHref: '#repository-binding',
      tone: 'warning',
    };
  }

  if (readiness.warningCount > 0 || readiness.skillCount === 0) {
    return {
      step: 'review_context',
      title: 'Review project context',
      description:
        'Repo profiles, architecture snapshots, skills, and warnings should be reviewed before plan approval.',
      actionLabel: 'Review context',
      actionHref: '#project-context',
      tone: 'info',
    };
  }

  return {
    step: 'create_requirement',
    title: 'Create a requirement',
    description:
      'The project context is ready enough to turn a product change into a plan and PR DAG.',
    actionLabel: 'Create requirement',
    actionHref: '#project-requirement',
    tone: 'success',
  };
}

function readinessSummary(activeRepositoryCount: number, primaryRepositoryID?: string) {
  if (!activeRepositoryCount) {
    return 'No active repositories are bound to this project yet.';
  }
  if (!primaryRepositoryID) {
    return `${activeRepositoryCount} active repositories are bound, but none is the primary execution repository.`;
  }
  return `Execution will modify ${primaryRepositoryID}; other active repositories are read-only planning context.`;
}

function normalizeSkillNames(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function skillContractSummary(skillCount: number, missingRepositoryCount: number) {
  if (skillCount === 0) {
    return 'No active skills will be injected into planning or prompt compilation.';
  }
  if (missingRepositoryCount > 0) {
    return `${skillCount} skills are available, but ${missingRepositoryCount} active repositories still need explicit instructions.`;
  }
  return `${skillCount} skills are ready for planning, PR DAG generation, and prompt compilation.`;
}

function readinessNextAction(
  hasPrimaryRepository: boolean,
  warningCount: number,
  skillCount: number
) {
  if (!hasPrimaryRepository) {
    return 'Bind one active primary repository before generating a plan.';
  }
  if (warningCount > 0) {
    return 'Review repository context warnings before approving execution.';
  }
  if (skillCount === 0) {
    return 'Add project or repo skills to reduce prompt ambiguity.';
  }
  return 'Generate a requirement plan from this project context.';
}
