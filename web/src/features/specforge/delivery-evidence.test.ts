import { describe, expect, it } from 'vitest';

import { deliveryEvidenceLedger } from '@/features/specforge/delivery-evidence';
import type { ExecutionReadiness } from '@/features/specforge/execution-readiness';
import type { ExecutionRun, PlanBundle, PRNode } from '@/features/specforge/types';

const readyRuntime: ExecutionReadiness = {
  canDispatch: true,
  healthyRuntimeCount: 1,
  reason: 'runtime ready',
};

const node: PRNode = {
  id: '1',
  nodeKey: 'PR-1',
  order: 1,
  title: 'Implement proof',
  type: 'frontend',
  goal: 'Show proof',
  dependsOn: [],
  estimatedRisk: 'low',
  expectedFiles: ['web/src/features/specforge/components/specforge-workbench.tsx'],
  nonGoals: [],
  acceptanceCriteria: ['proof visible'],
  testCommands: ['pnpm type-check'],
  branchName: 'feature/proof',
  status: 'planned',
};

const plan: PlanBundle = {
  idea: 'Make delivery understandable',
  repoProfile: {
    repositoryId: 'github_agicto__codingcto_local',
    defaultBranch: 'dev',
    stack: ['Next.js'],
    testCommands: ['pnpm type-check'],
    ciProvider: 'github',
    codingConventions: ['feature folders'],
    riskAreas: [],
    summary: 'repo summary',
    source: 'github_tree',
    warnings: [],
  },
  productSpec: {
    goals: ['clear E2E'],
    businessRules: [],
    permissionRules: [],
    acceptanceCriteria: ['ledger visible'],
    assumptions: [],
  },
  implementationPlan: {
    technicalSummary: 'Build ledger',
    affectedAreas: ['web'],
    securityRisks: [],
    migrationRisks: [],
    status: 'approved',
  },
  prNodes: [node],
  prDagReview: [],
};

function idleRun(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    status: 'idle',
    selectedPRNodeIds: [],
    tasks: [],
    ...overrides,
  };
}

describe('deliveryEvidenceLedger', () => {
  it('does not treat read-only dispatch proof as formal PR delivery', () => {
    const ledger = deliveryEvidenceLedger({
      plan,
      hasPlan: true,
      approved: true,
      run: idleRun(),
      wikiScorePercent: 80,
      skillRunCount: 3,
      executionReadiness: readyRuntime,
      projectProofTaskStatus: 'completed',
      projectProofEvents: [
        { seq: 1, type: 'runtime_claimed' },
        { seq: 2, type: 'executor_stdout', output: 'ok' },
        { seq: 3, type: 'executor_result', output: 'done' },
      ],
    });

    expect(ledger.items.find(item => item.id === 'runtime-proof')?.state).toBe('proven');
    expect(ledger.items.find(item => item.id === 'formal-dispatch')?.state).toBe('missing');
    expect(ledger.items.find(item => item.id === 'pr-delivery')?.state).toBe('missing');
    expect(ledger.completionAudit.complete).toBe(false);
    expect(ledger.completionAudit.nextRequiredProof).toContain('正式 PR 节点已派发');
  });

  it('marks formal dispatch partial before runtime claim', () => {
    const ledger = deliveryEvidenceLedger({
      plan,
      hasPlan: true,
      approved: true,
      run: idleRun({
        status: 'running',
        selectedPRNodeIds: ['1'],
        tasks: [{ ...node, taskId: 10, status: 'queued' }],
      }),
      wikiScorePercent: 80,
      skillRunCount: 3,
      executionReadiness: readyRuntime,
      projectProofEvents: [],
    });

    expect(ledger.items.find(item => item.id === 'formal-dispatch')?.state).toBe('partial');
    expect(ledger.nextGap).toContain('平台能调度本地 Codex');
  });

  it('marks PR delivery proven when a GitHub PR URL is present', () => {
    const ledger = deliveryEvidenceLedger({
      plan,
      hasPlan: true,
      approved: true,
      run: idleRun({
        status: 'completed',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            ...node,
            taskId: 10,
            runtimeId: 'local-ccto',
            status: 'ready_for_review',
            githubPrUrl: 'https://github.com/agicto/codingcto/pull/999',
          },
        ],
      }),
      wikiScorePercent: 80,
      skillRunCount: 3,
      executionReadiness: readyRuntime,
      projectProofEvents: [
        { seq: 1, type: 'runtime_claimed' },
        { seq: 2, type: 'executor_result', output: 'done' },
      ],
    });

    expect(ledger.items.find(item => item.id === 'formal-dispatch')?.state).toBe('proven');
    expect(ledger.items.find(item => item.id === 'pr-delivery')?.state).toBe('proven');
    expect(ledger.completionAudit.complete).toBe(true);
    expect(ledger.completionAudit.nextRequiredProof).toBe('All required proof is present.');
  });
});
