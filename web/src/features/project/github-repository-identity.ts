import { githubReadinessRecoveryTargetFromRepositoryId } from '@/features/project/github-readiness-recovery';

export interface GitHubRepositoryIdentitySummary {
  state: 'matched' | 'alias' | 'unknown';
  headline: string;
  detail: string;
  internalRepositoryId: string;
  gitHubTarget?: string;
}

export function githubRepositoryIdentitySummary({
  repositoryId,
  githubOwner,
  githubRepo,
}: {
  repositoryId: string;
  githubOwner?: string;
  githubRepo?: string;
}): GitHubRepositoryIdentitySummary {
  const internalRepositoryId = repositoryId.trim();
  const inferred = githubReadinessRecoveryTargetFromRepositoryId(internalRepositoryId);
  const gitHubTarget =
    githubOwner?.trim() && githubRepo?.trim()
      ? `${githubOwner.trim()}/${githubRepo.trim()}`
      : undefined;

  if (!internalRepositoryId) {
    return {
      state: 'unknown',
      headline: 'Repository identity is missing.',
      detail: 'Bind a GitHub repository before running Wiki generation, planning, or PR delivery.',
      internalRepositoryId,
      gitHubTarget,
    };
  }

  if (!gitHubTarget) {
    return {
      state: inferred ? 'matched' : 'unknown',
      headline: inferred
        ? 'Repository identity is inferred from the internal id.'
        : 'Repository identity is not a GitHub repository id.',
      detail: inferred
        ? `Internal id ${internalRepositoryId} maps to ${inferred.owner}/${inferred.repo}.`
        : 'Readiness has not returned a GitHub owner/repo target yet.',
      internalRepositoryId,
      gitHubTarget: inferred ? `${inferred.owner}/${inferred.repo}` : undefined,
    };
  }

  const inferredTarget = inferred ? `${inferred.owner}/${inferred.repo}` : '';
  if (inferredTarget && inferredTarget !== gitHubTarget) {
    return {
      state: 'alias',
      headline: 'Internal repository id differs from the GitHub target.',
      detail: `GitHub operations target ${gitHubTarget}; ${internalRepositoryId} is the internal CodingCTO repository id used for project, Wiki, and task records.`,
      internalRepositoryId,
      gitHubTarget,
    };
  }

  return {
    state: 'matched',
    headline: 'Repository identity is aligned.',
    detail: `Project records and GitHub operations target ${gitHubTarget}.`,
    internalRepositoryId,
    gitHubTarget,
  };
}
