import type { ExecutionRun } from '@/features/specforge/types';

export type ExecutionHandoffState =
  | 'not_started'
  | 'dispatched'
  | 'waiting_claim'
  | 'claimed'
  | 'blocked'
  | 'completed';

export interface ExecutionHandoffSummary {
  state: ExecutionHandoffState;
  totalTasks: number;
  backendTaskCount: number;
  claimedTaskCount: number;
  processProblemCount: number;
  headline: string;
  nextAction: string;
}

export function executionHandoffSummary(run: ExecutionRun): ExecutionHandoffSummary {
  const totalTasks = run.tasks.length;
  const backendTaskCount = run.tasks.filter(task => Boolean(task.taskId)).length;
  const claimedTaskCount = run.tasks.filter(task => Boolean(task.runtimeId)).length;
  const processProblemCount = run.tasks.filter(task =>
    ['failed', 'timed_out', 'cancelled', 'lost'].includes(task.processStatus ?? '')
  ).length;

  if (run.status === 'idle' || totalTasks === 0) {
    return {
      state: 'not_started',
      totalTasks,
      backendTaskCount,
      claimedTaskCount,
      processProblemCount,
      headline: '尚未创建执行运行。',
      nextAction: '回到计划页审批并启动选中的 PR 节点。',
    };
  }

  if (processProblemCount > 0 || run.status === 'blocked') {
    return {
      state: 'blocked',
      totalTasks,
      backendTaskCount,
      claimedTaskCount,
      processProblemCount,
      headline: `${processProblemCount || totalTasks} 个执行任务需要处理。`,
      nextAction: '打开任务事件，查看失败日志、重试或创建 review_patch。',
    };
  }

  if (run.status === 'completed') {
    return {
      state: 'completed',
      totalTasks,
      backendTaskCount,
      claimedTaskCount,
      processProblemCount,
      headline: '执行运行已完成。',
      nextAction: '检查 PR、CI、评审状态和最终交付摘要。',
    };
  }

  if (backendTaskCount > 0 && claimedTaskCount === 0) {
    return {
      state: 'waiting_claim',
      totalTasks,
      backendTaskCount,
      claimedTaskCount,
      processProblemCount,
      headline: `${backendTaskCount}/${totalTasks} 个任务已派发，等待 runtime 领取。`,
      nextAction: '保持 ccto daemon 运行；领取后会出现 runtime id、attempt 和事件日志。',
    };
  }

  if (claimedTaskCount > 0) {
    return {
      state: 'claimed',
      totalTasks,
      backendTaskCount,
      claimedTaskCount,
      processProblemCount,
      headline: `${claimedTaskCount}/${totalTasks} 个任务已被 runtime 领取。`,
      nextAction: '查看任务事件和进程状态，等待 Codex 输出测试与 PR 信息。',
    };
  }

  return {
    state: 'dispatched',
    totalTasks,
    backendTaskCount,
    claimedTaskCount,
    processProblemCount,
    headline: '运行已启动，正在创建或派发任务。',
    nextAction: '如果长时间没有后端任务，检查 API、计划审批状态和 runtime 连接。',
  };
}
