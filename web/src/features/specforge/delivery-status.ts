import type { ExecutionRun, PRNode } from '@/features/specforge/types';
import { isPRNodeActive, isPRNodeDelivered } from '@/features/specforge/status';

export interface DeliverySummary {
  total: number;
  ready: number;
  active: number;
  blocked: number;
  waiting: number;
  failed: number;
  merged: number;
  progressPercent: number;
  headline: string;
  nextAction: string;
}

export function summarizeDeliveryRun(run: ExecutionRun): DeliverySummary {
  const total = run.tasks.length;
  const ready = run.tasks.filter(task => isPRNodeDelivered(task.status)).length;
  const active = run.tasks.filter(task => isPRNodeActive(task.status)).length;
  const blocked = run.tasks.filter(
    task => task.status === 'blocked' || task.status === 'closed'
  ).length;
  const waiting = run.tasks.filter(
    task => task.status === 'waiting_on_dependencies' || task.status === 'queued'
  ).length;
  const failed = run.tasks.filter(task => task.status === 'failed' || task.status === 'cancelled').length;
  const merged = run.tasks.filter(task => task.status === 'merged').length;
  const progressPercent = total === 0 ? 0 : Math.round((ready / total) * 100);

  return {
    total,
    ready,
    active,
    blocked,
    waiting,
    failed,
    merged,
    progressPercent,
    headline: deliveryHeadline(run.status, total, ready, blocked, failed),
    nextAction: deliveryNextAction(run, { total, ready, active, blocked, waiting, failed, merged }),
  };
}

export function nextReviewableNode(tasks: PRNode[]) {
  return tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .find(task => task.status === 'ready_for_review' || task.status === 'pr_opened');
}

export function nextBlockedNode(tasks: PRNode[]) {
  return tasks
    .slice()
    .sort((a, b) => a.order - b.order)
    .find(task => task.status === 'blocked' || task.status === 'failed' || task.status === 'cancelled');
}

function deliveryHeadline(
  runStatus: ExecutionRun['status'],
  total: number,
  ready: number,
  blocked: number,
  failed: number
) {
  if (runStatus === 'idle' || total === 0) {
    return 'No execution run has started.';
  }
  if (blocked > 0 || failed > 0 || runStatus === 'blocked') {
    return 'Delivery is blocked and needs a decision.';
  }
  if (ready === total) {
    return 'All selected PR nodes are ready for review.';
  }
  if (runStatus === 'cancelled') {
    return 'Execution was cancelled before all PR nodes were delivered.';
  }
  return `${ready} of ${total} PR nodes are ready for review.`;
}

function deliveryNextAction(
  run: ExecutionRun,
  counts: Omit<DeliverySummary, 'headline' | 'nextAction' | 'progressPercent'>
) {
  const blockedNode = nextBlockedNode(run.tasks);
  if (blockedNode) {
    return `Resolve ${blockedNode.nodeKey}: ${blockedNode.title}`;
  }

  if (counts.total > 0 && counts.ready === counts.total) {
    return 'Review and merge the delivered GitHub pull requests.';
  }

  const reviewableNode = nextReviewableNode(run.tasks);
  if (reviewableNode) {
    return `Review ${reviewableNode.nodeKey}: ${reviewableNode.title}`;
  }

  if (counts.active > 0) {
    return 'Wait for the active PR node to finish execution or CI.';
  }

  if (counts.waiting > 0) {
    return 'Waiting PR nodes will unlock after their dependencies are delivered.';
  }

  return 'Approve a plan and start an execution run.';
}
