import type { ExecutionReadiness } from '@/features/specforge/execution-readiness';
import type { TaskEventEvidence } from '@/features/specforge/task-event-summary';
import { summarizeTaskEvents } from '@/features/specforge/task-event-summary';
import type { ExecutionRun, PlanBundle } from '@/features/specforge/types';

export type DeliveryEvidenceState = 'proven' | 'partial' | 'missing';

export interface DeliveryEvidenceItem {
  id: string;
  label: string;
  state: DeliveryEvidenceState;
  evidence: string;
  nextAction: string;
}

export interface DeliveryEvidenceLedger {
  provenCount: number;
  totalCount: number;
  headline: string;
  nextGap: string;
  completionAudit: DeliveryCompletionAudit;
  items: DeliveryEvidenceItem[];
}

export interface DeliveryCompletionAudit {
  complete: boolean;
  statusLabel: 'complete' | 'incomplete';
  summary: string;
  missingProofCount: number;
  partialProofCount: number;
  nextRequiredProof: string;
}

export function deliveryEvidenceLedger({
  plan,
  hasPlan,
  approved,
  run,
  wikiScorePercent,
  skillRunCount,
  executionReadiness,
  projectProofTaskStatus,
  projectProofEvents,
}: {
  plan: PlanBundle;
  hasPlan: boolean;
  approved: boolean;
  run: ExecutionRun;
  wikiScorePercent: number;
  skillRunCount: number;
  executionReadiness: ExecutionReadiness;
  projectProofTaskStatus?: string;
  projectProofEvents: TaskEventEvidence[];
}): DeliveryEvidenceLedger {
  const proofSummary = summarizeTaskEvents(projectProofEvents);
  const backendTaskCount = run.tasks.filter(task => Boolean(task.taskId)).length;
  const claimedTaskCount = run.tasks.filter(task => Boolean(task.runtimeId)).length;
  const openedPRCount = run.tasks.filter(task => Boolean(task.githubPrUrl)).length;
  const completedTaskCount = run.tasks.filter(task =>
    ['completed', 'ready_for_review', 'merged'].includes(task.status)
  ).length;

  const items: DeliveryEvidenceItem[] = [
    {
      id: 'idea',
      label: '需求已进入产品计划',
      state: hasPlan ? 'proven' : 'missing',
      evidence: hasPlan ? `${plan.productSpec.goals.length} 个目标` : '暂无计划',
      nextAction: hasPlan ? '继续检查专家计划。' : '录入需求并生成 PRD。',
    },
    {
      id: 'wiki',
      label: 'Repo Wiki 可供专家引用',
      state: wikiScorePercent >= 80 ? 'proven' : wikiScorePercent > 0 ? 'partial' : 'missing',
      evidence: `${wikiScorePercent}% 完整度`,
      nextAction:
        wikiScorePercent >= 80
          ? 'Wiki 可继续进入 Prompt 证据链。'
          : '补齐仓库结构、入口、测试、风险和约定。',
    },
    {
      id: 'experts',
      label: '专家计划和任务拆解已确认',
      state: approved ? 'proven' : hasPlan ? 'partial' : 'missing',
      evidence: hasPlan ? `${plan.prNodes.length} 个 PR 节点，${skillRunCount} 条 Skill 证据` : '暂无专家输出',
      nextAction: approved ? '可以进入正式调度。' : '评审并审批计划、风险和执行范围。',
    },
    {
      id: 'prompt',
      label: 'Coding Agent Prompt 契约已形成',
      state: hasPlan && plan.prNodes.length > 0 ? 'proven' : 'missing',
      evidence: hasPlan ? `${plan.prNodes.length} 个节点包含范围、测试和 non-goals` : '等待计划',
      nextAction: hasPlan ? '检查 Prompt 预览。' : '生成计划后再编译 Prompt。',
    },
    {
      id: 'runtime-proof',
      label: '平台能调度本地 CLI',
      state: proofSummary.hasRuntimeClaim && proofSummary.hasExecutorResult
        ? 'proven'
        : executionReadiness.canDispatch || projectProofTaskStatus
          ? 'partial'
          : 'missing',
      evidence:
        proofSummary.hasExecutorResult
          ? `${proofSummary.outputEventCount} 个输出事件`
          : executionReadiness.canDispatch
            ? `${executionReadiness.healthyRuntimeCount} 个 runtime 在线`
            : executionReadiness.reason,
      nextAction:
        proofSummary.hasRuntimeClaim && proofSummary.hasExecutorResult
          ? '只读调度证明已完成。'
          : '在运行页执行项目级只读调度验证。',
    },
    {
      id: 'formal-dispatch',
      label: '正式 PR 节点已派发',
      state: claimedTaskCount > 0 ? 'proven' : backendTaskCount > 0 ? 'partial' : 'missing',
      evidence:
        backendTaskCount > 0
          ? `${backendTaskCount} 个后端任务，${claimedTaskCount} 个已领取`
          : '尚未创建正式后端任务',
      nextAction:
        backendTaskCount > 0
          ? '保持 runtime 运行并查看事件日志。'
          : '审批计划并启动选中的 PR 节点。',
    },
    {
      id: 'pr-delivery',
      label: 'PR 交付证据已回流',
      state: openedPRCount > 0 ? 'proven' : completedTaskCount > 0 ? 'partial' : 'missing',
      evidence:
        openedPRCount > 0
          ? `${openedPRCount} 个 GitHub PR`
          : completedTaskCount > 0
            ? `${completedTaskCount} 个任务已完成，等待 PR`
            : '暂无 PR 链接',
      nextAction:
        openedPRCount > 0
          ? '进入评审、CI 和合并。'
          : '等待 Codex 完成任务并创建 PR。',
    },
  ];
  const provenCount = items.filter(item => item.state === 'proven').length;
  const nextGapItem = items.find(item => item.state !== 'proven');
  const missingProofCount = items.filter(item => item.state === 'missing').length;
  const partialProofCount = items.filter(item => item.state === 'partial').length;
  const complete = provenCount === items.length;

  return {
    provenCount,
    totalCount: items.length,
    headline:
      complete
        ? '端到端交付证据已完整。'
        : `${provenCount}/${items.length} 个端到端证据已完成。`,
    nextGap: nextGapItem ? `${nextGapItem.label}: ${nextGapItem.nextAction}` : '可以准备合并。',
    completionAudit: {
      complete,
      statusLabel: complete ? 'complete' : 'incomplete',
      summary: complete
        ? 'Completion is proven: requirement, Wiki, plan, Prompt, runtime dispatch, formal PR dispatch, and PR delivery evidence are all present.'
        : 'Completion is not proven yet. Do not mark the end-to-end workflow complete until every required delivery proof is present.',
      missingProofCount,
      partialProofCount,
      nextRequiredProof: nextGapItem
        ? `${nextGapItem.label}: ${nextGapItem.nextAction}`
        : 'All required proof is present.',
    },
    items,
  };
}
