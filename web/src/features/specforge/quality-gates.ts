import type { ExecutionRun, PlanBundle } from '@/features/specforge/types';

export type QualityGateState = 'ready' | 'waiting' | 'blocked';

export interface QualityGateSummary {
  id: string;
  label: string;
  state: QualityGateState;
  detail: string;
}

export interface QualityGateDecisionState {
  riskAccepted?: boolean;
  githubReady?: boolean;
  githubChecking?: boolean;
  githubBlockingCheckCount?: number;
}

export function qualityGatesForPlanDelivery(
  plan: PlanBundle,
  hasPlan: boolean,
  run: ExecutionRun,
  decisions: QualityGateDecisionState = {}
): QualityGateSummary[] {
  const planNodes = hasPlan ? plan.prNodes : [];
  const taskNodes = run.tasks.length > 0 && hasPlan ? run.tasks : planNodes;
  const expectedFileCount = planNodes.flatMap(node => node.expectedFiles).length;
  const testCommandCount = planNodes.flatMap(node => node.testCommands).length;
  const repoWikiEvidenceCount = [
    plan.repoProfile.repositoryId,
    plan.repoProfile.summary,
    ...plan.repoProfile.stack,
    ...plan.repoProfile.codingConventions,
    ...plan.repoProfile.riskAreas,
  ].filter(value => value.trim().length > 0).length;
  const highRiskCount =
    planNodes.filter(node => node.estimatedRisk === 'high').length +
    plan.implementationPlan.securityRisks.length +
    plan.implementationPlan.migrationRisks.length;
  const openedPRCount = taskNodes.filter(node => Boolean(node.githubPrUrl)).length;
  const reviewReadyCount = taskNodes.filter(node =>
    ['ready_for_review', 'merged', 'completed'].includes(node.status)
  ).length;
  const blockedCount = taskNodes.filter(node =>
    ['blocked', 'failed', 'cancelled', 'closed'].includes(node.status)
  ).length;
  const githubBlockingCheckCount = decisions.githubBlockingCheckCount ?? 0;

  return [
    {
      id: 'scope',
      label: '范围门',
      state: hasPlan && expectedFileCount > 0 ? 'ready' : 'waiting',
      detail: hasPlan
        ? `${expectedFileCount} 个预期文件约束会进入每个 PR 节点 prompt。`
        : '生成计划后，PR DAG 会定义每个任务的预期文件和非目标。',
    },
    {
      id: 'wiki',
      label: 'Wiki 门',
      state: hasPlan ? (repoWikiEvidenceCount > 1 ? 'ready' : 'blocked') : 'waiting',
      detail: hasPlan
        ? repoWikiEvidenceCount > 1
          ? 'Repo Wiki 证据已进入计划和 Prompt，用于约束专家输出、影响范围和测试策略。'
          : '当前计划缺少可引用的 Repo Wiki；执行前需要生成仓库说明书或补充仓库画像。'
        : '生成计划前，先从 repo 建立 Wiki，让产品和架构专家基于仓库事实写计划。',
    },
    {
      id: 'tests',
      label: '测试门',
      state: hasPlan && testCommandCount > 0 ? 'ready' : hasPlan ? 'blocked' : 'waiting',
      detail: hasPlan
        ? testCommandCount > 0
          ? `${testCommandCount} 条测试命令会要求 Codex 执行并回传结果。`
          : '当前计划没有测试命令；执行前需要补充测试或明确豁免。'
        : '生成计划后，QA 专家会把测试命令绑定到任务。',
    },
    {
      id: 'github',
      label: 'GitHub 门',
      state: !hasPlan
        ? 'waiting'
        : decisions.githubReady
          ? 'ready'
          : decisions.githubChecking
            ? 'waiting'
            : 'blocked',
      detail: !hasPlan
        ? '生成计划后，正式交付前会检查 GitHub 账号连接、访问令牌和仓库写权限。'
        : decisions.githubReady
          ? 'GitHub 连接、访问令牌和 Issues/Contents/Pull requests 权限已通过检查。'
          : decisions.githubChecking
            ? '正在检查 GitHub 连接、token 和仓库权限。'
            : githubBlockingCheckCount > 0
              ? `${githubBlockingCheckCount} 个 GitHub readiness 检查阻塞正式 PR 交付。`
              : 'GitHub readiness 未通过；请连接 GitHub、同步授权仓库，并确认仓库权限。',
    },
    {
      id: 'pr',
      label: 'PR 门',
      state: openedPRCount > 0 ? 'ready' : run.status === 'idle' ? 'waiting' : 'blocked',
      detail:
        openedPRCount > 0
          ? `${openedPRCount} 个任务已经关联 PR。`
          : '执行完成后，CodingCTO 会创建分支、提交变更并打开 PR。',
    },
    {
      id: 'review',
      label: '审查门',
      state: reviewReadyCount > 0 ? 'ready' : 'waiting',
      detail:
        reviewReadyCount > 0
          ? `${reviewReadyCount} 个任务进入可评审或已完成状态。`
          : 'PR 打开后进入代码审查、review patch 和 CI 检查。',
    },
    {
      id: 'risk',
      label: '风险门',
      state: hasPlan
        ? highRiskCount > 0 && !decisions.riskAccepted
          ? 'blocked'
          : 'ready'
        : 'waiting',
      detail: hasPlan
        ? highRiskCount > 0
          ? decisions.riskAccepted
            ? `${highRiskCount} 个高风险/安全/迁移项已由人工确认，执行时仍会进入 Prompt 风险约束。`
            : `${highRiskCount} 个高风险/安全/迁移项需要审批时显式确认。`
          : '当前计划没有高风险、迁移或安全阻塞项。'
        : '生成计划后会汇总安全、迁移和高风险 PR 节点。',
    },
    {
      id: 'recovery',
      label: '恢复门',
      state: blockedCount > 0 ? 'blocked' : run.status === 'idle' ? 'waiting' : 'ready',
      detail:
        blockedCount > 0
          ? `${blockedCount} 个任务失败或阻塞，需要 fix / review_patch 或人工决策。`
          : '失败后会进入修复尝试、CI 日志读取、升级摘要和重试额度控制。',
    },
  ];
}
