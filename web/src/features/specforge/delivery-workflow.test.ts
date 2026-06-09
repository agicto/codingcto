import { describe, expect, it } from 'vitest';

import { deliveryWorkflowSummary } from '@/features/specforge/delivery-workflow';
import type { ExecutionReadiness } from '@/features/specforge/execution-readiness';
import type { QualityGateSummary } from '@/features/specforge/quality-gates';
import type { ExecutionRun, PlanBundle } from '@/features/specforge/types';

const readyRuntime: ExecutionReadiness = {
  canDispatch: true,
  healthyRuntimeCount: 1,
  reason: 'ready',
};

const blockedRuntime: ExecutionReadiness = {
  canDispatch: false,
  healthyRuntimeCount: 0,
  reason: 'start ccto',
};

const gates: QualityGateSummary[] = [
  { id: 'scope', label: '范围门', state: 'ready', detail: 'ok' },
  { id: 'wiki', label: 'Wiki 门', state: 'ready', detail: 'ok' },
  { id: 'tests', label: '测试门', state: 'ready', detail: 'ok' },
];

const plan: PlanBundle = {
  idea: 'Add a delivery board',
  repoProfile: {
    repositoryId: 'github_agicto__codingcto_local',
    defaultBranch: 'dev',
    stack: ['Next.js', 'Go'],
    testCommands: ['pnpm type-check'],
    ciProvider: 'github',
    codingConventions: ['feature folders'],
    riskAreas: ['dispatch'],
    summary: 'CodingCTO repo',
    source: 'github_tree',
    warnings: [],
  },
  productSpec: {
    goals: ['clear workflow'],
    businessRules: [],
    permissionRules: [],
    acceptanceCriteria: ['shows next action'],
    assumptions: [],
  },
  implementationPlan: {
    technicalSummary: 'Build flow',
    affectedAreas: ['web'],
    securityRisks: [],
    migrationRisks: [],
    status: 'draft',
  },
  prNodes: [
    {
      id: '1',
      nodeKey: 'PR-1',
      order: 1,
      title: 'Build board',
      type: 'frontend',
      goal: 'Show board',
      dependsOn: [],
      estimatedRisk: 'medium',
      expectedFiles: ['web/src/features/specforge/components/specforge-workbench.tsx'],
      nonGoals: [],
      acceptanceCriteria: ['board visible'],
      testCommands: ['pnpm type-check'],
      branchName: 'feature/board',
      status: 'planned',
    },
  ],
  prDagReview: ['linear'],
};

const idleRun: ExecutionRun = {
  status: 'idle',
  selectedPRNodeIds: [],
  tasks: [],
};

describe('deliveryWorkflowSummary', () => {
  it('blocks on plan review before dispatch', () => {
    const summary = deliveryWorkflowSummary({
      plan,
      hasPlan: true,
      approved: false,
      run: idleRun,
      executionReadiness: readyRuntime,
      qualityGates: gates,
      skillRunCount: 2,
    });

    expect(summary.currentStepId).toBe('plan');
    expect(summary.blockedReasons.join('\n')).toContain('专家计划');
  });

  it('shows runtime as the blocker when Codex cannot be dispatched', () => {
    const summary = deliveryWorkflowSummary({
      plan,
      hasPlan: true,
      approved: true,
      run: idleRun,
      executionReadiness: blockedRuntime,
      qualityGates: gates,
      skillRunCount: 2,
    });

    expect(summary.currentStepId).toBe('runtime');
    expect(summary.nextAction).toBe('start ccto');
  });

  it('moves to review when a PR node is ready', () => {
    const summary = deliveryWorkflowSummary({
      plan,
      hasPlan: true,
      approved: true,
      run: {
        status: 'running',
        selectedPRNodeIds: ['1'],
        tasks: [{ ...plan.prNodes[0], status: 'ready_for_review' }],
      },
      executionReadiness: readyRuntime,
      qualityGates: gates,
      skillRunCount: 2,
    });

    expect(summary.currentStepId).toBe('dispatch');
    expect(summary.steps.find(step => step.id === 'review')?.state).toBe('ready');
  });
});
