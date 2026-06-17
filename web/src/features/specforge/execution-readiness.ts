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
  repositoryId,
}: {
  runtimes: readonly ExecutorRuntime[];
  executor: string;
  now: number;
  allowFallback: boolean;
  repositoryId?: string;
}): ExecutionReadiness {
  const targetExecutor = executor.trim() || 'codex_cli';
  const healthyRuntimes = runtimes.filter(runtime =>
    runtimeCanDispatch(runtime, targetExecutor, now, repositoryId)
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

export function runtimeCanDispatch(
  runtime: ExecutorRuntime,
  executor: string,
  now: number,
  repositoryId?: string
) {
  if (
    runtime.executor !== executor ||
    deriveRuntimeHealth(runtime, now) !== 'online' ||
    !runtime.sandbox?.writable
  ) {
    return false;
  }

  const requiredCommand = executorCommand(executor);
  if (requiredCommand) {
    if (!runtime.availableClis.some(cli => cli.command === requiredCommand && cli.available)) {
      return false;
    }
  }

  const targetRepositoryId = repositoryId?.trim();
  if (targetRepositoryId && (runtime.repositories?.length ?? 0) > 0) {
    return runtime.repositories?.some(
      repository => repository.repositoryId === targetRepositoryId && Boolean(repository.repoDir)
    );
  }

  return true;
}

function executorCommand(executor: string) {
  const commands: Record<string, string> = {
    codex_cli: 'codex',
    kimi_cli: 'kimi',
    claude_code_cli: 'claude',
  };
  return commands[executor] ?? '';
}

function executorLabel(executor: string) {
  const labels: Record<string, string> = {
    codex_cli: 'Codex CLI',
    kimi_cli: 'Kimi CLI',
    claude_code_cli: 'Claude Code CLI',
  };
  return labels[executor] ?? executor;
}
