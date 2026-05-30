import type { PlanBundle } from '@/features/specforge/types';

export interface DecisionField {
  key: string;
  label: string;
  description: string;
}

const baseDecisionFields: DecisionField[] = [
  {
    key: 'execution_scope',
    label: 'Execution scope',
    description: 'Keep the MVP run bounded to one repository unless the plan is regenerated.',
  },
  {
    key: 'max_pr_nodes',
    label: 'Max PR nodes',
    description: 'Guard the first execution run against oversized PR sets.',
  },
  {
    key: 'approval_mode',
    label: 'Approval mode',
    description: 'Defines the human checkpoint before autonomous execution starts.',
  },
];

const inviteDecisionFields: DecisionField[] = [
  {
    key: 'invite_expiration_days',
    label: 'Invite expiration days',
    description: 'Default expiry for invitation links when the feature includes invites.',
  },
  {
    key: 'default_invited_role',
    label: 'Default invited role',
    description: 'Default workspace role assigned to invited users.',
  },
];

export function decisionFieldsForPlan(plan: PlanBundle): DecisionField[] {
  if (mentionsInviteFlow(plan)) {
    return [...baseDecisionFields, ...inviteDecisionFields];
  }
  return baseDecisionFields;
}

export function defaultDecisionOverrides(plan: PlanBundle): Record<string, string> {
  const values: Record<string, string> = {
    execution_scope: 'single_repo',
    max_pr_nodes: String(Math.max(1, Math.min(plan.prNodes.length, 5))),
    approval_mode: 'approve_once_then_execute',
  };

  if (mentionsInviteFlow(plan)) {
    values.invite_expiration_days = '7';
    values.default_invited_role = 'member';
  }

  return values;
}

export function normalizeDecisionOverrides(values: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    if (!trimmedKey || !trimmedValue) {
      continue;
    }
    normalized[trimmedKey] = trimmedValue;
  }
  return normalized;
}

function mentionsInviteFlow(plan: PlanBundle): boolean {
  const text = [
    plan.idea,
    ...plan.productSpec.goals,
    ...plan.productSpec.businessRules,
    ...plan.productSpec.acceptanceCriteria,
    ...plan.prNodes.map((node) => `${node.title} ${node.goal}`),
  ]
    .join(' ')
    .toLowerCase();

  return text.includes('invite') || text.includes('invitation');
}
