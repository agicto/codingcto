import type { GitHubWebhookEventDTO } from '@/features/specforge/services/specforge-service';

interface ParsedWebhookPayload {
  review?: {
    state?: string;
    html_url?: string;
    body?: string;
  };
  pull_request?: {
    html_url?: string;
    number?: number;
  };
  workflow_run?: {
    html_url?: string;
    conclusion?: string;
    status?: string;
  };
}

export function webhookEventLabel(event: GitHubWebhookEventDTO) {
  return event.action ? `${event.event_type}.${event.action}` : event.event_type;
}

export function webhookEventRepo(event: GitHubWebhookEventDTO) {
  return event.repository_full_name || 'unknown repository';
}

export function sortWebhookEvents(events: GitHubWebhookEventDTO[]) {
  return [...events].sort((a, b) => {
    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
  });
}

export function webhookEventRisk(event: GitHubWebhookEventDTO) {
  const details = webhookEventDetails(event);
  if (details.reviewState === 'changes_requested') {
    return 'blocked';
  }
  if (event.status === 'failed') {
    return 'failed';
  }
  if (details.workflowConclusion === 'failure') {
    return 'failed';
  }
  return 'normal';
}

export function webhookEventDetails(event: GitHubWebhookEventDTO) {
  const payload = parseWebhookPayload(event.payload);

  return {
    reviewState: payload.review?.state,
    reviewUrl: payload.review?.html_url,
    pullRequestUrl: payload.pull_request?.html_url,
    pullRequestNumber: payload.pull_request?.number,
    workflowUrl: payload.workflow_run?.html_url,
    workflowStatus: payload.workflow_run?.status,
    workflowConclusion: payload.workflow_run?.conclusion,
  };
}

function parseWebhookPayload(payload: string): ParsedWebhookPayload {
  if (!payload) {
    return {};
  }

  try {
    const parsed = JSON.parse(payload) as ParsedWebhookPayload;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
