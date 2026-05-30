import { describe, expect, it } from 'vitest';

import {
  executionRunFromDTO,
  planBundleFromDTO,
} from '@/features/specforge/plan-adapter';
import type {
  SpecForgeExecutionBundleDTO,
  SpecForgePlanBundleDTO,
} from '@/features/specforge/services/specforge-service';

const baseBundle: SpecForgePlanBundleDTO = {
  idea: {
    id: 1,
    repository_id: 'repo_abc',
    created_by: 1,
    raw_input: 'Add team invites',
    type: 'feature',
    status: 'awaiting_approval',
    created_at: '2026-05-29T12:00:00Z',
    updated_at: '2026-05-29T12:00:00Z',
  },
  repo_profile: {
    id: 1,
    repository_id: 'repo_abc',
    default_branch: 'main',
    stack: ['Go', 'Next.js'],
    test_commands: ['go test ./...', 'pnpm type-check'],
    ci_provider: 'github_actions',
    app_structure: ['api/internal/modules', 'web/src/features'],
    coding_conventions: ['Keep contracts explicit.'],
    risk_areas: ['auth'],
    summary: 'Split Go API and Next.js web app.',
    source: 'github_tree',
    warnings: ['GitHub tree response was truncated; inferred profile may miss files.'],
    created_by: 1,
    last_indexed_at: '2026-05-29T12:00:00Z',
    created_at: '2026-05-29T12:00:00Z',
    updated_at: '2026-05-29T12:00:00Z',
  },
  product_spec: {
    id: 1,
    idea_id: 1,
    goals: ['Invite workspace members.'],
    user_stories: ['As an admin, I can invite a member.'],
    business_rules: ['Invites expire.'],
    permission_rules: ['Only admins invite.'],
    edge_cases: ['Expired token.'],
    non_goals: ['No billing changes.'],
    acceptance_criteria: ['Admin can create invite.'],
    assumptions: ['Email provider exists.'],
    created_at: '2026-05-29T12:00:00Z',
    updated_at: '2026-05-29T12:00:00Z',
  },
  implementation_plan: {
    id: 1,
    idea_id: 1,
    product_spec_id: 1,
    technical_summary: 'Add invitation model, APIs, and UI.',
    affected_areas: ['api/internal/modules/invitation'],
    data_model_changes: ['WorkspaceInvitation'],
    api_changes: ['POST /invitations'],
    ui_changes: ['Invite dialog'],
    test_strategy: ['API integration tests'],
    security_risks: ['Token storage'],
    migration_risks: ['New table'],
    status: 'draft',
    created_at: '2026-05-29T12:00:00Z',
    updated_at: '2026-05-29T12:00:00Z',
  },
  pr_dag_review: [
    'PR DAG review: validation passed for 1 reviewable PR node; dependencies resolve within the generated plan.',
  ],
  pr_nodes: [
    {
      id: 1,
      plan_id: 1,
      node_key: 'PR-001',
      order: 1,
      title: 'Add invitation model',
      type: 'foundation',
      goal: 'Add the database model.',
      depends_on: [],
      estimated_risk: 'medium',
      expected_files: ['api/database/migrations'],
      non_goals: ['No UI.'],
      acceptance_criteria: ['Model exists.'],
      test_commands: ['go test ./...'],
      branch_name: 'specforge/team-invite-01-model',
      github_pr_number: 42,
      github_pr_url: 'https://github.com/acme/web/pull/42',
      head_sha: 'abc123',
      status: 'planned',
      created_at: '2026-05-29T12:00:00Z',
      updated_at: '2026-05-29T12:00:00Z',
    },
  ],
};

