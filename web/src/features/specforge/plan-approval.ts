import type { PlanBundle } from '@/features/specforge/types';

const dagValidationPassedPrefixes = [
  'PR DAG 审核：校验通过',
  'PR DAG review: validation passed',
];

export function planApprovalReadiness(plan: PlanBundle) {
  if (plan.prDagReview.length === 0) {
    return {
      canApprove: false,
      reason: 'PR DAG 尚未完成审核。',
    };
  }

  const blockers = plan.prDagReview.filter(
    (note) => !dagValidationPassedPrefixes.some((prefix) => note.startsWith(prefix))
  );
  if (blockers.length > 0) {
    return {
      canApprove: false,
      reason: '开始执行前请先处理 PR DAG 审核阻塞项。',
    };
  }

  return {
    canApprove: true,
    reason: 'PR DAG 审核已通过。',
  };
}
