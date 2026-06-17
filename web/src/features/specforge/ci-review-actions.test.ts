import { describe, expect, it } from 'vitest';

import { ciReviewActionFromResponse } from '@/features/specforge/ci-review-actions';
import type { SpecForgeVerifyPRNodeCIResponseDTO } from '@/features/specforge/services/specforge-service';

function response(
  overrides: Partial<SpecForgeVerifyPRNodeCIResponseDTO>
): SpecForgeVerifyPRNodeCIResponseDTO {
  return {
    pr_node: {
      id: 1,
      plan_id: 1,
      repository_id: 'repo_1',
      node_key: 'PR-001',
      order: 1,
      title: 'Add API',
      type: 'api',
      goal: 'Add API.',
      depends_on: [],
      estimated_risk: 'medium',
      expected_files: [],
      non_goals: [],
      acceptance_criteria: [],
      test_commands: [],
      branch_name: 'codingcto/api',
      status: 'blocked',
      created_at: '2026-05-31T00:00:00Z',
      updated_at: '2026-05-31T00:00:00Z',
    },
    verification_state: 'ci_not_ready',
    next_action: '',
    ...overrides,
  };
}

describe('ciReviewActionFromResponse', () => {
  it('summarizes queued fix attempts with policy metadata', () => {
    const action = ciReviewActionFromResponse(
      response({
        verification_state: 'fix_attempt_queued',
        next_action: 'Dispatch the queued fix attempt to the selected local runtime.',
        fix_attempt: {
          id: 7,
          pr_node_id: 1,
          failure_type: 'type_error',
          ci_log_excerpt: 'TS2322',
          attempt_number: 1,
          status: 'queued',
          confidence: 0.8,
          likely_cause: 'Type mismatch.',
          recommended_action: 'Patch the type guard.',
          can_auto_fix: true,
          risk_level: 'low',
          action_kind: 'auto_fix',
          created_by: 1,
          created_at: '2026-05-31T00:00:00Z',
          updated_at: '2026-05-31T00:00:00Z',
        },
      })
    );

    expect(action.label).toBe('修复已排队');
    expect(action.headline).toContain('type_error');
    expect(action.tone).toBe('info');
    expect(action.fixAttempt?.action_kind).toBe('auto_fix');
  });

  it('prioritizes escalation decisions when auto-fix is blocked', () => {
    const action = ciReviewActionFromResponse(
      response({
        verification_state: 'needs_user_decision',
        next_action: 'Pause auto-fix and replan.',
        escalation_summary: {
          pr_node_id: 1,
          status: 'needs_user_decision',
          attempts_used: 3,
          max_attempts: 3,
          failure_types: ['migration_failure'],
          reason: 'Migration failure requires review.',
          recommended_option: 'Replan this PR node.',
          decision_options: ['Replan this PR node'],
          latest_failure_type: 'migration_failure',
          latest_likely_cause: 'Schema drift.',
          latest_action: 'Pause auto-fix.',
          latest_risk_level: 'high',
          latest_action_kind: 'user_decision',
          latest_blocked_reason: 'Migration can change persisted data.',
          can_continue_auto_fix: false,
        },
      })
    );

    expect(action.label).toBe('需要决策');
    expect(action.headline).toContain('Migration failure');
    expect(action.nextAction).toBe('Pause auto-fix and replan.');
    expect(action.tone).toBe('warning');
  });

  it('reports passed CI as a review action', () => {
    const action = ciReviewActionFromResponse(
      response({
        verification_state: 'ci_passed',
        next_action: 'Review the pull request in GitHub.',
      })
    );

    expect(action.label).toBe('CI 已通过');
    expect(action.tone).toBe('success');
    expect(action.nextAction).toContain('Review');
  });
});
