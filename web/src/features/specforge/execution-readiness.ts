import type { ExecutorRuntime } from '@/features/specforge/types';
import { deriveRuntimeHealth } from '@/features/specforge/runtime-health';

export interface ExecutionReadiness {
  canDispatch: boolean;
  reason: string;
  healthyRuntimeCount: number;
}

export function executionReadinessForExecutor({
  runtimes,
  executor,
  now,
  allowFallback,
}: {
  runtimes: readonly ExecutorRuntime[];
  executor: string;
  now: number;
  allowFallback: boolean;
}): ExecutionReadiness {
  const targetExecutor = executor.trim() || 'codex_cli';
  const healthyRuntimes = runtimes.filter(runtime =>
    runtimeCanDispatch(runtime, targetExecutor, now)
  );

  if (healthyRuntimes.length > 0) {
    return {
      canDispatch: true,
      healthyRuntimeCount: healthyRuntimes.length,
      reason: 'A writable runtime with Codex CLI is online.',
    };
  }

  if (allowFallback) {
    return {
      canDispatch: true,
      healthyRuntimeCount: 0,
      reason: 'Demo mode can simulate execution without a live runtime.',
    };
  }

  return {
    canDispatch: false,
    healthyRuntimeCount: 0,
    reason: 'Start a CodingCTO runtime with Codex CLI before dispatching this plan.',
  };
}

function runtimeCanDispatch(runtime: ExecutorRuntime, executor: string, now: number) {
  if (
    runtime.executor !== executor ||
    deriveRuntimeHealth(runtime, now) !== 'online' ||
    !runtime.sandbox?.writable
  ) {
    return false;
  }

  if (executor === 'codex_cli') {
    return runtime.availableClis.some(cli => cli.command === 'codex' && cli.available);
  }

  return true;
}
