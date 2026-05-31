import type {
  SpecForgeEscalationSummaryDTO,
  SpecForgeFixAttemptDTO,
  SpecForgeVerifyPRNodeCIResponseDTO,
} from '@/features/specforge/services/specforge-service';

export interface CIReviewAction {
  state: string;
  label: string;
  headline: string;
  nextAction: string;
  tone: 'default' | 'info' | 'warning' | 'success';
  fixAttempt?: SpecForgeFixAttemptDTO;
  escalationSummary?: SpecForgeEscalationSummaryDTO;
}

export function ciReviewActionFromResponse(
  response: SpecForgeVerifyPRNodeCIResponseDTO
): CIReviewAction {
  const state = response.verification_state;
  const fixAttempt = response.fix_attempt;
  const escalationSummary = response.escalation_summary;

  if (state === 'fix_attempt_queued' && fixAttempt) {
    return {
      state,
      label: 'Fix queued',
      headline: `Attempt ${fixAttempt.attempt_number}: ${fixAttempt.failure_type}`,
      nextAction: response.next_action || fixAttempt.recommended_action,
      tone: 'info',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'needs_user_decision') {
    return {
      state,
      label: 'Decision needed',
      headline:
        escalationSummary?.reason ||
        fixAttempt?.blocked_reason ||
        'CI verification needs a human decision.',
      nextAction:
        response.next_action ||
        escalationSummary?.recommended_option ||
        fixAttempt?.recommended_action ||
        'Review the failed workflow and choose the next delivery action.',
      tone: 'warning',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'ci_passed') {
    return {
      state,
      label: 'CI passed',
      headline: 'The PR node is ready for review.',
      nextAction: response.next_action || 'Review the pull request in GitHub.',
      tone: 'success',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'ci_running') {
    return {
      state,
      label: 'CI running',
      headline: 'GitHub Actions is still running for this PR node.',
      nextAction: response.next_action || 'Wait for CI to complete, then verify again.',
      tone: 'info',
      fixAttempt,
      escalationSummary,
    };
  }

  return {
    state,
    label: 'Review CI',
    headline: 'CI verification is not ready yet.',
    nextAction: response.next_action || 'Open or update the pull request, then wait for CI.',
    tone: 'default',
    fixAttempt,
    escalationSummary,
  };
}
