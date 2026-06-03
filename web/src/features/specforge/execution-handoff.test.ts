import { describe, expect, it } from 'vitest';

import { executionHandoffSummary } from '@/features/specforge/execution-handoff';
import type { ExecutionRun, PRNode } from '@/features/specforge/types';

const baseNode: PRNode = {
  id: '1',
  nodeKey: 'PR-001',
  order: 1,
  title: 'Implement task',
  type: 'implementation',
  goal: 'Implement the task.',
  dependsOn: [],
  estimatedRisk: 'low',
  expectedFiles: ['web/src/app/page.tsx'],
  nonGoals: [],
  acceptanceCriteria: ['Works.'],
  testCommands: ['pnpm type-check'],
  branchName: 'feature/task',
  status: 'planned',
};

function run(overrides: Partial<ExecutionRun> = {}): ExecutionRun {
  return {
    status: 'idle',
    selectedPRNodeIds: [],
    tasks: [],
    ...overrides,
  };
}

describe('executionHandoffSummary', () => {
  it('waits before a run starts', () => {
    const summary = executionHandoffSummary(run());

    expect(summary.state).toBe('not_started');
    expect(summary.nextAction).toContain('审批并启动');
  });

  it('shows backend tasks waiting for runtime claim', () => {
    const summary = executionHandoffSummary(
      run({
        status: 'queued',
        selectedPRNodeIds: ['1'],
        tasks: [{ ...baseNode, taskId: 10, status: 'queued' }],
      })
    );

    expect(summary.state).toBe('waiting_claim');
    expect(summary.backendTaskCount).toBe(1);
    expect(summary.claimedTaskCount).toBe(0);
  });

  it('shows claimed tasks once a runtime id is present', () => {
    const summary = executionHandoffSummary(
      run({
        status: 'running',
        selectedPRNodeIds: ['1'],
        tasks: [{ ...baseNode, taskId: 10, runtimeId: 'local-ccto', status: 'running' }],
      })
    );

    expect(summary.state).toBe('claimed');
    expect(summary.headline).toContain('已被 runtime 领取');
  });

  it('blocks when a claimed process fails or is lost', () => {
    const summary = executionHandoffSummary(
      run({
        status: 'running',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            ...baseNode,
            taskId: 10,
            runtimeId: 'local-ccto',
            processStatus: 'lost',
            status: 'failed',
          },
        ],
      })
    );

    expect(summary.state).toBe('blocked');
    expect(summary.processProblemCount).toBe(1);
  });
});
