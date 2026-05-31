import type {
  ProjectContextContractDTO,
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
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
    (count, item) =>
      count +
      (item.warnings?.length ?? 0) +
      (item.architecture_warnings?.length ?? 0) +
      (item.profile?.warnings?.length ?? 0),
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

export function projectOverviewDecision(context?: ProjectContextDTO): ProjectOverviewDecision {
  const readiness = projectContextReadiness(context);
  if (!readiness.hasPrimaryRepository) {
    return {
      step: 'bind_repository',
      title: 'Bind a primary repository',
      description:
        'CodingCTO needs one writable primary repository before it can generate or execute a plan.',
      actionLabel: 'Bind repository',
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
    actionLabel: 'Open delivery board',
    actionHref: '#project-delivery',
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
