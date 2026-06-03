import type { ExecutorRuntime, RuntimeHealth } from '@/features/specforge/types';
import type { SpecForgeRuntimeDTO } from '@/features/specforge/services/specforge-service';

const RECENTLY_LOST_MS = 5 * 60 * 1000;
const STALE_MS = 24 * 60 * 60 * 1000;

export function deriveRuntimeHealth(runtime: ExecutorRuntime, now: number): RuntimeHealth {
  const lastSeen = runtime.lastSeenAt ? new Date(runtime.lastSeenAt).getTime() : 0;
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) {
    return runtime.status === 'online' ? 'recently_lost' : 'stale';
  }

  const offlineFor = now - lastSeen;
  if (runtime.status === 'online' && offlineFor < RECENTLY_LOST_MS) {
    return 'online';
  }
  if (offlineFor < RECENTLY_LOST_MS) {
    return 'recently_lost';
  }
  if (offlineFor >= STALE_MS) {
    return 'stale';
  }
  return 'offline';
}

export function summarizeRuntimeHealth(
  runtimes: readonly ExecutorRuntime[],
  now: number
): Record<RuntimeHealth, number> {
  return runtimes.reduce<Record<RuntimeHealth, number>>(
    (summary, runtime) => {
      summary[deriveRuntimeHealth(runtime, now)] += 1;
      return summary;
    },
    {
      online: 0,
      recently_lost: 0,
      offline: 0,
      stale: 0,
    }
  );
}

export function runtimeFromDTO(runtime: SpecForgeRuntimeDTO): ExecutorRuntime {
  return {
    runtimeId: runtime.runtime_id,
    executor: runtime.executor,
    status: runtime.status,
    hostname: runtime.hostname,
    version: runtime.version,
    availableClis: (runtime.available_clis ?? []).map(cli => ({
      name: cli.name,
      command: cli.command,
      path: cli.path,
      version: cli.version,
      available: cli.available,
    })),
    sandbox: runtime.sandbox
      ? {
          provider: runtime.sandbox.provider,
          mode: runtime.sandbox.mode,
          networkAccess: runtime.sandbox.network_access,
          writable: runtime.sandbox.writable,
          approvalPolicy: runtime.sandbox.approval_policy,
          reason: runtime.sandbox.reason,
        }
      : undefined,
    skillRoots: (runtime.skill_roots ?? []).map(root => ({
      provider: root.provider,
      path: root.path,
      writable: root.writable,
    })),
    localSkillCount: runtime.local_skill_count ?? 0,
    capabilitiesHash: runtime.capabilities_hash,
    lastSeenAt: runtime.last_seen_at,
  };
}
