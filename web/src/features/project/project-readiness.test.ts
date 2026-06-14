import { describe, expect, it } from 'vitest';

import { projectReadinessBadgeClass, projectReadinessDecision } from './project-readiness';

describe('project readiness helpers', () => {
  it('routes bind repository readiness to the binding anchor', () => {
    const decision = projectReadinessDecision(12, {
      project_id: 12,
      readiness_status: 'blocked',
      next_step: 'bind_repository',
      next_action: 'Bind one active primary repository.',
      summary: 'No writable primary repository is bound yet.',
      has_primary_repository: false,
      active_repository_count: 0,
      read_only_repository_count: 0,
      skill_count: 0,
      warning_count: 0,
      runtime_count: 0,
    });

    expect(decision.actionHref).toBe('#repository-binding');
    expect(decision.tone).toBe('warning');
  });

  it('routes a ready project to requirement intake', () => {
    const decision = projectReadinessDecision(12, {
      project_id: 12,
      readiness_status: 'ready',
      next_step: 'create_requirement',
      next_action: 'Create a requirement.',
      summary: 'Project setup is ready enough to turn a change request into a plan.',
      has_primary_repository: true,
      active_repository_count: 1,
      read_only_repository_count: 0,
      skill_count: 2,
      warning_count: 0,
      runtime_count: 1,
    });

    expect(decision.actionHref).toBe('/console/projects/12/requirements/new');
    expect(decision.tone).toBe('success');
  });

  it('routes missing expert policy to the context editor anchor', () => {
    const decision = projectReadinessDecision(12, {
      project_id: 12,
      readiness_status: 'attention',
      next_step: 'configure_expert_policy',
      next_action: 'Persist expert policy.',
      summary: 'Project setup is missing the active expert scope and merge policy contract.',
      has_primary_repository: true,
      active_repository_count: 1,
      read_only_repository_count: 0,
      skill_count: 2,
      warning_count: 0,
      runtime_count: 1,
    });

    expect(decision.actionHref).toBe('/console/projects/12/context#expert-policy');
    expect(decision.tone).toBe('info');
  });

  it('routes GitHub connection to the overview connection anchor', () => {
    const decision = projectReadinessDecision(12, {
      project_id: 12,
      readiness_status: 'blocked',
      next_step: 'configure_github',
      next_action: 'Complete GitHub setup.',
      summary: 'Primary repository is bound, but GitHub delivery is still blocked.',
      has_primary_repository: true,
      active_repository_count: 1,
      read_only_repository_count: 0,
      skill_count: 0,
      warning_count: 0,
      runtime_count: 0,
    });

    expect(decision.actionHref).toBe('#github-setup');
    expect(decision.actionLabel).toBe('Open GitHub connection');
  });

  it('routes runtime setup to the context runtime binding anchor', () => {
    const decision = projectReadinessDecision(12, {
      project_id: 12,
      readiness_status: 'attention',
      next_step: 'connect_runtime',
      next_action: 'Bind an online runtime.',
      summary: 'Online runtimes exist, but this project still needs an explicit runtime binding.',
      has_primary_repository: true,
      active_repository_count: 1,
      read_only_repository_count: 0,
      skill_count: 1,
      warning_count: 0,
      runtime_count: 2,
    });

    expect(decision.actionHref).toBe('/console/projects/12/context#runtime-binding');
    expect(decision.actionLabel).toBe('Bind runtime');
  });

  it('maps readiness statuses to badge colors', () => {
    expect(projectReadinessBadgeClass('ready')).toContain('text-success');
    expect(projectReadinessBadgeClass('blocked')).toContain('text-warning');
    expect(projectReadinessBadgeClass('attention')).toContain('text-primary');
  });
});
