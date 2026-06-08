import type { ExecutionRun } from '@/features/specforge/types';
import type { TaskEventEvidence } from '@/features/specforge/task-event-summary';
import { summarizeTaskEvents } from '@/features/specforge/task-event-summary';

export type DispatchProofState = 'proven' | 'partial' | 'missing';

export interface DispatchProofLane {
  id: 'direct-proof' | 'formal-dispatch';
  label: string;
  state: DispatchProofState;
  evidence: string;
  nextAction: string;
}

export interface DispatchProofSeparationSummary {
  headline: string;
  directProofState: DispatchProofState;
  formalDispatchState: DispatchProofState;
  canClaimFormalDelivery: boolean;
  lanes: DispatchProofLane[];
}

export function isCodingCTODispatchProofTaskTitle(title: string) {
  const normalized = title.trim().toLowerCase();
  return normalized.includes('codingcto') && normalized.includes('dispatch proof');
}

export function dispatchProofSeparationSummary({
  run,
  directTaskStatus,
  directTaskEvents,
  formalBlockedReasons = [],
}: {
  run: ExecutionRun;
  directTaskStatus?: string;
  directTaskEvents: TaskEventEvidence[];
  formalBlockedReasons?: string[];
}): DispatchProofSeparationSummary {
  const directSummary = summarizeTaskEvents(directTaskEvents);
  const directProofState =
    directSummary.hasRuntimeClaim && directSummary.hasExecutorResult
      ? 'proven'
      : directTaskStatus || directTaskEvents.length > 0
        ? 'partial'
        : 'missing';
  const backendTaskCount = run.tasks.filter(task => Boolean(task.taskId)).length;
  const claimedTaskCount = run.tasks.filter(task => Boolean(task.runtimeId)).length;
  const hasFormalBlockers = formalBlockedReasons.length > 0;
  const formalDispatchState =
    claimedTaskCount > 0 ? 'proven' : backendTaskCount > 0 ? 'partial' : 'missing';

  const lanes: DispatchProofLane[] = [
    {
      id: 'direct-proof',
      label: '只读调度验证',
      state: directProofState,
      evidence:
        directProofState === 'proven'
          ? `${directSummary.outputEventCount} 个输出事件，已证明平台能命令本地 Codex。`
          : directProofState === 'partial'
            ? `${directTaskStatus ?? directSummary.proofLabel}，尚未形成完整执行结果。`
            : '尚未运行项目级只读验证。',
      nextAction:
        directProofState === 'proven'
          ? '继续用正式计划审批来创建 PR 节点任务。'
          : '运行项目级只读验证，确认 runtime token、仓库路径和 Codex CLI 可用。',
    },
    {
      id: 'formal-dispatch',
      label: '正式 PR 节点派发',
      state: formalDispatchState,
      evidence:
        backendTaskCount > 0
          ? `${backendTaskCount} 个后端任务，${claimedTaskCount} 个已被 runtime 领取。`
          : hasFormalBlockers
            ? `${formalBlockedReasons.length} 个质量门阻塞正式 PR 派发：${formalBlockedReasons.join('、')}。`
          : '尚未创建正式 PR 节点后端任务。',
      nextAction:
        formalDispatchState === 'proven'
          ? '查看任务事件、测试输出、PR 链接和 CI 状态。'
          : backendTaskCount > 0
            ? '保持 ccto daemon 运行，等待 runtime claim。'
            : hasFormalBlockers
              ? '先处理阻塞质量门，再回到计划页审批并启动选中的 PR 节点。'
            : '回到计划页审批并启动选中的 PR 节点。',
    },
  ];

  return {
    headline:
      formalDispatchState === 'proven'
        ? '正式 PR 节点已经进入本地 Codex 执行链路。'
        : hasFormalBlockers
          ? '只读调度可以证明本地 Codex 链路；正式 PR 派发仍被质量门阻塞。'
        : directProofState === 'proven'
          ? '只读调度已证明，但正式 PR 节点还没有完成派发。'
          : '调度证明尚未完整。',
    directProofState,
    formalDispatchState,
    canClaimFormalDelivery: formalDispatchState === 'proven',
    lanes,
  };
}
