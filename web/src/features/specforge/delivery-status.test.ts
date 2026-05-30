import { describe, expect, it } from 'vitest';

import {
  nextBlockedNode,
  nextReviewableNode,
  summarizeDeliveryRun,
} from '@/features/specforge/delivery-status';
import type { ExecutionRun, PRNode } from '@/features/specforge/types';

function node(overrides: Partial<PRNode>): PRNode {
  return {
    id: overrides.id ?? '1',
    nodeKey: overrides.nodeKey ?? 'PR-001',
    order: overrides.order ?? 1,
    title: overrides.title ?? 'Add foundation',
    type: overrides.type ?? 'foundation',
    goal: overrides.goal ?? 'Deliver a scoped change.',
    dependsOn: overrides.dependsOn ?? [],
    estimatedRisk: overrides.estimatedRisk ?? 'medium',
    expectedFiles: overrides.expectedFiles ?? [],
    nonGoals: overrides.nonGoals ?? [],
    acceptanceCriteria: overrides.acceptanceCriteria ?? [],
    testCommands: overrides.testCommands ?? [],
    branchName: overrides.branchName ?? 'codingcto/foundation',
    status: overrides.status ?? 'planned',
  };
}

function run(tasks: PRNode[], status: ExecutionRun['status'] = 'running'): ExecutionRun {
  return {
    status,
    selectedPRNodeIds: tasks.map(task => task.id),
    tasks,
  };
}

describe('delivery status summary', () => {
  it('summarizes ready, active, waiting, and progress counts', () => {
    const summary = summarizeDeliveryRun(
      run([
        node({ id: '1', nodeKey: 'PR-001', order: 1, status: 'ready_for_review' }),
        node({ id: '2', nodeKey: 'PR-002', order: 2, status: 'ci_running' }),
        node({ id: '3', nodeKey: 'PR-003', order: 3, status: 'waiting_on_dependencies' }),
      ])
    );

    expect(summary.ready).toBe(1);
    expect(summary.active).toBe(1);
    expect(summary.waiting).toBe(1);
    expect(summary.progressPercent).toBe(33);
    expect(summary.headline).toBe('1 of 3 PR nodes are ready for review.');
    expect(summary.nextAction).toContain('Review PR-001');
  });

  it('prioritizes blocked nodes over reviewable nodes', () => {
    const blocked = node({
      id: '2',
      nodeKey: 'PR-002',
      order: 2,
      title: 'Add API',
      status: 'blocked',
    });
    const reviewable = node({
      id: '1',
      nodeKey: 'PR-001',
      order: 1,
      title: 'Add model',
      status: 'ready_for_review',
    });

    const summary = summarizeDeliveryRun(run([reviewable, blocked], 'blocked'));

    expect(nextBlockedNode([reviewable, blocked])).toBe(blocked);
    expect(nextReviewableNode([reviewable, blocked])).toBe(reviewable);
    expect(summary.headline).toBe('Delivery is blocked and needs a decision.');
    expect(summary.nextAction).toBe('Resolve PR-002: Add API');
  });

  it('reports completion when every selected node is delivered', () => {
    const summary = summarizeDeliveryRun(
      run([
        node({ id: '1', status: 'merged' }),
        node({ id: '2', order: 2, status: 'ready_for_review' }),
      ])
    );

    expect(summary.ready).toBe(2);
    expect(summary.merged).toBe(1);
    expect(summary.progressPercent).toBe(100);
    expect(summary.headline).toBe('All selected PR nodes are ready for review.');
    expect(summary.nextAction).toBe('Review and merge the delivered GitHub pull requests.');
  });
});
