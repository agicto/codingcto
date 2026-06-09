import type { SpecForgeRuntimeDTO } from '@/features/specforge/services/specforge-service';
import { deriveRuntimeHealth, runtimeFromDTO } from '@/features/specforge/runtime-health';

export function hasFreshCodexDispatchRuntime(
  runtimes: readonly SpecForgeRuntimeDTO[] | undefined,
  now: number
) {
  return (runtimes ?? []).some(runtime => {
    if (runtime.executor !== 'codex_cli') {
      return false;
    }
    const mapped = runtimeFromDTO(runtime);
    if (deriveRuntimeHealth(mapped, now) !== 'online' || !mapped.sandbox?.writable) {
      return false;
    }
    return mapped.availableClis.some(cli => cli.available && cli.command === 'codex');
  });
}
