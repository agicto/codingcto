import { describe, expect, it } from 'vitest';

import { demoPlan } from '@/features/specforge/mock-data';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';

describe('buildPromptPreview', () => {
  it('includes the node scope, constraints, and test plan', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0]);

    expect(prompt).toContain('You are implementing PR-001');
    expect(prompt).toContain('Goal:');
    expect(prompt).toContain('Grounded prompt contract:');
    expect(prompt).toContain('Skill application protocol:');
    expect(prompt).toContain('skills_applied');
    expect(prompt).toContain('Skill prompt contract state: missing.');
    expect(prompt).toContain('Skill prompt contract next_action: Attach repository or project skills');
    expect(prompt).toContain('Evidence refs:');
    expect(prompt).toContain('repo_wiki.repository_id');
    expect(prompt).toContain('repo_wiki.summary');
    expect(prompt).toContain('repo_wiki.stack');
    expect(prompt).toContain('repo_wiki.planning_context_state');
    expect(prompt).toContain('repo_wiki.planning_context_score');
    expect(prompt).toContain('Repo Wiki planning context sections:');
    expect(prompt).toContain('仓库总览 [ready');
    expect(prompt).toContain('测试质量 [ready');
    expect(prompt).toContain('Scope guardrails:');
    expect(prompt).toContain('PR DAG guardrails:');
    expect(prompt).toContain('Verification contract:');
    expect(prompt).toContain('Non-goals:');
    expect(prompt).toContain('不构建 UI。');
    expect(prompt).toContain('Test commands:');
    expect(prompt).toContain('go test ./...');
    expect(prompt).toContain('After implementation:');
  });

  it('renders empty lists explicitly', () => {
    const prompt = buildPromptPreview(demoPlan, {
      ...demoPlan.prNodes[0],
      dependsOn: [],
      expectedFiles: [],
      testCommands: [],
    });

    expect(prompt).toContain('Dependencies:\n- None');
    expect(prompt).toContain('Expected files:\n- None');
    expect(prompt).toContain('Test commands:\n- None');
  });

  it('includes skill run and quality gate context when provided', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0], {
      executor: 'codex_cli',
      runtimeReady: true,
      skillRuns: [
        {
          id: 1,
          plan_id: 10,
          stage: 'technical_plan',
          status: 'completed',
          input_summary: 'Idea and repo profile',
          output_summary: 'Use the existing feature folder and preserve API boundaries.',
          output_json: JSON.stringify({ skill_names: ['react-best-practices'] }),
          evidence_refs: ['skill:react-best-practices'],
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
      ],
      qualityGates: [
        {
          id: 'tests',
          label: '测试门',
          state: 'ready',
          detail: '1 条测试命令会要求 Codex 执行并回传结果。',
        },
        {
          id: 'risk',
          label: '风险门',
          state: 'blocked',
          detail: '需要审批时显式确认。',
        },
      ],
    });

    expect(prompt).toContain('Executor: codex_cli');
    expect(prompt).toContain('Runtime readiness: ready');
    expect(prompt).toContain('Active skill names available for this prompt: react-best-practices');
    expect(prompt).toContain('Skill evidence refs available for traceability: skill:react-best-practices');
    expect(prompt).toContain('Skill prompt contract state: partial.');
    expect(prompt).toContain('Missing expert skill stages: Product plan, PR DAG.');
    expect(prompt).toContain('Expert and skill run evidence:');
    expect(prompt).toContain('Technical plan [completed]');
    expect(prompt).toContain('Quality gates:');
    expect(prompt).toContain('Ready: 1');
    expect(prompt).toContain('Blocked: 1');
    expect(prompt).toContain('风险门 [blocked]');
  });

  it('includes active repository skills before expert skill runs are recorded', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0], {
      activeSkills: [
        {
          id: 1,
          repository_id: demoPlan.repoProfile.repositoryId,
          name: 'repo-architecture-guardrails',
          description: 'Preserve repository architecture boundaries.',
          content: 'Keep API and web boundaries explicit.',
          active: true,
          target_agents: ['codex_cli'],
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
        {
          id: 2,
          repository_id: demoPlan.repoProfile.repositoryId,
          name: 'inactive-skill',
          description: 'Inactive skill.',
          content: 'Do not include this skill.',
          active: false,
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
      ],
    });

    expect(prompt).toContain(
      'Active repository skills attached before expert runs: repo-architecture-guardrails.'
    );
    expect(prompt).toContain('Active skill names available for this prompt: repo-architecture-guardrails.');
    expect(prompt).toContain(
      'Skill evidence refs available for traceability: skill:repo-architecture-guardrails.'
    );
    expect(prompt).toContain('Skill prompt contract state: partial.');
    expect(prompt).not.toContain('inactive-skill');
  });

  it('marks skill prompt contract ready when all expert skill stages are recorded', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0], {
      skillRuns: [
        {
          id: 1,
          plan_id: 10,
          stage: 'product_plan',
          status: 'completed',
          input_summary: '',
          output_summary: 'Product skill applied.',
          output_json: JSON.stringify({ skill_names: ['product-skill'] }),
          evidence_refs: ['skill:product'],
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
        {
          id: 2,
          plan_id: 10,
          stage: 'technical_plan',
          status: 'completed',
          input_summary: '',
          output_summary: 'Architecture skill applied.',
          output_json: JSON.stringify({ skill_names: ['architecture-skill'] }),
          evidence_refs: ['skill:architecture'],
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
        {
          id: 3,
          plan_id: 10,
          stage: 'pr_dag',
          status: 'completed',
          input_summary: '',
          output_summary: 'PR DAG skill applied.',
          output_json: JSON.stringify({ skill_names: ['dag-skill'] }),
          evidence_refs: ['skill:dag'],
          created_by: 1,
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
        },
      ],
    });

    expect(prompt).toContain('Skill prompt contract state: ready.');
    expect(prompt).toContain('Missing expert skill stages: none.');
    expect(prompt).toContain('Completed expert skill stages: Product plan, Technical plan, PR DAG.');
  });
});