describe('planBundleFromDTO', () => {
  it('maps the planning API bundle into the workbench model', () => {
    expect(planBundleFromDTO(baseBundle)).toMatchObject({
      idea: 'Add team invites',
      ideaId: 1,
      planId: 1,
      repoProfile: {
        repositoryId: 'repo_abc',
        defaultBranch: 'main',
        stack: ['Go', 'Next.js'],
        source: 'github_tree',
        warnings: ['GitHub tree response was truncated; inferred profile may miss files.'],
        lastIndexedAt: '2026-05-29T12:00:00Z',
      },
      productSpec: {
        goals: ['Invite workspace members.'],
        businessRules: ['Invites expire.'],
        permissionRules: ['Only admins invite.'],
        acceptanceCriteria: ['Admin can create invite.'],
      },
      implementationPlan: {
        technicalSummary: 'Add invitation model, APIs, and UI.',
        affectedAreas: ['api/internal/modules/invitation'],
        status: 'draft',
      },
      prDagReview: [
        'PR DAG review: validation passed for 1 reviewable PR node; dependencies resolve within the generated plan.',
      ],
      prNodes: [
        {
          id: '1',
          nodeKey: 'PR-001',
          type: 'foundation',
          estimatedRisk: 'medium',
          githubPrNumber: 42,
          githubPrUrl: 'https://github.com/acme/web/pull/42',
          headSha: 'abc123',
          status: 'planned',
        },
      ],
    });
  });

  it('falls back to idea repository context when repo profile is absent', () => {
    const bundle = { ...baseBundle, repo_profile: undefined };

    expect(planBundleFromDTO(bundle).repoProfile).toMatchObject({
      repositoryId: 'repo_abc',
      defaultBranch: 'main',
      stack: [],
      testCommands: [],
      ciProvider: 'unknown',
      source: 'unknown',
      warnings: [],
    });
  });

  it('falls back to legacy assumption-backed PR DAG review notes', () => {
    const bundle: SpecForgePlanBundleDTO = {
      ...baseBundle,
      pr_dag_review: undefined,
      product_spec: {
        ...baseBundle.product_spec,
        assumptions: [
          'Repo profile was available.',
          'PR DAG review: PR-001 has no expected file scope.',
        ],
      },
    };

    expect(planBundleFromDTO(bundle).prDagReview).toEqual([
      'PR DAG review: PR-001 has no expected file scope.',
    ]);
  });

  it('normalizes unknown enum values to safe workbench defaults', () => {
    const bundle: SpecForgePlanBundleDTO = {
      ...baseBundle,
      implementation_plan: {
        ...baseBundle.implementation_plan,
        status: 'approved',
      },
      pr_nodes: [
        {
          ...baseBundle.pr_nodes[0],
          type: 'database',
          estimated_risk: 'critical',
          status: 'blocked',
        },
      ],
    };

    expect(planBundleFromDTO(bundle)).toMatchObject({
      implementationPlan: { status: 'approved' },
      prNodes: [
        {
          type: 'foundation',
          estimatedRisk: 'medium',
          status: 'blocked',
        },
      ],
    });
  });

  it('keeps backend node types and terminal GitHub PR states', () => {
    const bundle: SpecForgePlanBundleDTO = {
      ...baseBundle,
      pr_nodes: [
        {
          ...baseBundle.pr_nodes[0],
          type: 'backend',
          status: 'merged',
        },
      ],
    };

    expect(planBundleFromDTO(bundle)).toMatchObject({
      prNodes: [
        {
          type: 'backend',
          status: 'merged',
        },
      ],
    });
  });
});

