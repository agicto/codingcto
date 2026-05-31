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
    return '还没有开始执行。';
  }
  if (blocked > 0 || failed > 0 || runStatus === 'blocked') {
    return '交付已阻塞，需要做出决策。';
  }
  if (ready === total) {
    return '所有选中的 PR 节点都已可评审。';
  }
  if (runStatus === 'cancelled') {
    return '执行已取消，仍有 PR 节点未交付。';
  }
  return `${ready} / ${total} 个 PR 节点已可评审。`;
}

function deliveryNextAction(
  run: ExecutionRun,
  counts: Omit<DeliverySummary, 'headline' | 'nextAction' | 'progressPercent'>
) {
  const blockedNode = nextBlockedNode(run.tasks);
  if (blockedNode) {
    return `处理 ${blockedNode.nodeKey}：${blockedNode.title}`;
  }

  if (counts.total > 0 && counts.ready === counts.total) {
    return '评审并合并已交付的 GitHub Pull Request。';
  }

  const reviewableNode = nextReviewableNode(run.tasks);
  if (reviewableNode) {
    return `评审 ${reviewableNode.nodeKey}：${reviewableNode.title}`;
  }

  if (counts.active > 0) {
    return '等待执行中的 PR 节点完成实现或 CI。';
  }

  if (counts.waiting > 0) {
    return '等待中的 PR 节点会在依赖交付后解锁。';
  }

  return '批准方案并启动执行。';
}
