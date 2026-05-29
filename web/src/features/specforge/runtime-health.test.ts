import { describe, expect, it } from 'vitest';

import {
  deriveRuntimeHealth,
  runtimeFromDTO,
  summarizeRuntimeHealth,
} from '@/features/specforge/runtime-health';

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

describe('runtimeFromDTO', () => {
  it('maps API runtime fields into the UI model', () => {
    expect(
      runtimeFromDTO({
        id: 1,
        runtime_id: 'runtime_1',
        executor: 'codex_cli',
        status: 'online',
        hostname: 'local',
        version: '0.1.0',
        last_seen_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      })
    ).toEqual({
      runtimeId: 'runtime_1',
      executor: 'codex_cli',
      status: 'online',
      hostname: 'local',
      version: '0.1.0',
      lastSeenAt: '2026-05-29T12:00:00Z',
    });
  });
});
