import { describe, expect, it } from 'vitest';

import { repoWikiPlanningContext } from '@/features/specforge/repo-wiki-planning-context';
import type { RepoProfile } from '@/features/specforge/types';

const baseProfile: RepoProfile = {
  repositoryId: 'github_org__repo',
  defaultBranch: 'main',
  stack: ['Next.js', 'Go'],
  testCommands: ['pnpm type-check'],
  ciProvider: 'github_actions',
  codingConventions: ['Use feature folders'],
  riskAreas: ['Auth middleware'],
  summary: 'A product delivery console.',
  source: 'manual',
  warnings: [],
};

describe('repoWikiPlanningContext', () => {
  it('marks a complete wiki context ready for expert planning', () => {
    const summary = repoWikiPlanningContext(baseProfile);

    expect(summary.state).toBe('ready');
    expect(summary.readyCount).toBe(summary.totalCount);
    expect(summary.scorePercent).toBe(100);
    expect(summary.nextAction).toContain('计划上下文');
  });

  it('blocks planning when summary, structure, and quality evidence are missing', () => {
    const summary = repoWikiPlanningContext({
      ...baseProfile,
      summary: '',
      stack: [],
      testCommands: [],
      riskAreas: [],
      codingConventions: [],
    });

    expect(summary.state).toBe('blocked');
    expect(summary.sections.filter(section => section.state === 'blocked').map(section => section.id)).toEqual([
      'overview',
      'structure',
      'quality',
    ]);
    expect(summary.nextAction).toContain('仓库总览');
  });

  it('uses architecture snapshot evidence over the repo profile when available', () => {
    const summary = repoWikiPlanningContext(
      {
        ...baseProfile,
        stack: [],
        testCommands: [],
        riskAreas: [],
      },
      {
        modules: ['api/internal/modules/execution'],
        entrypoints: ['api/cmd/server/main.go'],
        test_commands: ['go test ./...'],
        ci_workflows: ['.github/workflows/test.yml'],
        risk_areas: ['Runtime process management'],
      }
    );

    expect(summary.sections.find(section => section.id === 'structure')?.state).toBe('ready');
    expect(summary.sections.find(section => section.id === 'quality')?.evidenceCount).toBe(2);
    expect(summary.sections.find(section => section.id === 'risk')?.state).toBe('ready');
  });

  it('allows planning with waiting optional risk and convention evidence', () => {
    const summary = repoWikiPlanningContext({
      ...baseProfile,
      riskAreas: [],
      codingConventions: [],
    });

    expect(summary.state).toBe('waiting');
    expect(summary.sections.find(section => section.id === 'risk')?.state).toBe('waiting');
    expect(summary.sections.find(section => section.id === 'conventions')?.state).toBe('waiting');
    expect(summary.nextAction).toContain('可以继续计划');
  });
});
