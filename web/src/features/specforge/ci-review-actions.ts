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
      label: '修复已排队',
      headline: `第 ${fixAttempt.attempt_number} 次修复：${fixAttempt.failure_type}`,
      nextAction: response.next_action || fixAttempt.recommended_action,
      tone: 'info',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'needs_user_decision') {
    return {
      state,
      label: '需要决策',
      headline:
        escalationSummary?.reason ||
        fixAttempt?.blocked_reason ||
        'CI 验证需要人工决策。',
      nextAction:
        response.next_action ||
        escalationSummary?.recommended_option ||
        fixAttempt?.recommended_action ||
        '请查看失败的 workflow，并选择下一步交付动作。',
      tone: 'warning',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'ci_passed') {
    return {
      state,
      label: 'CI 已通过',
      headline: '这个 PR 节点已准备好评审。',
      nextAction: response.next_action || '请在 GitHub 中评审 Pull Request。',
      tone: 'success',
      fixAttempt,
      escalationSummary,
    };
  }

  if (state === 'ci_running') {
    return {
      state,
      label: 'CI 运行中',
      headline: '这个 PR 节点的 GitHub Actions 仍在运行。',
      nextAction: response.next_action || '等待 CI 完成后，再重新验证。',
      tone: 'info',
      fixAttempt,
      escalationSummary,
    };
  }

  return {
    state,
    label: '检查 CI',
    headline: 'CI 验证还没有准备好。',
    nextAction: response.next_action || '请先打开或更新 Pull Request，然后等待 CI。',
    tone: 'default',
    fixAttempt,
    escalationSummary,
  };
}
