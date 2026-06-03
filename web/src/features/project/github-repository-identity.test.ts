import { describe, expect, it } from 'vitest';

import { githubRepositoryIdentitySummary } from '@/features/project/github-repository-identity';

describe('githubRepositoryIdentitySummary', () => {
  it('marks internal GitHub ids and readiness target as aligned', () => {
    const summary = githubRepositoryIdentitySummary({
      repositoryId: 'github_agicto__codingcto',
      githubOwner: 'agicto',
      githubRepo: 'codingcto',
    });

    expect(summary.state).toBe('matched');
    expect(summary.gitHubTarget).toBe('agicto/codingcto');
  });

  it('surfaces internal aliases without treating them as delivery targets', () => {
    const summary = githubRepositoryIdentitySummary({
      repositoryId: 'github_agicto__codingcto_local',
      githubOwner: 'agicto',
      githubRepo: 'codingcto',
    });

    expect(summary.state).toBe('alias');
    expect(summary.detail).toContain('GitHub operations target agicto/codingcto');
    expect(summary.detail).toContain('github_agicto__codingcto_local');
  });

  it('uses the internal id when readiness has not returned a GitHub target yet', () => {
    const summary = githubRepositoryIdentitySummary({
      repositoryId: 'github_agicto__codingcto',
    });

    expect(summary.state).toBe('matched');
    expect(summary.gitHubTarget).toBe('agicto/codingcto');
  });

  it('marks non-GitHub internal ids as unknown before readiness returns target metadata', () => {
    const summary = githubRepositoryIdentitySummary({
      repositoryId: 'local_repo',
    });

    expect(summary.state).toBe('unknown');
    expect(summary.gitHubTarget).toBeUndefined();
  });
});
