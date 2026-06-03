import { describe, expect, it } from 'vitest';

import { repoWikiExpertContract } from '@/features/specforge/repo-wiki-expert-contract';
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

describe('repoWikiExpertContract', () => {
  it('blocks expert planning when required Wiki evidence is missing', () => {
    const summary = repoWikiPlanningContext({
      ...baseProfile,
      summary: '',
      stack: [],
      testCommands: [],
    });

    const contract = repoWikiExpertContract(summary, false);

    expect(contract.canWritePlan).toBe(false);
    expect(contract.canCompilePrompt).toBe(false);
    expect(contract.headline).toContain('证据不足');
    expect(contract.stages.find(stage => stage.id === 'product')?.state).toBe('blocked');
    expect(contract.stages.find(stage => stage.id === 'coding-agent')?.state).toBe('waiting');
  });

  it('allows expert planning before a plan exists when Wiki has required evidence', () => {
    const contract = repoWikiExpertContract(repoWikiPlanningContext(baseProfile), false);

    expect(contract.canWritePlan).toBe(true);
    expect(contract.canCompilePrompt).toBe(false);
    expect(contract.nextAction).toContain('录入需求');
    expect(contract.stages.find(stage => stage.id === 'architecture')?.promptRefs).toContain(
      'repo_wiki.risk_areas'
    );
  });

  it('allows prompt compilation once Wiki evidence and plan both exist', () => {
    const contract = repoWikiExpertContract(repoWikiPlanningContext(baseProfile), true);

    expect(contract.canWritePlan).toBe(true);
    expect(contract.canCompilePrompt).toBe(true);
    expect(contract.headline).toContain('Coding Agent Prompt');
    expect(contract.stages.find(stage => stage.id === 'coding-agent')?.promptRefs).toContain(
      'skill_contract'
    );
  });
});
