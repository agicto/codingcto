import { describe, expect, it } from 'vitest';

import { executionReadinessForExecutor } from '@/features/specforge/execution-readiness';
import type { ExecutorRuntime } from '@/features/specforge/types';

const now = new Date('2026-05-31T10:00:00.000Z').getTime();

function runtime(overrides: Partial<ExecutorRuntime> = {}): ExecutorRuntime {
  return {
    runtimeId: 'runtime_123',
    executor: 'codex_cli',
    status: 'online',
    hostname: 'local',
    availableClis: [{ name: 'Codex CLI', command: 'codex', available: true }],
    sandbox: {
      provider: 'codex_cli',
      mode: 'workspace-write',
      networkAccess: true,
      writable: true,
    },
    skillRoots: [],
    localSkillCount: 1,
    lastSeenAt: new Date(now).toISOString(),
    ...overrides,
  };
}

describe('executionReadinessForExecutor', () => {
  it('allows dispatch when a writable codex runtime is online', () => {
    const result = executionReadinessForExecutor({
      runtimes: [runtime()],
      executor: 'codex_cli',
      now,
      allowFallback: false,
    });

    expect(result.canDispatch).toBe(true);
    expect(result.healthyRuntimeCount).toBe(1);
  });

  it('blocks project execution without a live runtime', () => {
    const result = executionReadinessForExecutor({
      runtimes: [],
      executor: 'codex_cli',
      now,
      allowFallback: false,
    });

    expect(result.canDispatch).toBe(false);
    expect(result.reason).toContain('Start a CodingCTO runtime');
  });

  it('rejects runtimes without codex cli capability', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          availableClis: [{ name: 'Claude Code', command: 'claude', available: true }],
        }),
      ],
      executor: 'codex_cli',
      now,
      allowFallback: false,
    });

    expect(result.canDispatch).toBe(false);
  });

  it('keeps standalone demo execution usable', () => {
    const result = executionReadinessForExecutor({
      runtimes: [],
      executor: 'codex_cli',
      now,
      allowFallback: true,
    });

    expect(result.canDispatch).toBe(true);
  });
});
