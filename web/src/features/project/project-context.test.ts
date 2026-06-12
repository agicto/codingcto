import { describe, expect, it } from 'vitest';

import {
  primaryRepositoryContext,
  projectContextContract,
  projectContextMissingEvidence,
  projectOverviewDecision,
  projectRepositoryEvidence,
  projectContextSnapshotState,
  projectContextReadiness,
  projectSkillContract,
} from './project-context';
import type { ProjectContextDTO } from './services/project-service';

function projectContext(
  roles: Array<['primary' | 'dependency', boolean, string]>
): ProjectContextDTO {
  return {
    project: {
      id: 1,
      workspace_id: 'workspace_1',
      name: 'SpecForge',
      slug: 'specforge',
      description: '',
      status: 'active',
      created_by: 1,
      created_at: '',
      updated_at: '',
    },
    repositories: [],
    primary_repository_id: roles.find(([role, active]) => role === 'primary' && active)?.[2],
    execution_repository_id: roles.find(([role, active]) => role === 'primary' && active)?.[2],
    read_only_repository_ids: roles
      .filter(([role, active]) => role !== 'primary' && active)
      .map(([, , repositoryId]) => repositoryId),
    execution_guardrails: ['MVP execution is primary-repository only.'],
    repository_contexts: roles.map(([role, active, repositoryId], index) => ({
      repository: {
        id: index + 1,
        workspace_id: 'workspace_1',
        project_id: 1,
        repository_id: repositoryId,
        role,
        active,
        created_by: 1,
        created_at: '',
        updated_at: '',
      },
      architecture_stale: false,
      skills: [],
    })),
  };
}

