import { describe, expect, it } from 'vitest';

import {
  mergeRequestResultFromDTO,
  reviewDecisionStateFromDTO,
} from '@/features/review/review-adapter';

describe('reviewDecisionStateFromDTO', () => {
  it('maps review decision payloads into the review feature model', () => {
    const state = reviewDecisionStateFromDTO({
      pr_node: {
        id: 9,
        plan_id: 3,
        repository_id: 'github_agicto__codingcto',
        node_key: 'PR-009',
        order: 2,
        title: 'Add merge review page',
        type: 'frontend',
        goal: 'Expose PR review and merge state in the console.',
        depends_on: ['PR-008'],
        estimated_risk: 'medium',
        expected_files: ['web/src/features/review/pr-review-page.tsx'],
        non_goals: [],
        acceptance_criteria: ['Page shows merge readiness.'],
        test_commands: ['pnpm type-check'],
        branch_name: 'specforge/pr-009',
        github_pr_number: 91,
        github_pr_url: 'https://github.com/agicto/codingcto/pull/91',
        head_sha: 'abc123def456',
        status: 'ready_for_review',
        created_at: '2026-06-12T08:00:00Z',
        updated_at: '2026-06-12T08:05:00Z',
      },
      decision: {
        id: 4,
        pr_node_id: 9,
        status: 'approved',
        head_sha: 'abc123def456',
        reason: 'CI is green.',
        decided_by: 7,
        decided_at: '2026-06-12T08:10:00Z',
        created_at: '2026-06-12T08:10:00Z',
        updated_at: '2026-06-12T08:10:00Z',
      },
      decision_status: 'approved',
      merge_ready: true,
      summary: 'This pull request is approved for the current head SHA and ready to merge.',
      next_action: 'This PR can proceed to the merge capability step.',
      checks: [
        {
          key: 'approval',
          label: 'CodingCTO approval current',
          status: 'ready',
          detail: 'The current head SHA is approved for merge in CodingCTO.',
          required: true,
        },
      ],
    });

    expect(state.prNode.id).toBe('9');
    expect(state.decision?.status).toBe('approved');
    expect(state.decisionStatus).toBe('approved');
    expect(state.mergeReady).toBe(true);
    expect(state.checks[0]?.status).toBe('ready');
  });
});

describe('mergeRequestResultFromDTO', () => {
  it('maps merge request acknowledgements', () => {
    const result = mergeRequestResultFromDTO({
      pr_node: {
        id: 9,
        plan_id: 3,
        repository_id: 'github_agicto__codingcto',
        node_key: 'PR-009',
        order: 2,
        title: 'Add merge review page',
        type: 'frontend',
        goal: 'Expose PR review and merge state in the console.',
        depends_on: ['PR-008'],
        estimated_risk: 'medium',
        expected_files: [],
        non_goals: [],
        acceptance_criteria: [],
        test_commands: [],
        branch_name: 'specforge/pr-009',
        github_pr_number: 91,
        github_pr_url: 'https://github.com/agicto/codingcto/pull/91',
        head_sha: 'abc123def456',
        status: 'ready_for_review',
        created_at: '2026-06-12T08:00:00Z',
        updated_at: '2026-06-12T08:05:00Z',
      },
      decision_status: 'approved',
      merge_accepted: true,
      merge_message: 'Pull Request successfully merged',
      merge_sha: 'merge123',
    });

    expect(result.mergeAccepted).toBe(true);
    expect(result.mergeSha).toBe('merge123');
    expect(result.prNode.githubPrNumber).toBe(91);
  });
});
