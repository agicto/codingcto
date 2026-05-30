import { describe, expect, it } from 'vitest';

import { planApprovalReadiness } from '@/features/specforge/plan-approval';
import { demoPlan } from '@/features/specforge/mock-data';

describe('planApprovalReadiness', () => {
  it('allows approval when the PR DAG review passed', () => {
    expect(planApprovalReadiness(demoPlan)).toEqual({
      canApprove: true,
      reason: 'PR DAG review passed.',
    });
  });

  it('blocks approval when the PR DAG review has not run', () => {
    expect(planApprovalReadiness({ ...demoPlan, prDagReview: [] })).toEqual({
      canApprove: false,
      reason: 'PR DAG review has not run.',
    });
  });

  it('blocks approval when the PR DAG review reports blockers', () => {
    expect(
      planApprovalReadiness({
        ...demoPlan,
        prDagReview: ['PR DAG review: PR-001 has no expected file scope.'],
      })
    ).toEqual({
      canApprove: false,
      reason: 'Resolve PR DAG review blockers before starting execution.',
    });
  });
});
