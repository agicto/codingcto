import { isPRNodeActive, isPRNodeDelivered } from '@/features/specforge/status';
import type { CompilePromptPayload } from '@/features/specforge/services/specforge-service';
import type { PRNode } from '@/features/specforge/types';

export const statusLabel: Record<PRNode['status'], string> = {
  planned: 'Planned',
  queued: 'Queued',
  running: 'Running',
  waiting_on_dependencies: 'Waiting',
  pr_opened: 'PR opened',
  ci_running: 'CI running',
  ready_for_review: 'Ready',
  blocked: 'Blocked',
  merged: 'Merged',
  closed: 'Closed',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const maxFixAttemptsPerNode = 3;

export type PromptMode = NonNullable<CompilePromptPayload['type']>;

export const promptModes: PromptMode[] = ['implementation', 'fix', 'review_patch'];

export const promptModeLabel: Record<PromptMode, string> = {
  implementation: 'Implement',
  fix: 'Fix',
  review_patch: 'Review',
};

export function statusClassName(status: PRNode['status'] | string) {
  const nodeStatus = status as PRNode['status'];
  if (isPRNodeDelivered(nodeStatus)) {
    return 'border-success/30 bg-success-subtle text-success';
  }
  if (isPRNodeActive(nodeStatus)) {
    return 'border-info/30 bg-info-subtle text-info';
  }
  if (status === 'waiting_on_dependencies' || status === 'pr_opened') {
    return 'border-warning/30 bg-warning-subtle text-warning';
  }
  if (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'blocked' ||
    status === 'closed'
  ) {
    return 'border-error/30 bg-error-subtle text-error';
  }
  return 'border-border bg-bg-surface text-text-subtle';
}

export function repoProfileSourceLabel(source: string) {
  switch (source) {
    case 'github_tree':
      return 'GitHub tree';
    case 'request_hints':
      return 'Request hints';
    case 'manual':
      return 'Manual profile';
    case 'demo':
      return 'Demo profile';
    default:
      return 'Unknown source';
  }
}

export function formatTimestamp(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleString();
}

export function riskClassName(risk: PRNode['estimatedRisk']) {
  if (risk === 'high') {
    return 'border-error/30 bg-error-subtle text-error';
  }
  if (risk === 'medium') {
    return 'border-warning/30 bg-warning-subtle text-warning';
  }
  return 'border-success/30 bg-success-subtle text-success';
}
