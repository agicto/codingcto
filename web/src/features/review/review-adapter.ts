import { prNodeFromDTO } from '@/features/specforge/plan-adapter';
import type {
  SpecForgeMergeReviewDecisionResponseDTO,
  SpecForgeReviewDecisionDTO,
  SpecForgeReviewDecisionResponseDTO,
} from '@/features/specforge/services/specforge-service';
import type {
  MergeRequestResult,
  ReviewDecision,
  ReviewDecisionState,
} from '@/features/review/types';

function decisionFromDTO(decision?: SpecForgeReviewDecisionDTO): ReviewDecision | undefined {
  if (!decision) {
    return undefined;
  }
  return {
    id: decision.id,
    prNodeId: decision.pr_node_id,
    status: decision.status,
    headSha: decision.head_sha,
    reason: decision.reason,
    decidedBy: decision.decided_by,
    decidedAt: decision.decided_at,
    expiredAt: decision.expired_at,
    createdAt: decision.created_at,
    updatedAt: decision.updated_at,
  };
}

export function reviewDecisionStateFromDTO(
  decision: SpecForgeReviewDecisionResponseDTO
): ReviewDecisionState {
  return {
    prNode: prNodeFromDTO(decision.pr_node),
    decision: decisionFromDTO(decision.decision),
    decisionStatus: decision.decision_status,
    mergeReady: decision.merge_ready,
    summary: decision.summary,
    nextAction: decision.next_action,
    checks: decision.checks.map(check => ({
      key: check.key,
      label: check.label,
      status: check.status,
      detail: check.detail,
      required: check.required,
    })),
  };
}

export function mergeRequestResultFromDTO(
  response: SpecForgeMergeReviewDecisionResponseDTO
): MergeRequestResult {
  return {
    prNode: prNodeFromDTO(response.pr_node),
    decision: decisionFromDTO(response.decision),
    decisionStatus: response.decision_status,
    mergeAccepted: response.merge_accepted,
    mergeMessage: response.merge_message,
    mergeSha: response.merge_sha,
  };
}
