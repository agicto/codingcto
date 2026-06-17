import type { SpecForgeRuntimeDTO } from '@/features/specforge/services/specforge-service';
import { deriveRuntimeHealth, runtimeFromDTO } from '@/features/specforge/runtime-health';

export function hasFreshCodexDispatchRuntime(
  runtimes: readonly SpecForgeRuntimeDTO[] | undefined,
  now: number
) {
  return hasFreshDispatchRuntime(runtimes, now, 'codex_cli');
}

export function hasFreshDispatchRuntime(
  runtimes: readonly SpecForgeRuntimeDTO[] | undefined,
  now: number,
  executor = 'codex_cli',
  repositoryId?: string
) {
  return (runtimes ?? []).some(runtime => {
    if (runtime.executor !== executor) {
      return false;
    }
    const mapped = runtimeFromDTO(runtime);
    if (deriveRuntimeHealth(mapped, now) !== 'online' || !mapped.sandbox?.writable) {
      return false;
    }
    if (repositoryId && (mapped.repositories?.length ?? 0) > 0) {
      const hasRepository = mapped.repositories?.some(
        repository => repository.repositoryId === repositoryId && Boolean(repository.repoDir)
      );
      if (!hasRepository) {
        return false;
      }
    }
    const requiredCommand = executorCommand(executor);
    return mapped.availableClis.some(cli => cli.available && cli.command === requiredCommand);
  });
}

export function executorCommand(executor: string) {
  switch (executor) {
    case 'kimi_cli':
      return 'kimi';
    case 'claude_code_cli':
      return 'claude';
    case 'codex_cli':
    default:
      return 'codex';
  }
}
