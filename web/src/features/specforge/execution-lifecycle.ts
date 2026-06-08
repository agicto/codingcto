import type { ExecutionRun } from '@/features/specforge/types';

export type ExecutionLifecycleState = 'ready' | 'active' | 'waiting' | 'blocked';

export interface ExecutionLifecycleStep {
  id: 'approval' | 'dispatch' | 'claim' | 'events' | 'pr' | 'recovery';
  label: string;
  state: ExecutionLifecycleState;
  detail: string;
}

export function executionLifecycleSteps({
  approved,
  run,
}: {
  approved: boolean;
  run: ExecutionRun;
}): ExecutionLifecycleStep[] {
  const taskCount = run.tasks.length;
  const selectedCount = run.selectedPRNodeIds.length || taskCount;
  const taskBackedCount = run.tasks.filter(task => Boolean(task.taskId)).length;
  const claimedCount = run.tasks.filter(task => Boolean(task.runtimeId)).length;
  const processProblemCount = run.tasks.filter(task =>
    ['failed', 'timed_out', 'cancelled', 'lost'].includes(task.processStatus ?? '')
  ).length;
  const activeCount = run.tasks.filter(task =>
    ['queued', 'running', 'waiting_on_dependencies', 'ci_running'].includes(task.status)
  ).length;
  const prCount = run.tasks.filter(task => Boolean(task.githubPrUrl)).length;
  const blockedCount = run.tasks.filter(task =>
    ['blocked', 'failed', 'cancelled', 'closed'].includes(task.status)
  ).length;
  const deliveredCount = run.tasks.filter(task =>
    ['ready_for_review', 'merged', 'completed'].includes(task.status)
  ).length;

  return [
    {
      id: 'approval',
      label: '计划审批',
      state: approved ? 'ready' : 'waiting',
      detail: approved
        ? '计划已审批，可以创建执行运行。'
        : '先在计划页审批 PRD、PR DAG、Prompt 和质量门。',
    },
    {
      id: 'dispatch',
      label: '任务派发',
      state:
        run.status === 'idle'
          ? 'waiting'
          : taskBackedCount > 0 || run.status === 'queued' || run.status === 'running'
            ? 'active'
            : 'waiting',
      detail:
        run.status === 'idle'
          ? `等待审批并启动 ${selectedCount} 个 PR 节点。`
          : taskBackedCount > 0
            ? `${taskBackedCount}/${taskCount} 个任务已在后端创建。`
            : '运行已创建，等待后端派发任务。',
    },
    {
      id: 'claim',
      label: 'Runtime 领取',
      state:
        run.status === 'idle'
          ? 'waiting'
          : processProblemCount > 0
            ? 'blocked'
          : claimedCount > 0
            ? 'active'
            : run.status === 'blocked'
              ? 'blocked'
              : 'waiting',
      detail:
        processProblemCount > 0
          ? `${processProblemCount} 个已领取任务的进程失败、超时、取消或丢失。`
          : claimedCount > 0
          ? `${claimedCount}/${taskCount} 个任务已被运行器领取。`
          : '运行器领取任务后，会显示 runtime id、attempt 和执行器。',
    },
    {
      id: 'events',
      label: '事件日志',
      state: activeCount > 0 ? 'active' : deliveredCount > 0 ? 'ready' : 'waiting',
      detail:
        activeCount > 0
          ? `${activeCount} 个任务正在等待、执行或检查 CI。`
          : '点击任务的“事件”查看 prompt、stdout/stderr、测试和工具调用记录。',
    },
    {
      id: 'pr',
      label: 'PR 回流',
      state: prCount > 0 ? 'ready' : run.status === 'idle' ? 'waiting' : 'waiting',
      detail:
        prCount > 0
          ? `${prCount} 个任务已关联 GitHub PR。`
          : '任务完成后会回填分支、PR 链接、CI 和评审状态。',
    },
    {
      id: 'recovery',
      label: '失败恢复',
      state: blockedCount > 0 ? 'blocked' : run.status === 'idle' ? 'waiting' : 'ready',
      detail:
        blockedCount > 0
          ? `${blockedCount} 个任务需要重试、review patch 或人工决策。`
          : '失败后可在这里重试任务，或从评审反馈创建修订任务。',
    },
  ];
}