describe('project context', () => {
  it('selects the active primary repository context', () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ['dependency', true, 'repo_dependency'],
        ['primary', true, 'repo_primary'],
      ])
    );

    expect(selected?.repository.repository_id).toBe('repo_primary');
  });

  it('does not fall back when no primary exists', () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ['dependency', false, 'repo_inactive'],
        ['dependency', true, 'repo_active'],
      ])
    );

    expect(selected).toBeUndefined();
  });

  it('summarizes primary and read-only repository readiness', () => {
    const readiness = projectContextReadiness(
      projectContext([
        ['dependency', true, 'repo_sdk'],
        ['primary', true, 'repo_app'],
      ])
    );

    expect(readiness.hasPrimaryRepository).toBe(true);
    expect(readiness.activeRepositoryCount).toBe(2);
    expect(readiness.readOnlyRepositoryCount).toBe(1);
    expect(readiness.summary).toContain('repo_app');
  });

  it('prefers server-provided readiness when present', () => {
    const context = projectContext([
      ['dependency', true, 'repo_sdk'],
      ['primary', true, 'repo_app'],
    ]);
    context.readiness = {
      has_primary_repository: true,
      active_repository_count: 2,
      read_only_repository_count: 1,
      skill_count: 3,
      warning_count: 2,
      guardrails: ['Executor must modify only repo_app.'],
      summary: 'Server summary.',
      next_action: 'Server next action.',
    };

    const readiness = projectContextReadiness(context);

    expect(readiness.skillCount).toBe(3);
    expect(readiness.warningCount).toBe(2);
    expect(readiness.guardrails).toEqual(['Executor must modify only repo_app.']);
    expect(readiness.summary).toBe('Server summary.');
    expect(readiness.nextAction).toBe('Server next action.');
  });

  it('exposes the server-provided context contract', () => {
    const context = projectContext([
      ['dependency', true, 'repo_sdk'],
      ['primary', true, 'repo_app'],
    ]);
    context.context_contract = {
      version: 'project_context_contract_v1',
      project_id: 1,
      project_name: 'SpecForge',
      primary_repository_id: 'repo_app',
      execution_repository_id: 'repo_app',
      read_only_repository_ids: ['repo_sdk'],
      active_repository_count: 2,
      skill_names: ['planning-sop'],
      missing_evidence: ['architecture_snapshot:repo_sdk'],
      prompt_guardrails: ['Executor must modify only repo_app.'],
    };

    const contract = projectContextContract(context);

    expect(contract?.version).toBe('project_context_contract_v1');
    expect(contract?.primary_repository_id).toBe('repo_app');
    expect(contract?.read_only_repository_ids).toEqual(['repo_sdk']);
    expect(contract?.missing_evidence).toEqual(['architecture_snapshot:repo_sdk']);
  });

  it('summarizes the latest persisted context snapshot', () => {
    const context = projectContext([
      ['dependency', true, 'repo_sdk'],
      ['primary', true, 'repo_app'],
    ]);
    context.latest_snapshot = {
      id: 9,
      workspace_id: 'workspace_1',
      project_id: 1,
      snapshot_status: 'attention',
      summary: 'Snapshot covers 2 active repositories and 1 matched DeepWiki index.',
      primary_repository_id: 'repo_app',
      warning_count: 2,
      missing_evidence: ['deepwiki_index:repo_sdk'],
      evidence_refs: ['repo_profile:repo_app', 'deepwiki_index:60'],
      repositories: [
        {
          repository_id: 'repo_app',
          role: 'primary',
          writable: true,
          architecture_stale: false,
          warning_count: 0,
          deepwiki: {
            source_id: 50,
            index_id: 60,
            file_count: 120,
            chunk_count: 420,
            page_count: 3,
          },
        },
        {
          repository_id: 'repo_sdk',
          role: 'dependency',
          writable: false,
          architecture_stale: false,
          warning_count: 2,
        },
      ],
      created_by: 1,
      created_at: '',
      updated_at: '',
    };

    const snapshot = projectContextSnapshotState(context);

    expect(snapshot.status).toBe('attention');
    expect(snapshot.repositoryCount).toBe(2);
    expect(snapshot.deepWikiCount).toBe(1);
    expect(snapshot.missingEvidenceCount).toBe(1);
    expect(snapshot.warningCount).toBe(2);
  });

  it('asks for a primary repo before planning when none is active', () => {
    const readiness = projectContextReadiness(projectContext([['dependency', true, 'repo_docs']]));

    expect(readiness.hasPrimaryRepository).toBe(false);
    expect(readiness.nextAction).toBe('生成计划前请先绑定一个启用的主仓库。');
  });

  it('counts architecture warnings in fallback readiness', () => {
    const context = projectContext([['primary', true, 'repo_app']]);
    context.repository_contexts[0].architecture_stale = true;
    context.repository_contexts[0].architecture_warnings = [
      'Architecture snapshot is older than 24 hours.',
    ];

    const readiness = projectContextReadiness(context);

    expect(readiness.warningCount).toBe(1);
    expect(readiness.nextAction).toBe('审批执行前请先查看仓库上下文警告。');
  });

  it('routes the project overview to repository binding before a primary repo exists', () => {
    const decision = projectOverviewDecision(projectContext([['dependency', true, 'repo_docs']]));

    expect(decision.step).toBe('bind_repository');
    expect(decision.actionHref).toBe('#repository-binding');
  });

  it('routes the project overview to context review when warnings are present', () => {
    const context = projectContext([['primary', true, 'repo_app']]);
    context.repository_contexts[0].architecture_warnings = ['Architecture snapshot missing.'];

    const decision = projectOverviewDecision(context);

    expect(decision.step).toBe('review_context');
    expect(decision.actionHref).toBe('#project-context');
  });

  it('routes the project overview to requirement intake when context is ready', () => {
    const context = projectContext([['primary', true, 'repo_app']]);
    context.repository_contexts[0].skills = [
      {
        id: 1,
        repository_id: 'repo_app',
        name: 'planning-sop',
        description: 'Planning skill.',
        content: 'Use evidence refs.',
        active: true,
        created_by: 1,
        created_at: '',
        updated_at: '',
      },
    ];

    const decision = projectOverviewDecision(context);

    expect(decision.step).toBe('create_requirement');
    expect(decision.actionHref).toBe('#project-requirement');
  });

  it('builds repository evidence rows for context review', () => {
    const context = projectContext([
      ['primary', true, 'repo_app'],
      ['dependency', true, 'repo_docs'],
    ]);
    context.repository_contexts[0].profile = {
      id: 1,
      repository_id: 'repo_app',
      default_branch: 'main',
      stack: ['Go'],
      test_commands: ['go test ./...'],
      ci_provider: 'github_actions',
      app_structure: ['api/internal'],
      coding_conventions: [],
      risk_areas: ['auth'],
      summary: 'API service.',
      source: 'manual',
      warnings: [],
      created_by: 1,
      last_indexed_at: '',
      created_at: '',
      updated_at: '',
    };
    context.repository_contexts[0].skills = [
      {
        id: 1,
        repository_id: 'repo_app',
        name: 'planning-sop',
        description: 'Planning skill.',
        content: 'Use evidence refs.',
        active: true,
        created_by: 1,
        created_at: '',
        updated_at: '',
      },
    ];
    context.repository_contexts[1].architecture_stale = true;

    const evidence = projectRepositoryEvidence(context);

    expect(evidence[0]).toMatchObject({
      repositoryId: 'repo_app',
      writable: true,
      hasProfile: true,
      hasArchitectureSnapshot: false,
      skillCount: 1,
    });
    expect(evidence[1]).toMatchObject({
      repositoryId: 'repo_docs',
      writable: false,
      architectureStale: true,
      warningCount: 1,
    });
    expect(projectContextMissingEvidence(context)).toContain('repo_profile:repo_docs');
  });

  it('summarizes the effective skill contract for prompt compilation', () => {
    const context = projectContext([
      ['primary', true, 'repo_app'],
      ['dependency', true, 'repo_docs'],
    ]);
    context.repository_contexts[0].skills = [
      {
        id: 7,
        repository_id: 'repo_app',
        name: 'service-layer',
        description: 'Use service layer.',
        content: 'API routes must call services.',
        active: true,
        created_by: 1,
        created_at: '',
        updated_at: '',
      },
    ];
    context.context_contract = {
      version: 'project_context_contract_v1',
      project_id: 1,
      project_name: 'SpecForge',
      active_repository_count: 2,
      skill_names: ['service-layer'],
      prompt_guardrails: [],
      missing_evidence: [],
    };

    const contract = projectSkillContract(context);

    expect(contract.effectiveSkillNames).toEqual(['service-layer']);
    expect(contract.promptEvidenceRefs).toContain('skill:7');
    expect(contract.promptEvidenceRefs).toContain('skill_name:service-layer');
    expect(contract.repositoriesMissingSkills).toEqual(['repo_docs']);
    expect(contract.canPlanWithSkills).toBe(false);
  });
});
