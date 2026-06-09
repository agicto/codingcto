import type { ExecutionReadiness } from '@/features/specforge/execution-readiness';
import type { QualityGateSummary } from '@/features/specforge/quality-gates';
import { repoWikiPlanningContext } from '@/features/specforge/repo-wiki-planning-context';
import { nextBlockedNode, nextReviewableNode } from '@/features/specforge/delivery-status';
import type { ExecutionRun, PlanBundle } from '@/features/specforge/types';

export type DeliveryWorkflowStepState = 'ready' | 'waiting' | 'blocked' | 'active';

export interface DeliveryWorkflowStep {
  id: string;
  label: string;
  state: DeliveryWorkflowStepState;
  owner: string;
  evidence: string;
  nextAction: string;
}

export interface DeliveryWorkflowSummary {
  currentStepId: string;
  currentStepLabel: string;
  headline: string;
  nextAction: string;
  blockedReasons: string[];
  readyCount: number;
  totalCount: number;
  steps: DeliveryWorkflowStep[];
}

export function deliveryWorkflowSummary({
  plan,
  hasPlan,
  approved,
  run,
  executionReadiness,
  qualityGates,
  skillRunCount,
}: {
  plan: PlanBundle;
  hasPlan: boolean;
  approved: boolean;
  run: ExecutionRun;
  executionReadiness: ExecutionReadiness;
  qualityGates: QualityGateSummary[];
  skillRunCount: number;
}): DeliveryWorkflowSummary {
  const wikiContext = repoWikiPlanningContext(plan.repoProfile);
  const blockedGates = qualityGates.filter(gate => gate.state === 'blocked');
  const nextBlocked = nextBlockedNode(run.tasks);
  const nextReviewable = nextReviewableNode(run.tasks);
  const runStarted = run.status !== 'idle' && run.tasks.length > 0;
  const allRunTasksDelivered =
    run.tasks.length > 0 &&
    run.tasks.every(task => ['completed', 'merged', 'ready_for_review'].includes(task.status));

  const steps: DeliveryWorkflowStep[] = [
    {
      id: 'idea',
      label: 'Idea',
      state: hasPlan ? 'ready' : 'waiting',
      owner: '产品专家',
      evidence: hasPlan ? `${plan.productSpec.goals.length} 个目标` : '等待需求输入',
      nextAction: hasPlan ? '继续检查 Wiki 和计划。' : '录入需求，生成 PRD 和技术计划。',
    },
    {
      id: 'wiki',
      label: 'Repo Wiki',
      state: wikiContext.state === 'blocked' ? 'blocked' : wikiContext.state,
      owner: '仓库理解',
      evidence: `${wikiContext.readyCount}/${wikiContext.totalCount} 项 · ${wikiContext.scorePercent}%`,
      nextAction:
        wikiContext.state === 'blocked'
          ? '生成或补齐 Repo Wiki，让专家基于仓库事实写计划。'
          : '把 Wiki 作为 PRD、架构计划和 Prompt 的上下文。',
    },
    {
      id: 'plan',
      label: '专家计划',
      state: !hasPlan ? 'waiting' : approved ? 'ready' : 'blocked',
      owner: '产品 / 架构 / QA',
      evidence: hasPlan ? `${plan.prNodes.length} 个 PR 节点` : '等待计划',
      nextAction: approved ? '进入 Prompt 和调度检查。' : '评审范围、依赖、风险和执行节点。',
    },
    {
      id: 'prompt',
      label: 'Prompt 契约',
      state: hasPlan && plan.prNodes.length > 0 ? 'ready' : 'waiting',
      owner: 'Prompt 编译器',
      evidence: `${skillRunCount} 条 Skill 证据`,
      nextAction: '确认每个 PR 节点包含目标、非目标、文件范围、测试和报告格式。',
    },
    {
      id: 'runtime',
      label: 'Codex runtime',
      state: executionReadiness.canDispatch ? 'ready' : 'blocked',
      owner: 'Agents',
      evidence: executionReadiness.canDispatch
        ? `${executionReadiness.healthyRuntimeCount} 个可调度 runtime`
        : '无可调度 runtime',
      nextAction: executionReadiness.canDispatch
        ? '可以由计划页启动 Codex。'
        : executionReadiness.reason,
    },
    {
      id: 'quality',
      label: '质量门',
      state: blockedGates.length > 0 ? 'blocked' : qualityGates.some(gate => gate.state === 'waiting') ? 'waiting' : 'ready',
      owner: 'QA / 评审',
      evidence: blockedGates.length > 0 ? `${blockedGates.length} 个阻塞` : `${qualityGates.length} 个质量门`,
      nextAction:
        blockedGates.length > 0
          ? '先处理阻塞质量门，再调度 Codex。'
          : '执行后继续收集 PR、CI、审查和恢复证据。',
    },
    {
      id: 'dispatch',
      label: '调度执行',
      state: runStarted ? 'active' : approved && executionReadiness.canDispatch && blockedGates.length === 0 ? 'waiting' : 'blocked',
      owner: '交付看板',
      evidence: runStarted ? `${run.tasks.length} 个任务` : '尚未启动',
      nextAction: runStarted ? '查看运行事件和 PR 状态。' : '审批计划并启动选中的 PR 节点。',
    },
    {
      id: 'review',
      label: 'PR 评审',
      state: nextBlocked ? 'blocked' : nextReviewable || allRunTasksDelivered ? 'ready' : runStarted ? 'waiting' : 'waiting',
      owner: '评审看板',
      evidence: nextBlocked
        ? nextBlocked.nodeKey
        : nextReviewable
          ? nextReviewable.nodeKey
          : allRunTasksDelivered
            ? '可评审'
            : '等待 PR',
      nextAction: nextBlocked
        ? `处理 ${nextBlocked.nodeKey} 的失败、修复或人工决策。`
        : nextReviewable
          ? `评审 ${nextReviewable.nodeKey} 并决定是否 review_patch。`
          : '等待 Codex 创建 PR、CI 和测试结果。',
    },
  ];

  const currentStep =
    steps.find(step => step.state === 'blocked') ??
    steps.find(step => step.state === 'active') ??
    steps.find(step => step.state === 'waiting') ??
    steps.at(-1)!;
  const blockedReasons = steps
    .filter(step => step.state === 'blocked')
    .map(step => `${step.label}: ${step.nextAction}`);
  const readyCount = steps.filter(step => step.state === 'ready').length;

  return {
    currentStepId: currentStep.id,
    currentStepLabel: currentStep.label,
    headline: blockedReasons.length
      ? `${currentStep.label} 需要处理`
      : currentStep.state === 'active'
        ? `${currentStep.label} 进行中`
        : `${currentStep.label} 是下一步`,
    nextAction: currentStep.nextAction,
    blockedReasons,
    readyCount,
    totalCount: steps.length,
    steps,
  };
}
