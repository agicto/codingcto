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
      reason: `已有可写的 ${executorLabel(targetExecutor)} 运行器在线。`,
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
    reason: `请先启动带 ${executorLabel(targetExecutor)} 的 CodingCTO 运行器，再派发这个计划。`,
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

  const requiredCommand = executorCommand(executor);
  if (requiredCommand) {
    return runtime.availableClis.some(cli => cli.command === requiredCommand && cli.available);
  }

  return true;
}

function executorCommand(executor: string) {
  const commands: Record<string, string> = {
    codex_cli: 'codex',
    kimi_cli: 'kimi',
  };
  return commands[executor] ?? '';
}

function executorLabel(executor: string) {
  const labels: Record<string, string> = {
    codex_cli: 'Codex CLI',
    kimi_cli: 'Kimi CLI',
    claude_code_cli: 'Claude Code',
  };
  return labels[executor] ?? executor;
}
