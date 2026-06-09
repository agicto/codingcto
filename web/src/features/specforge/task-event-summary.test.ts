import { describe, expect, it } from 'vitest';

import { summarizeTaskEvents } from '@/features/specforge/task-event-summary';
import type { SpecForgeTaskEventDTO } from '@/features/specforge/services/specforge-service';

function event(overrides: Partial<SpecForgeTaskEventDTO>): SpecForgeTaskEventDTO {
  return {
    id: overrides.seq ?? 1,
    task_id: 10,
    seq: 1,
    type: 'runtime_claimed',
    created_at: '2026-06-03T00:00:00Z',
    ...overrides,
  };
}

describe('summarizeTaskEvents', () => {
  it('waits when there are no task events', () => {
    const summary = summarizeTaskEvents([]);

    expect(summary.proofLabel).toBe('等待事件');
    expect(summary.lastEventLabel).toBe('暂无');
  });

  it('detects runtime claim and executor result proof', () => {
    const summary = summarizeTaskEvents([
      event({ seq: 1, type: 'runtime_claimed' }),
      event({ seq: 2, type: 'executor_stdout', output: 'Running tests' }),
      event({ seq: 3, type: 'executor_result' }),
    ]);

    expect(summary.hasRuntimeClaim).toBe(true);
    expect(summary.hasExecutorResult).toBe(true);
    expect(summary.outputEventCount).toBe(1);
    expect(summary.proofLabel).toBe('已有执行结果');
    expect(summary.lastEventLabel).toBe('3: executor_result');
  });

  it('counts error evidence from event type', () => {
    const summary = summarizeTaskEvents([event({ seq: 1, type: 'executor_stderr' })]);

    expect(summary.errorEventCount).toBe(1);
  });
});
