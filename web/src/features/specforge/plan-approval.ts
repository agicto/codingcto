import type { PlanBundle } from '@/features/specforge/types';

const dagValidationPassedPrefix = 'PR DAG review: validation passed';

export function planApprovalReadiness(plan: PlanBundle) {
  if (plan.prDagReview.length === 0) {
    return {
      canApprove: false,
      reason: 'PR DAG review has not run.',
    };
  }

  const blockers = plan.prDagReview.filter(
    (note) => !note.startsWith(dagValidationPassedPrefix)
  );
  if (blockers.length > 0) {
    return {
      canApprove: false,
      reason: 'Resolve PR DAG review blockers before starting execution.',
    };
  }

  return {
    canApprove: true,
    reason: 'PR DAG review passed.',
  };
}
