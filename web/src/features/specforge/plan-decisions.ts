import type { PlanBundle } from '@/features/specforge/types';

export interface DecisionField {
  key: string;
  label: string;
  description: string;
}

const baseDecisionFields: DecisionField[] = [
  {
    key: 'execution_scope',
    label: '执行范围',
    description: '除非重新生成方案，否则 MVP 执行限制在单个仓库内。',
  },
  {
    key: 'max_pr_nodes',
    label: '最大 PR 节点数',
    description: '控制首次执行的 PR 拆分规模，避免过大。',
  },
  {
    key: 'approval_mode',
    label: '审批模式',
    description: '定义自动执行开始前的人工检查点。',
  },
];

const inviteDecisionFields: DecisionField[] = [
  {
    key: 'invite_expiration_days',
    label: '邀请过期天数',
    description: '功能包含邀请流程时，邀请链接的默认有效期。',
  },
  {
    key: 'default_invited_role',
    label: '默认邀请角色',
    description: '分配给受邀用户的默认工作区角色。',
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

  return text.includes('invite') || text.includes('invitation') || text.includes('邀请');
}
