import { describe, expect, it } from 'vitest';

import { qualityGatesForPlanDelivery } from '@/features/specforge/quality-gates';
import type { ExecutionRun, PlanBundle, PRNode } from '@/features/specforge/types';

const baseNode: PRNode = {
  id: '1',
  nodeKey: 'PR-001',
  order: 1,
  title: 'Implement workflow',
  type: 'implementation',
  goal: 'Implement the workflow.',
  dependsOn: [],
  estimatedRisk: 'low',
  expectedFiles: ['web/src/app/page.tsx'],
  nonGoals: [],
  acceptanceCriteria: ['User can complete the flow.'],
  testCommands: ['pnpm type-check'],
  branchName: 'feature/workflow',
  status: 'planned',
};

function planWithNode(node: PRNode): PlanBundle {
  return {
    idea: 'Ship a workflow.',
    repoProfile: {
      repositoryId: 'repo_1',
      defaultBranch: 'main',
      stack: ['Next.js'],
      testCommands: ['pnpm type-check'],
      ciProvider: 'github_actions',
      codingConventions: [],
      riskAreas: [],
      summary: 'UI app',
      source: 'manual',
      warnings: [],
    },
    productSpec: {
      goals: ['Complete workflow'],
      businessRules: [],
      permissionRules: [],
      acceptanceCriteria: ['Works end to end'],
      assumptions: [],
    },
    implementationPlan: {
      technicalSummary: 'Build UI',
      affectedAreas: ['web'],
      securityRisks: [],
      migrationRisks: [],
      status: 'draft',
    },
    prNodes: [node],
    prDagReview: [],
  };
}

function idleRun(tasks: PRNode[] = []): ExecutionRun {
  return { status: 'idle', selectedPRNodeIds: [], tasks };
}

describe('qualityGatesForPlanDelivery', () => {
  it('waits for plan evidence before marking gates ready', () => {
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), false, idleRun());

    expect(gates.every(gate => gate.state === 'waiting')).toBe(true);
  });

  it('blocks execution when a plan has no test commands', () => {
    const node = { ...baseNode, testCommands: [] };
    const gates = qualityGatesForPlanDelivery(planWithNode(node), true, idleRun([node]));

    expect(gates.find(gate => gate.id === 'tests')?.state).toBe('blocked');
  });

  it('blocks execution when the plan has no repo wiki evidence', () => {
    const plan = {
      ...planWithNode(baseNode),
      repoProfile: {
        ...planWithNode(baseNode).repoProfile,
        repositoryId: '',
        summary: '',
        stack: [],
        codingConventions: [],
        riskAreas: [],
      },
    };
    const gates = qualityGatesForPlanDelivery(plan, true, idleRun([baseNode]));

    expect(gates.find(gate => gate.id === 'wiki')?.state).toBe('blocked');
  });

  it('blocks formal delivery when GitHub App readiness is missing', () => {
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), true, idleRun([baseNode]), {
      githubReady: false,
      githubBlockingCheckCount: 1,
    });

    expect(gates.find(gate => gate.id === 'github')?.state).toBe('blocked');
    expect(gates.find(gate => gate.id === 'github')?.detail).toContain('阻塞正式 PR 交付');
  });

  it('waits while GitHub readiness is still checking', () => {
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), true, idleRun([baseNode]), {
      githubChecking: true,
    });

    expect(gates.find(gate => gate.id === 'github')?.state).toBe('waiting');
  });

  it('marks the GitHub gate ready when repository readiness passes', () => {
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), true, idleRun([baseNode]), {
      githubReady: true,
    });

    expect(gates.find(gate => gate.id === 'github')?.state).toBe('ready');
  });

  it('unblocks the risk gate after a human risk decision', () => {
    const highRiskNode = { ...baseNode, estimatedRisk: 'high' as const };
    const plan = {
      ...planWithNode(highRiskNode),
      implementationPlan: {
        ...planWithNode(highRiskNode).implementationPlan,
        securityRisks: ['Token handling changed'],
      },
    };

    const blocked = qualityGatesForPlanDelivery(plan, true, idleRun([highRiskNode]));
    const accepted = qualityGatesForPlanDelivery(plan, true, idleRun([highRiskNode]), {
      riskAccepted: true,
    });

    expect(blocked.find(gate => gate.id === 'risk')?.state).toBe('blocked');
    expect(accepted.find(gate => gate.id === 'risk')?.state).toBe('ready');
    expect(accepted.find(gate => gate.id === 'risk')?.detail).toContain('已由人工确认');
  });

  it('marks PR and review gates ready from delivered task state', () => {
    const delivered = {
      ...baseNode,
      status: 'ready_for_review' as const,
      githubPrUrl: 'https://github.com/org/repo/pull/1',
    };
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), true, {
      status: 'running',
      selectedPRNodeIds: ['1'],
      tasks: [delivered],
    });

    expect(gates.find(gate => gate.id === 'pr')?.state).toBe('ready');
    expect(gates.find(gate => gate.id === 'review')?.state).toBe('ready');
  });

  it('blocks recovery when a task fails', () => {
    const failed = { ...baseNode, status: 'failed' as const };
    const gates = qualityGatesForPlanDelivery(planWithNode(baseNode), true, {
      status: 'blocked',
      selectedPRNodeIds: ['1'],
      tasks: [failed],
    });

    expect(gates.find(gate => gate.id === 'recovery')?.state).toBe('blocked');
  });
});
