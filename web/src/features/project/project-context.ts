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
      guardrails: context.readiness.guardrails ?? context.execution_guardrails ?? [],
      summary: context.readiness.summary,
      nextAction: context.readiness.next_action,
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
    (count, item) => count + (item.warnings?.length ?? 0) + (item.profile?.warnings?.length ?? 0),
    0
  );
  const guardrails = context?.execution_guardrails ?? [];

  return {
    hasPrimaryRepository: Boolean(primaryRepository),
    activeRepositoryCount: activeRepositories.length,
    readOnlyRepositoryCount,
    skillCount,
    warningCount,
    guardrails,
    summary: readinessSummary(
      activeRepositories.length,
      primaryRepository?.repository.repository_id
    ),
    nextAction: readinessNextAction(Boolean(primaryRepository), warningCount, skillCount),
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
