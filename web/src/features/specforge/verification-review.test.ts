import { describe, expect, it } from 'vitest';

import { verificationReviewForNodes } from '@/features/specforge/verification-review';
import type { PRNode } from '@/features/specforge/types';

function node(overrides: Partial<PRNode>): PRNode {
  return {
    id: '1',
    nodeKey: 'PR-001',
    order: 1,
    title: 'Add model',
    type: 'foundation',
    goal: 'Add foundation.',
    dependsOn: [],
    estimatedRisk: 'medium',
    expectedFiles: [],
    nonGoals: [],
    acceptanceCriteria: [],
    testCommands: [],
    branchName: 'specforge/pr-001',
    status: 'planned',
    ...overrides,
  };
}

describe('verificationReviewForNodes', () => {
  it('reports guarded verification before execution starts', () => {
    const review = verificationReviewForNodes([node({ status: 'planned' })]);

    expect(review.state).toBe('ready');
    expect(review.label).toBe('待验证');
    expect(review.nextAction).toContain('刷新 CI');
  });

  it('prioritizes blocked nodes and exposes remaining fix budget', () => {
    const review = verificationReviewForNodes([
      node({ id: '2', nodeKey: 'PR-002', order: 2, status: 'ci_running' }),
      node({
        id: '1',
        nodeKey: 'PR-001',
        order: 1,
        status: 'failed',
        failureReason: 'type_error',
        attemptNumber: 2,
      }),
    ]);

    expect(review.state).toBe('blocked');
    expect(review.headline).toContain('PR-001');
    expect(review.nextAction).toContain('type error');
    expect(review.autoFixBudget).toContain('1 / 3');
  });

  it('tracks CI running and reviewable nodes separately', () => {
    expect(
      verificationReviewForNodes([node({ status: 'ci_running' })]).state
    ).toBe('running');
    expect(
      verificationReviewForNodes([node({ status: 'ready_for_review' })]).state
    ).toBe('needs_review');
  });

  it('marks verification complete when every selected node is delivered', () => {
    const review = verificationReviewForNodes([
      node({ id: '1', status: 'completed' }),
      node({ id: '2', nodeKey: 'PR-002', order: 2, status: 'merged' }),
    ]);

    expect(review.state).toBe('complete');
    expect(review.headline).toContain('完成验证');
  });
});
