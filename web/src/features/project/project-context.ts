import type { ProjectContextDTO, ProjectRepositoryContextDTO } from './services/project-service';

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

export function projectContextReadiness(context?: ProjectContextDTO): ProjectContextReadiness {
  if (context?.readiness) {
    return {
      hasPrimaryRepository: context.readiness.has_primary_repository,
      activeRepositoryCount: context.readiness.active_repository_count,
      readOnlyRepositoryCount: context.readiness.read_only_repository_count,
      skillCount: context.readiness.skill_count,
      warningCount: context.readiness.warning_count,
      guardrails: (context.readiness.guardrails ?? context.execution_guardrails ?? []).map(
        localizeProjectContextText
      ),
      summary: localizeProjectContextText(context.readiness.summary),
      nextAction: localizeProjectContextText(context.readiness.next_action),
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
  const guardrails = (context?.execution_guardrails ?? []).map(localizeProjectContextText);

  return {
    hasPrimaryRepository: Boolean(primaryRepository),
    activeRepositoryCount: activeRepositories.length,
    readOnlyRepositoryCount,
    skillCount,
    warningCount,
    guardrails,
    summary: readinessSummary(activeRepositories.length, primaryRepository?.repository.repository_id),
    nextAction: readinessNextAction(Boolean(primaryRepository), warningCount, skillCount),
  };
}

export function localizeProjectContextText(text?: string) {
  if (!text) {
    return '';
  }

  let next = text;
  const replacements: Array<[RegExp, string]> = [
    [/^No active repositories are bound to this project yet\.$/, '当前项目还没有绑定启用中的仓库。'],
    [
      /^(\d+) active repositories are bound, but none is the primary execution repository\.$/,
      '已绑定 $1 个启用中的仓库，但还没有主执行仓库。',
    ],
    [
      /^Execution will modify (.+); other active repositories are read-only planning context\.$/,
      '执行只会修改 $1；其他启用仓库仅作为只读规划上下文。',
    ],
    [/^Review repository context warnings before approving execution\.$/, '审批执行前请先查看仓库上下文警告。'],
    [/^Bind one active primary repository before generating a plan\.$/, '生成计划前请先绑定一个启用的主仓库。'],
    [/^Add project or repo skills to reduce prompt ambiguity\.$/, '添加项目或仓库技能，减少提示词歧义。'],
    [/^Generate a requirement plan from this project context\.$/, '基于当前项目上下文生成需求计划。'],
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

function readinessSummary(activeRepositoryCount: number, primaryRepositoryID?: string) {
  if (!activeRepositoryCount) {
    return 'No active repositories are bound to this project yet.';
  }
  if (!primaryRepositoryID) {
    return `${activeRepositoryCount} active repositories are bound, but none is the primary execution repository.`;
  }
  return `Execution will modify ${primaryRepositoryID}; other active repositories are read-only planning context.`;
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
