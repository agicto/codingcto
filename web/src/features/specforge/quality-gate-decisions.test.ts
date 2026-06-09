import { describe, expect, it } from 'vitest';

import {
  qualityGateDecisionStorageKey,
  readRiskGateAccepted,
  writeRiskGateAccepted,
} from '@/features/specforge/quality-gate-decisions';
import type { PlanBundle } from '@/features/specforge/types';

function plan(overrides: Partial<PlanBundle> = {}): PlanBundle {
  return {
    idea: 'Ship a workflow',
    planId: 42,
    repoProfile: {
      repositoryId: 'github_org__repo',
      defaultBranch: 'main',
      stack: [],
      testCommands: [],
      ciProvider: '',
      codingConventions: [],
      riskAreas: [],
      summary: '',
      source: 'manual',
      warnings: [],
    },
    productSpec: {
      goals: [],
      businessRules: [],
      permissionRules: [],
      acceptanceCriteria: [],
      assumptions: [],
    },
    implementationPlan: {
      technicalSummary: '',
      affectedAreas: [],
      securityRisks: [],
      migrationRisks: [],
      status: 'draft',
    },
    prNodes: [],
    prDagReview: [],
    ...overrides,
  };
}

describe('quality gate decisions', () => {
  it('builds a stable plan-scoped storage key', () => {
    expect(qualityGateDecisionStorageKey({ projectId: 15, plan: plan() })).toBe(
      'codingcto:quality-gate-decisions:project:15:github_org__repo:plan:42'
    );

    expect(
      qualityGateDecisionStorageKey({
        projectId: 15,
        plan: plan({ planId: 43 }),
      })
    ).not.toBe(qualityGateDecisionStorageKey({ projectId: 15, plan: plan() }));
  });

  it('persists and clears risk acceptance', () => {
    const key = qualityGateDecisionStorageKey({ projectId: 15, plan: plan() });

    writeRiskGateAccepted(key, false);
    expect(readRiskGateAccepted(key)).toBe(false);

    writeRiskGateAccepted(key, true);
    expect(readRiskGateAccepted(key)).toBe(true);

    writeRiskGateAccepted(key, false);
    expect(readRiskGateAccepted(key)).toBe(false);
  });
});
