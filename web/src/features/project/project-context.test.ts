import { describe, expect, it } from 'vitest';

import { primaryRepositoryContext, projectContextReadiness } from './project-context';
import type { ProjectContextDTO } from './services/project-service';

function projectContext(
  roles: Array<['primary' | 'dependency', boolean, string]>
): ProjectContextDTO {
  return {
    project: {
      id: 1,
      workspace_id: 'workspace_1',
      name: 'SpecForge',
      slug: 'specforge',
      description: '',
      status: 'active',
      created_by: 1,
      created_at: '',
      updated_at: '',
    },
    repositories: [],
    primary_repository_id: roles.find(([role, active]) => role === 'primary' && active)?.[2],
    execution_repository_id: roles.find(([role, active]) => role === 'primary' && active)?.[2],
    read_only_repository_ids: roles
      .filter(([role, active]) => role !== 'primary' && active)
      .map(([, , repositoryId]) => repositoryId),
    execution_guardrails: ['MVP execution is primary-repository only.'],
    repository_contexts: roles.map(([role, active, repositoryId], index) => ({
      repository: {
        id: index + 1,
        workspace_id: 'workspace_1',
        project_id: 1,
        repository_id: repositoryId,
        role,
        active,
        created_by: 1,
        created_at: '',
        updated_at: '',
      },
      skills: [],
    })),
  };
}

describe('project context', () => {
  it('selects the active primary repository context', () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ['dependency', true, 'repo_dependency'],
        ['primary', true, 'repo_primary'],
      ])
    );

    expect(selected?.repository.repository_id).toBe('repo_primary');
  });

  it('does not fall back when no primary exists', () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ['dependency', false, 'repo_inactive'],
        ['dependency', true, 'repo_active'],
      ])
    );

    expect(selected).toBeUndefined();
  });

  it('summarizes primary and read-only repository readiness', () => {
    const readiness = projectContextReadiness(
      projectContext([
        ['dependency', true, 'repo_sdk'],
        ['primary', true, 'repo_app'],
      ])
    );

    expect(readiness.hasPrimaryRepository).toBe(true);
    expect(readiness.activeRepositoryCount).toBe(2);
    expect(readiness.readOnlyRepositoryCount).toBe(1);
    expect(readiness.summary).toContain('repo_app');
  });

  it('asks for a primary repo before planning when none is active', () => {
    const readiness = projectContextReadiness(projectContext([['dependency', true, 'repo_docs']]));

    expect(readiness.hasPrimaryRepository).toBe(false);
    expect(readiness.nextAction).toBe('Bind one active primary repository before generating a plan.');
  });
});
