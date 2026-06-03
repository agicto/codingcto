import type { PRNode } from '@/features/specforge/types';

export interface VerificationReview {
  state:
    | 'not_started'
    | 'ready'
    | 'running'
    | 'blocked'
    | 'needs_review'
    | 'complete';
  label: string;
  headline: string;
  nextAction: string;
  autoFixBudget: string;
  failedNodes: PRNode[];
  ciNodes: PRNode[];
  reviewableNodes: PRNode[];
}

const maxFixAttemptsPerNode = 3;

export function verificationReviewForNodes(nodes: PRNode[]): VerificationReview {
  const failedNodes = orderedNodes(
    nodes.filter(node =>
      ['blocked', 'failed', 'cancelled', 'closed'].includes(node.status)
    )
  );
  const ciNodes = orderedNodes(nodes.filter(node => node.status === 'ci_running'));
  const reviewableNodes = orderedNodes(
    nodes.filter(node => ['pr_opened', 'ready_for_review'].includes(node.status))
  );
  const completeNodes = nodes.filter(node => ['merged', 'completed'].includes(node.status));

  if (nodes.length === 0) {
    return {
      state: 'not_started',
      label: '暂无 PR 节点',
      headline: '当前还没有可验证的 PR 节点。',
      nextAction: '请先生成并确认计划，再进行 CI 验证。',
      autoFixBudget: budgetLabel(),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (failedNodes.length > 0) {
    const node = failedNodes[0];
    return {
      state: 'blocked',
      label: '需要决策',
      headline: `${node.nodeKey} 需要诊断 CI 或人工决策。`,
      nextAction: failureAction(node.failureReason),
      autoFixBudget: budgetLabel(node),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (ciNodes.length > 0) {
    return {
      state: 'running',
      label: 'CI 运行中',
      headline: `${ciNodes[0].nodeKey} 正在等待 CI 验证。`,
      nextAction: '等待 GitHub Actions 完成后，再重新验证 CI。',
      autoFixBudget: budgetLabel(ciNodes[0]),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (reviewableNodes.length > 0) {
    return {
      state: 'needs_review',
      label: '评审 PR',
      headline: `${reviewableNodes[0].nodeKey} 已准备好人工评审。`,
      nextAction: '评审并合并 GitHub PR 后，依赖它的 PR 节点会继续解锁。',
      autoFixBudget: budgetLabel(reviewableNodes[0]),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (completeNodes.length === nodes.length) {
    return {
      state: 'complete',
      label: '已验证',
      headline: '所有选中的 PR 节点都已完成验证。',
      nextAction: '请评审并合并已交付的 Pull Request。',
      autoFixBudget: budgetLabel(),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  return {
    state: 'ready',
    label: '待验证',
    headline: '运行器打开 PR 后，会开始验证流程。',
    nextAction:
      'CodingCTO 会刷新 CI、识别失败类型，并在达到自动修复预算或遇到高风险失败时停下来。',
    autoFixBudget: budgetLabel(),
    failedNodes,
    ciNodes,
    reviewableNodes,
  };
}

function budgetLabel(node?: PRNode) {
  const used = Math.max(0, node?.attemptNumber ?? 0);
  const remaining = Math.max(0, maxFixAttemptsPerNode - used);
  return `当前 PR 节点还剩 ${remaining} / ${maxFixAttemptsPerNode} 次自动修复机会。`;
}

function failureAction(failureReason?: string) {
  if (!failureReason) {
    return '请先验证 CI、识别失败类型，再决定是否派发一次受控修复。';
  }

  const normalized = failureReason.replace(/_/g, ' ');
  return `请确认 ${normalized} 失败类型，查看失败日志后，再派发受控修复或升级为人工决策。`;
}

function orderedNodes(nodes: PRNode[]) {
  return nodes.slice().sort((a, b) => a.order - b.order);
}
