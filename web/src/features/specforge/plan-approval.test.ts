import { describe, expect, it } from 'vitest';

import { planApprovalReadiness } from '@/features/specforge/plan-approval';
import { demoPlan } from '@/features/specforge/mock-data';

describe('planApprovalReadiness', () => {
  it('allows approval when the PR DAG review passed', () => {
    expect(planApprovalReadiness(demoPlan)).toEqual({
      canApprove: true,
      reason: 'PR DAG 审核已通过。',
    });
  });

  it('blocks approval when the PR DAG review has not run', () => {
    expect(planApprovalReadiness({ ...demoPlan, prDagReview: [] })).toEqual({
      canApprove: false,
      reason: 'PR DAG 尚未完成审核。',
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
      reason: '开始执行前请先处理 PR DAG 审核阻塞项。',
    });
  });
});
