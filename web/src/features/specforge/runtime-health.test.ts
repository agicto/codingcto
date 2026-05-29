import { describe, expect, it } from 'vitest';

import { deriveRuntimeHealth, summarizeRuntimeHealth } from '@/features/specforge/runtime-health';

const now = Date.parse('2026-05-29T12:00:00.000Z');

describe('deriveRuntimeHealth', () => {
  it('keeps online runtimes online', () => {
    expect(
      deriveRuntimeHealth(
        {
          runtimeId: 'runtime_1',
          executor: 'codex_cli',
          status: 'online',
          lastSeenAt: new Date(now - 60_000).toISOString(),
        },
        now
      )
    ).toBe('online');
  });

  it('distinguishes transiently lost runtimes from stale runtimes', () => {
    expect(
      deriveRuntimeHealth(
        {
          runtimeId: 'runtime_1',
          executor: 'codex_cli',
          status: 'offline',
          lastSeenAt: new Date(now - 2 * 60_000).toISOString(),
        },
        now
      )
    ).toBe('recently_lost');

    expect(
      deriveRuntimeHealth(
        {
          runtimeId: 'runtime_2',
          executor: 'codex_cli',
          status: 'offline',
          lastSeenAt: new Date(now - 25 * 60 * 60_000).toISOString(),
        },
        now
      )
    ).toBe('stale');
  });

  it('summarizes a runtime fleet', () => {
    expect(
      summarizeRuntimeHealth(
        [
          {
            runtimeId: 'runtime_online',
            executor: 'codex_cli',
            status: 'online',
            lastSeenAt: new Date(now).toISOString(),
          },
          {
            runtimeId: 'runtime_lost',
            executor: 'codex_cli',
            status: 'offline',
            lastSeenAt: new Date(now - 30_000).toISOString(),
          },
          {
            runtimeId: 'runtime_stale',
            executor: 'codex_cli',
            status: 'offline',
          },
        ],
        now
      )
    ).toEqual({
      online: 1,
      recently_lost: 1,
      offline: 0,
      stale: 1,
    });
  });
});
