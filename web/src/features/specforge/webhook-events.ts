import type { GitHubWebhookEventDTO } from '@/features/specforge/services/specforge-service';

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
