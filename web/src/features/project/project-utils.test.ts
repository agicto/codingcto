import { describe, expect, it } from 'vitest';

import {
  projectContextHref,
  projectRequirementNewHref,
  projectSpecForgeHref,
  repositoryRoleLabel,
  slugFromProjectName,
} from './project-utils';

describe('project utils', () => {
  it('builds stable slugs from project names', () => {
    expect(slugFromProjectName('SpecForge MVP')).toBe('specforge-mvp');
    expect(slugFromProjectName('  AI CTO / Console  ')).toBe('ai-cto-console');
  });

  it('builds project-scoped CodingCTO routes', () => {
    expect(projectSpecForgeHref(42)).toBe('/console/projects/42/codingcto');
  });

  it('builds project-scoped context routes', () => {
    expect(projectContextHref(42)).toBe('/console/projects/42/context');
  });

  it('builds project-scoped requirement intake routes', () => {
    expect(projectRequirementNewHref(42)).toBe('/console/projects/42/requirements/new');
  });

  it('labels repository roles for scanning', () => {
    expect(repositoryRoleLabel('primary')).toBe('Primary');
    expect(repositoryRoleLabel('infra')).toBe('Infra');
    expect(repositoryRoleLabel('custom')).toBe('custom');
  });
});