describe('executionRunFromDTO', () => {
  it('maps execution tasks onto their PR nodes', () => {
    const bundle: SpecForgeExecutionBundleDTO = {
      run: {
        id: 7,
        plan_id: 1,
        status: 'running',
        started_by: 1,
        started_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      },
      plan: baseBundle,
      selected_pr_node_ids: [1],
      tasks: [
        {
          id: 10,
          run_id: 7,
          pr_node_id: 1,
          executor: 'codex_cli',
          status: 'dispatched',
          attempt_number: 1,
          fix_attempt_id: 17,
          runtime_id: 'runtime-local',
          failure_reason: 'typecheck failed',
          logs_url: 'https://logs.example/task-10',
          created_at: '2026-05-29T12:00:00Z',
          updated_at: '2026-05-29T12:00:00Z',
        },
      ],
    };

    expect(executionRunFromDTO(bundle)).toMatchObject({
      plan: {
        planId: 1,
      },
      run: {
        runId: 7,
        status: 'running',
        startedAt: '2026-05-29T12:00:00Z',
        selectedPRNodeIds: ['1'],
        tasks: [
          {
            id: '1',
            taskId: 10,
            title: 'Add invitation model',
            executor: 'codex_cli',
            attemptNumber: 1,
            fixAttemptId: 17,
            failureReason: 'typecheck failed',
            logsUrl: 'https://logs.example/task-10',
            status: 'running',
          },
        ],
      },
    });
  });

  it('keeps blocked execution run status from the API', () => {
    const bundle: SpecForgeExecutionBundleDTO = {
      run: {
        id: 7,
        plan_id: 1,
        status: 'blocked',
        started_by: 1,
        started_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      },
      plan: baseBundle,
      selected_pr_node_ids: [1],
      tasks: [],
    };

    expect(executionRunFromDTO(bundle).run.status).toBe('blocked');
  });

  it('can map execution state with fallback plan context', () => {
    const fallbackPlan = planBundleFromDTO(baseBundle);
    const bundle: SpecForgeExecutionBundleDTO = {
      run: {
        id: 8,
        plan_id: 1,
        status: 'queued',
        started_by: 1,
        started_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      },
      selected_pr_node_ids: [1],
      tasks: [
        {
          id: 11,
          run_id: 8,
          pr_node_id: 1,
          executor: 'codex_cli',
          status: 'waiting_on_dependencies',
          attempt_number: 1,
          created_at: '2026-05-29T12:00:00Z',
          updated_at: '2026-05-29T12:00:00Z',
        },
      ],
    };

    expect(executionRunFromDTO(bundle, fallbackPlan)).toMatchObject({
      plan: {
        idea: 'Add team invites',
      },
      run: {
        runId: 8,
        status: 'queued',
        tasks: [
          {
            nodeKey: 'PR-001',
            status: 'waiting_on_dependencies',
          },
        ],
      },
    });
  });

  it('keeps PR lifecycle status visible after an agent task completes', () => {
    const planWithCI = {
      ...baseBundle,
      pr_nodes: [
        {
          ...baseBundle.pr_nodes[0],
          status: 'ci_running',
        },
      ],
    };
    const bundle: SpecForgeExecutionBundleDTO = {
      run: {
        id: 9,
        plan_id: 1,
        status: 'running',
        started_by: 1,
        started_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      },
      plan: planWithCI,
      selected_pr_node_ids: [1],
      tasks: [
        {
          id: 12,
          run_id: 9,
          pr_node_id: 1,
          executor: 'codex_cli',
          status: 'completed',
          attempt_number: 1,
          created_at: '2026-05-29T12:00:00Z',
          updated_at: '2026-05-29T12:00:00Z',
        },
      ],
    };

    expect(executionRunFromDTO(bundle).run.tasks[0]).toMatchObject({
      taskId: 12,
      status: 'ci_running',
    });
  });

  it('keeps ready PR lifecycle status visible after verification passes', () => {
    const planWithReadyNode = {
      ...baseBundle,
      pr_nodes: [
        {
          ...baseBundle.pr_nodes[0],
          status: 'ready_for_review',
        },
      ],
    };
    const bundle: SpecForgeExecutionBundleDTO = {
      run: {
        id: 10,
        plan_id: 1,
        status: 'running',
        started_by: 1,
        started_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      },
      plan: planWithReadyNode,
      selected_pr_node_ids: [1],
      tasks: [
        {
          id: 13,
          run_id: 10,
          pr_node_id: 1,
          executor: 'codex_cli',
          status: 'completed',
          attempt_number: 1,
          created_at: '2026-05-29T12:00:00Z',
          updated_at: '2026-05-29T12:00:00Z',
        },
      ],
    };

    expect(executionRunFromDTO(bundle).run.tasks[0]).toMatchObject({
      taskId: 13,
      status: 'ready_for_review',
    });
  });
});
