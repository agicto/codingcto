import { describe, expect, it } from 'vitest';

import { executionLifecycleSteps } from '@/features/specforge/execution-lifecycle';
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

describe('executionLifecycleSteps', () => {
  it('waits for approval and dispatch before a run starts', () => {
    const steps = executionLifecycleSteps({ approved: false, run: run() });

    expect(steps.find(step => step.id === 'approval')?.state).toBe('waiting');
    expect(steps.find(step => step.id === 'dispatch')?.state).toBe('waiting');
  });

  it('shows claim and event activity for runtime-backed running tasks', () => {
    const steps = executionLifecycleSteps({
      approved: true,
      run: run({
        status: 'running',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            ...baseNode,
            status: 'running',
            taskId: 10,
            runtimeId: 'runtime-local',
          },
        ],
      }),
    });

    expect(steps.find(step => step.id === 'approval')?.state).toBe('ready');
    expect(steps.find(step => step.id === 'dispatch')?.state).toBe('active');
    expect(steps.find(step => step.id === 'claim')?.state).toBe('active');
    expect(steps.find(step => step.id === 'events')?.state).toBe('active');
  });

  it('marks PR回流 ready and recovery blocked from task status', () => {
    const steps = executionLifecycleSteps({
      approved: true,
      run: run({
        status: 'blocked',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            ...baseNode,
            status: 'failed',
            taskId: 10,
            runtimeId: 'runtime-local',
            githubPrUrl: 'https://github.com/org/repo/pull/1',
          },
        ],
      }),
    });

    expect(steps.find(step => step.id === 'pr')?.state).toBe('ready');
    expect(steps.find(step => step.id === 'recovery')?.state).toBe('blocked');
  });

  it('blocks the claim stage when a claimed process is lost', () => {
    const steps = executionLifecycleSteps({
      approved: true,
      run: run({
        status: 'blocked',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            ...baseNode,
            status: 'failed',
            taskId: 10,
            runtimeId: 'runtime-local',
            processStatus: 'lost',
          },
        ],
      }),
    });

    expect(steps.find(step => step.id === 'claim')?.state).toBe('blocked');
    expect(steps.find(step => step.id === 'claim')?.detail).toContain('进程失败');
  });
});
