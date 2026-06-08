import { describe, expect, it } from 'vitest';

import { githubSetupChecklist } from '@/features/project/github-setup-checklist';

describe('githubSetupChecklist', () => {
  it('blocks recovery until a workspace is selected', () => {
    const summary = githubSetupChecklist({
      workspaceId: '',
      enabled: true,
      installURL: 'https://github.com/apps/codingcto/installations/new',
      connectedRepositoryCount: 0,
    });

    expect(summary.canRecoverReadiness).toBe(false);
    expect(summary.items.find(item => item.id === 'workspace')?.state).toBe('blocked');
    expect(summary.items.find(item => item.id === 'synced_repositories')?.state).toBe('waiting');
  });

  it('blocks when GitHub is disabled or install entry is missing', () => {
    const summary = githubSetupChecklist({
      workspaceId: 'workspace-1',
      enabled: false,
      installURL: '',
      connectedRepositoryCount: 0,
    });

    expect(summary.items.find(item => item.id === 'enabled')?.state).toBe('blocked');
    expect(summary.items.find(item => item.id === 'install_entry')?.detail).toContain(
      'NEXT_PUBLIC_GITHUB_APP'
    );
  });

  it('blocks until repositories are synced from the GitHub App installation', () => {
    const summary = githubSetupChecklist({
      workspaceId: 'workspace-1',
      enabled: true,
      installURL: 'https://github.com/apps/codingcto/installations/new',
      connectedRepositoryCount: 0,
    });

    expect(summary.items.find(item => item.id === 'synced_repositories')?.state).toBe('blocked');
    expect(summary.nextAction).toContain('仓库已同步');
  });

  it('marks setup recoverable when all prerequisites are ready', () => {
    const summary = githubSetupChecklist({
      workspaceId: 'workspace-1',
      enabled: true,
      installURL: 'https://github.com/apps/codingcto/installations/new',
      connectedRepositoryCount: 2,
    });

    expect(summary.canRecoverReadiness).toBe(true);
    expect(summary.readyCount).toBe(summary.totalCount);
    expect(summary.nextAction).toContain('返回项目');
  });
});
