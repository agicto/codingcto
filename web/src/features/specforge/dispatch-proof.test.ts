import { describe, expect, it } from 'vitest';

import {
  dispatchProofSeparationSummary,
  isCodingCTODispatchProofTaskTitle,
} from '@/features/specforge/dispatch-proof';
import type { ExecutionRun, PRNode } from '@/features/specforge/types';

const node: PRNode = {
  id: '1',
  nodeKey: 'PR-001',
  order: 1,
  title: 'Build feature',
  type: 'implementation',
  goal: 'Build the feature.',
  dependsOn: [],
  estimatedRisk: 'low',
  expectedFiles: ['web/src/app/page.tsx'],
  nonGoals: [],
  acceptanceCriteria: ['Works.'],
  testCommands: ['pnpm type-check'],
  branchName: 'feature/build-feature',
  status: 'planned',
};

function run(tasks: PRNode[] = []): ExecutionRun {
  return {
    status: tasks.length ? 'running' : 'idle',
    selectedPRNodeIds: tasks.map(task => task.id),
    tasks,
  };
}

describe('dispatchProofSeparationSummary', () => {
  it('recognizes project and local proof task titles from the same dispatch proof family', () => {
    expect(isCodingCTODispatchProofTaskTitle('CodingCTO project dispatch proof')).toBe(true);
    expect(isCodingCTODispatchProofTaskTitle('CodingCTO local Codex dispatch proof')).toBe(true);
    expect(isCodingCTODispatchProofTaskTitle('CodingCTO e2e direct Codex proof')).toBe(false);
  });

  it('keeps read-only direct proof separate from formal PR dispatch', () => {
    const summary = dispatchProofSeparationSummary({
      run: run(),
      directTaskStatus: 'completed',
      directTaskEvents: [
        { seq: 1, type: 'runtime_claimed' },
        { seq: 2, type: 'executor_result', output: 'ok' },
      ],
    });

    expect(summary.directProofState).toBe('proven');
    expect(summary.formalDispatchState).toBe('missing');
    expect(summary.canClaimFormalDelivery).toBe(false);
    expect(summary.headline).toContain('只读调度已证明');
  });

  it('prioritizes blocked formal quality gates over starting from the plan page', () => {
    const summary = dispatchProofSeparationSummary({
      run: run(),
      directTaskStatus: 'completed',
      directTaskEvents: [
        { seq: 1, type: 'runtime_claimed' },
        { seq: 2, type: 'executor_result', output: 'ok' },
      ],
      formalBlockedReasons: ['GitHub 门'],
    });

    const formalLane = summary.lanes.find(lane => lane.id === 'formal-dispatch');

    expect(summary.headline).toContain('质量门阻塞');
    expect(formalLane?.evidence).toContain('GitHub 门');
    expect(formalLane?.nextAction).toContain('先处理阻塞质量门');
  });

  it('marks formal dispatch partial after backend tasks exist but before claim', () => {
    const summary = dispatchProofSeparationSummary({
      run: run([{ ...node, taskId: 10, status: 'queued' }]),
      directTaskEvents: [],
    });

    expect(summary.formalDispatchState).toBe('partial');
    expect(summary.lanes.find(lane => lane.id === 'formal-dispatch')?.nextAction).toContain(
      'runtime claim'
    );
  });

  it('marks formal dispatch proven only after runtime claim', () => {
    const summary = dispatchProofSeparationSummary({
      run: run([{ ...node, taskId: 10, runtimeId: 'local-ccto', status: 'running' }]),
      directTaskEvents: [],
    });

    expect(summary.formalDispatchState).toBe('proven');
    expect(summary.canClaimFormalDelivery).toBe(true);
  });
});
