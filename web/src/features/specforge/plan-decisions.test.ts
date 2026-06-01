import { describe, expect, it } from 'vitest';

import {
  decisionFieldsForPlan,
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import { demoPlan } from '@/features/specforge/mock-data';

describe('plan decision overrides', () => {
  it('builds invite-aware defaults for approval', () => {
    expect(defaultDecisionOverrides(demoPlan)).toMatchObject({
      execution_scope: 'single_repo',
      max_pr_nodes: '4',
      approval_mode: 'approve_once_then_execute',
      invite_expiration_days: '7',
      default_invited_role: 'member',
    });
    expect(decisionFieldsForPlan(demoPlan).map((field) => field.key)).toContain(
      'invite_expiration_days'
    );
  });

  it('keeps generic plans focused on execution decisions', () => {
    const plan = {
      ...demoPlan,
      idea: 'Add audit log export',
      productSpec: {
        ...demoPlan.productSpec,
        goals: ['Export audit logs.'],
        businessRules: ['Exports include the selected date range.'],
        acceptanceCriteria: ['Admin can download a CSV.'],
      },
      prNodes: demoPlan.prNodes.map((node) => ({
        ...node,
        title: node.title.replace(/invite|invitation/gi, 'export'),
        goal: node.goal.replace(/invite|invitation/gi, 'export'),
      })),
    };
    plan.prNodes = plan.prNodes.map((node) => ({
      ...node,
      title: node.title.replace(/邀请/g, '导出'),
      goal: node.goal.replace(/邀请/g, '导出'),
    }));

    expect(defaultDecisionOverrides(plan)).toEqual({
      execution_scope: 'single_repo',
      max_pr_nodes: '4',
      approval_mode: 'approve_once_then_execute',
    });
    expect(decisionFieldsForPlan(plan).map((field) => field.key)).not.toContain(
      'invite_expiration_days'
    );
  });

  it('normalizes decision payloads before approval', () => {
    expect(
      normalizeDecisionOverrides({
        ' execution_scope ': ' single_repo ',
        empty: ' ',
        max_pr_nodes: '5',
      })
    ).toEqual({
      execution_scope: 'single_repo',
      max_pr_nodes: '5',
    });
  });
});
