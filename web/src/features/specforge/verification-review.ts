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
      label: 'No PR nodes',
      headline: 'No PR nodes are available for verification.',
      nextAction: 'Generate and approve a plan before CI verification.',
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
      label: 'Decision needed',
      headline: `${node.nodeKey} needs CI diagnosis or an escalation decision.`,
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
      label: 'CI running',
      headline: `${ciNodes[0].nodeKey} is waiting on CI verification.`,
      nextAction: 'Wait for GitHub Actions to finish, then verify CI again.',
      autoFixBudget: budgetLabel(ciNodes[0]),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (reviewableNodes.length > 0) {
    return {
      state: 'needs_review',
      label: 'Review PR',
      headline: `${reviewableNodes[0].nodeKey} is ready for human review.`,
      nextAction: 'Review the GitHub pull request, merge it, then unlock dependent PR nodes.',
      autoFixBudget: budgetLabel(reviewableNodes[0]),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  if (completeNodes.length === nodes.length) {
    return {
      state: 'complete',
      label: 'Verified',
      headline: 'All selected PR nodes have completed verification.',
      nextAction: 'Review and merge the delivered pull requests.',
      autoFixBudget: budgetLabel(),
      failedNodes,
      ciNodes,
      reviewableNodes,
    };
  }

  return {
    state: 'ready',
    label: 'Guarded',
    headline: 'Verification will start after runtime delivery opens PRs.',
    nextAction:
      'CodingCTO will refresh CI, classify failures, and stop at the auto-fix budget or risky failure types.',
    autoFixBudget: budgetLabel(),
    failedNodes,
    ciNodes,
    reviewableNodes,
  };
}

function budgetLabel(node?: PRNode) {
  const used = Math.max(0, node?.attemptNumber ?? 0);
  const remaining = Math.max(0, maxFixAttemptsPerNode - used);
  return `${remaining} of ${maxFixAttemptsPerNode} automatic fix attempts remain for the active PR node.`;
}

function failureAction(failureReason?: string) {
  if (!failureReason) {
    return 'Verify CI, classify the failure, then queue a bounded fix attempt.';
  }

  const normalized = failureReason.replace(/_/g, ' ');
  return `Classify the ${normalized} failure, inspect the failing logs, then queue a bounded fix attempt or escalate for a product decision.`;
}

function orderedNodes(nodes: PRNode[]) {
  return nodes.slice().sort((a, b) => a.order - b.order);
}
