import { describe, expect, it } from 'vitest';

import {
  formatTimestamp,
  promptModeLabel,
  repoProfileSourceLabel,
  statusClassName,
  statusLabel,
} from './workbench-utils';

describe('workbench utilities', () => {
  it('maps PR node statuses to operator-facing labels', () => {
    expect(statusLabel.ready_for_review).toBe('Ready');
    expect(statusLabel.waiting_on_dependencies).toBe('Waiting');
    expect(statusLabel.cancelled).toBe('Cancelled');
  });

  it('returns semantic status classes for delivered, active, and blocked work', () => {
    expect(statusClassName('ready_for_review')).toContain('text-success');
    expect(statusClassName('running')).toContain('text-info');
    expect(statusClassName('blocked')).toContain('text-error');
  });

  it('keeps repo profile source labels readable', () => {
    expect(repoProfileSourceLabel('github_tree')).toBe('GitHub tree');
    expect(repoProfileSourceLabel('manual')).toBe('Manual profile');
    expect(repoProfileSourceLabel('unexpected')).toBe('Unknown source');
  });

  it('formats timestamps without hiding invalid backend values', () => {
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
    expect(formatTimestamp('2026-05-31T09:00:00Z')).not.toBe('2026-05-31T09:00:00Z');
  });

  it('keeps prompt mode labels aligned with prompt contracts', () => {
    expect(promptModeLabel.implementation).toBe('Implement');
    expect(promptModeLabel.fix).toBe('Fix');
    expect(promptModeLabel.review_patch).toBe('Review');
  });
});
