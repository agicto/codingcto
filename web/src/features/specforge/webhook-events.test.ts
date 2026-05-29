import { describe, expect, it } from 'vitest';

import {
  sortWebhookEvents,
  webhookEventLabel,
  webhookEventRepo,
} from '@/features/specforge/webhook-events';
import type { GitHubWebhookEventDTO } from '@/features/specforge/services/specforge-service';

function event(overrides: Partial<GitHubWebhookEventDTO>): GitHubWebhookEventDTO {
  return {
    id: 1,
    delivery_id: 'delivery-1',
    event_type: 'workflow_run',
    action: 'completed',
    installation_id: 123,
    repository_full_name: 'acme/web',
    payload: '{}',
    signature: 'sha256=test',
    status: 'processed',
    received_at: '2026-05-29T12:00:00Z',
    created_at: '2026-05-29T12:00:00Z',
    updated_at: '2026-05-29T12:00:00Z',
    ...overrides,
  };
}

describe('webhook events helpers', () => {
  it('builds compact event labels', () => {
    expect(webhookEventLabel(event({ event_type: 'pull_request', action: 'opened' }))).toBe(
      'pull_request.opened'
    );
    expect(webhookEventLabel(event({ event_type: 'ping', action: '' }))).toBe('ping');
  });

  it('falls back when repository context is absent', () => {
    expect(webhookEventRepo(event({ repository_full_name: '' }))).toBe('unknown repository');
  });

  it('sorts newest events first', () => {
    expect(
      sortWebhookEvents([
        event({ id: 1, received_at: '2026-05-29T11:00:00Z' }),
        event({ id: 2, received_at: '2026-05-29T12:00:00Z' }),
      ]).map((item) => item.id)
    ).toEqual([2, 1]);
  });
});
