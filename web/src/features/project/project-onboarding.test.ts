import { describe, expect, it } from 'vitest';

import { projectOnboardingSteps, resolveProjectOnboardingStep } from './project-onboarding';

describe('project onboarding', () => {
  it('starts with workspace creation when no workspace exists', () => {
    const input = { hasWorkspace: false, hasProject: false, hasPrimaryRepository: false };

    expect(resolveProjectOnboardingStep(input)).toBe('workspace');
    expect(projectOnboardingSteps(input)).toEqual([
      { id: 'workspace', state: 'current' },
      { id: 'project', state: 'locked' },
      { id: 'repository', state: 'locked' },
    ]);
  });

  it('moves to project creation after workspace selection', () => {
    const input = { hasWorkspace: true, hasProject: false, hasPrimaryRepository: false };

    expect(resolveProjectOnboardingStep(input)).toBe('project');
    expect(projectOnboardingSteps(input)).toEqual([
      { id: 'workspace', state: 'done' },
      { id: 'project', state: 'current' },
      { id: 'repository', state: 'locked' },
    ]);
  });

  it('requires a primary repository before delivery can start', () => {
    const input = { hasWorkspace: true, hasProject: true, hasPrimaryRepository: false };

    expect(resolveProjectOnboardingStep(input)).toBe('repository');
    expect(projectOnboardingSteps(input)).toEqual([
      { id: 'workspace', state: 'done' },
      { id: 'project', state: 'done' },
      { id: 'repository', state: 'current' },
    ]);
  });

  it('finishes after workspace, project, and primary repository exist', () => {
    const input = { hasWorkspace: true, hasProject: true, hasPrimaryRepository: true };

    expect(resolveProjectOnboardingStep(input)).toBe('complete');
    expect(projectOnboardingSteps(input)).toEqual([
      { id: 'workspace', state: 'done' },
      { id: 'project', state: 'done' },
      { id: 'repository', state: 'done' },
    ]);
  });
});
