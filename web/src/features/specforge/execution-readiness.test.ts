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
    expect(result.reason).toContain('启动带 Codex CLI 的 CodingCTO 运行器');
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

  it('allows dispatch when a writable kimi runtime is online', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          executor: 'kimi_cli',
          availableClis: [{ name: 'Kimi CLI', command: 'kimi', available: true }],
          sandbox: {
            provider: 'kimi_cli',
            mode: 'workspace-write',
            networkAccess: true,
            writable: true,
          },
        }),
      ],
      executor: 'kimi_cli',
      now,
      allowFallback: false,
    });

    expect(result.canDispatch).toBe(true);
    expect(result.reason).toContain('Kimi CLI');
  });

  it('requires a matching discovered repository when runtime reports repositories', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          repositories: [
            {
              repositoryId: 'agicto__codingcto',
              repoDir: '/Users/example/codingcto',
              dirty: false,
            },
          ],
        }),
      ],
      executor: 'codex_cli',
      now,
      allowFallback: false,
      repositoryId: 'agicto__codingcto',
    });

    expect(result.canDispatch).toBe(true);
  });

  it('blocks dispatch when discovered repositories do not match the plan repo', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          repositories: [
            {
              repositoryId: 'other__repo',
              repoDir: '/Users/example/other',
              dirty: false,
            },
          ],
        }),
      ],
      executor: 'codex_cli',
      now,
      allowFallback: false,
      repositoryId: 'agicto__codingcto',
    });

    expect(result.canDispatch).toBe(false);
  });

  it('rejects kimi runtimes without kimi cli capability', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          executor: 'kimi_cli',
          availableClis: [{ name: 'Codex CLI', command: 'codex', available: true }],
        }),
      ],
      executor: 'kimi_cli',
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
  it('allows Claude Code when its runtime is online and writable', () => {
    const result = executionReadinessForExecutor({
      runtimes: [
        runtime({
          executor: 'claude_code_cli',
          availableClis: [{ name: 'Claude Code', command: 'claude', available: true }],
          sandbox: {
            provider: 'claude_code_cli',
            mode: 'workspace-write',
            networkAccess: true,
            writable: true,
          },
        }),
      ],
      executor: 'claude_code_cli',
      now,
      allowFallback: false,
    });

    expect(result.canDispatch).toBe(true);
  });
});
