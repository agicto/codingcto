import { describe, expect, it } from 'vitest';

import {
  hasFreshCodexDispatchRuntime,
  hasFreshDispatchRuntime,
} from '@/features/specforge/runtime-dispatch-readiness';
import type { SpecForgeRuntimeDTO } from '@/features/specforge/services/specforge-service';

const now = Date.parse('2026-06-03T10:00:00.000Z');

function runtime(overrides: Partial<SpecForgeRuntimeDTO> = {}): SpecForgeRuntimeDTO {
  return {
    id: 1,
    runtime_id: 'local-ccto',
    executor: 'codex_cli',
    status: 'online',
    hostname: 'Mac',
    version: 'ccto/0.1',
    available_clis: [{ name: 'Codex CLI', command: 'codex', available: true }],
    sandbox: {
      provider: 'codex_cli',
      mode: 'workspace-write',
      network_access: true,
      writable: true,
      approval_policy: 'never',
    },
    local_skill_count: 0,
    last_seen_at: new Date(now - 60_000).toISOString(),
    created_at: new Date(now - 60_000).toISOString(),
    updated_at: new Date(now - 60_000).toISOString(),
    ...overrides,
  };
}

describe('hasFreshCodexDispatchRuntime', () => {
  it('accepts a fresh writable Codex runtime with codex CLI', () => {
    expect(hasFreshCodexDispatchRuntime([runtime()], now)).toBe(true);
  });

  it('rejects API-online runtimes with stale heartbeat', () => {
    expect(
      hasFreshCodexDispatchRuntime(
        [runtime({ last_seen_at: new Date(now - 10 * 60_000).toISOString() })],
        now
      )
    ).toBe(false);
  });

  it('rejects runtimes that cannot write or do not expose codex CLI', () => {
    expect(
      hasFreshCodexDispatchRuntime(
        [
          runtime({ sandbox: { writable: false, network_access: true } }),
          runtime({ available_clis: [{ name: 'Claude', command: 'claude', available: true }] }),
        ],
        now
      )
    ).toBe(false);
  });

  it('accepts executor-specific runtimes with matching discovered repository', () => {
    expect(
      hasFreshDispatchRuntime(
        [
          runtime({
            executor: 'kimi_cli',
            available_clis: [{ name: 'Kimi CLI', command: 'kimi', available: true }],
            repositories: [{ repository_id: 'agicto__codingcto', repo_dir: '/repo', dirty: false }],
          }),
        ],
        now,
        'kimi_cli',
        'agicto__codingcto'
      )
    ).toBe(true);
  });

  it('rejects executor-specific runtimes with mismatched discovered repository', () => {
    expect(
      hasFreshDispatchRuntime(
        [
          runtime({
            repositories: [{ repository_id: 'other__repo', repo_dir: '/repo', dirty: false }],
          }),
        ],
        now,
        'codex_cli',
        'agicto__codingcto'
      )
    ).toBe(false);
  });
});
