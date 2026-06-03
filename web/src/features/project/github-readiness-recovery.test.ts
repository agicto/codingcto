import { describe, expect, it } from 'vitest';

import {
  githubReadinessRecoveryActions,
  githubReadinessRecoveryDiagnostics,
  githubReadinessRecoveryTargetFromRepositoryId,
} from '@/features/project/github-readiness-recovery';

describe('githubReadinessRecoveryActions', () => {
  it('routes installation and token failures to GitHub settings', () => {
    const actions = githubReadinessRecoveryActions([
      { key: 'installation' },
      { key: 'installation_token' },
    ]);

    expect(actions).toEqual([
      expect.objectContaining({
        id: 'github-settings',
        label: '去 GitHub 设置',
        href: '/console/settings?tab=github',
      }),
    ]);
  });

  it('keeps target repository context in recovery links', () => {
    const actions = githubReadinessRecoveryActions(
      [{ key: 'installation' }, { key: 'repository' }],
      {
        owner: 'agicto',
        repo: 'codingcto',
        repositoryId: 'github_agicto__codingcto',
        returnTo: '/console/projects/15/codingcto',
      }
    );

    expect(actions.find(action => action.id === 'github-settings')?.href).toBe(
      '/console/settings?tab=github&owner=agicto&repo=codingcto&repository_url=https%3A%2F%2Fgithub.com%2Fagicto%2Fcodingcto&repository_id=github_agicto__codingcto&return_to=%2Fconsole%2Fprojects%2F15%2Fcodingcto'
    );
    expect(actions.find(action => action.id === 'repository-bindings')?.href).toBe(
      '/console/settings?tab=repositories&owner=agicto&repo=codingcto&repository_url=https%3A%2F%2Fgithub.com%2Fagicto%2Fcodingcto&repository_id=github_agicto__codingcto&return_to=%2Fconsole%2Fprojects%2F15%2Fcodingcto'
    );
  });

  it('routes permission failures to GitHub settings', () => {
    const actions = githubReadinessRecoveryActions([{ key: 'permission_pull_requests' }]);

    expect(actions.map(action => action.id)).toEqual(['github-settings']);
  });

  it('routes missing repository binding to repository settings', () => {
    const actions = githubReadinessRecoveryActions([{ key: 'repository' }]);

    expect(actions).toEqual([
      expect.objectContaining({
        id: 'repository-bindings',
        label: '去仓库绑定',
        href: '/console/settings?tab=repositories',
      }),
    ]);
  });

  it('deduplicates recovery destinations while preserving setup order', () => {
    const actions = githubReadinessRecoveryActions([
      { key: 'permission_issues' },
      { key: 'repository' },
      { key: 'installation' },
    ]);

    expect(actions.map(action => action.id)).toEqual([
      'github-settings',
      'repository-bindings',
    ]);
  });

  it('does not show recovery actions for unknown nonblocking checks', () => {
    expect(githubReadinessRecoveryActions([{ key: 'custom_warning' }])).toEqual([]);
  });

  it('maps readiness checks to GitHub setup checklist steps', () => {
    const diagnostics = githubReadinessRecoveryDiagnostics([
      { key: 'settings' },
      { key: 'installation' },
      { key: 'installation_token' },
      { key: 'permission_pull_requests' },
      { key: 'repository' },
    ]);

    expect(diagnostics.map(item => item.setupStep)).toEqual([
      '启用 GitHub',
      '同步仓库安装',
      '检查 App 密钥',
      '补充 App 权限',
      '绑定项目仓库',
    ]);
    expect(diagnostics.find(item => item.checkKey === 'permission_pull_requests')?.detail).toContain(
      'pull:requests'
    );
  });

  it('keeps unknown readiness diagnostics actionable', () => {
    const diagnostics = githubReadinessRecoveryDiagnostics([{ key: 'custom' }]);

    expect(diagnostics[0]).toEqual(
      expect.objectContaining({
        setupStep: '恢复 GitHub readiness',
      })
    );
  });

  it('derives recovery target from CodingCTO GitHub repository id', () => {
    expect(githubReadinessRecoveryTargetFromRepositoryId('github_agicto__codingcto')).toEqual({
      owner: 'agicto',
      repo: 'codingcto',
      repositoryId: 'github_agicto__codingcto',
    });
    expect(githubReadinessRecoveryTargetFromRepositoryId('local_repo')).toBeUndefined();
  });
});
