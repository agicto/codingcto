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
      reason: '已有可写的 Codex CLI 运行器在线。',
    };
  }

  if (allowFallback) {
    return {
      canDispatch: true,
      healthyRuntimeCount: 0,
      reason: '演示模式可在没有本地运行器时模拟执行。',
    };
  }

  return {
    canDispatch: false,
    healthyRuntimeCount: 0,
    reason: '请先启动带 Codex CLI 的 CodingCTO 运行器，再派发这个计划。',
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
