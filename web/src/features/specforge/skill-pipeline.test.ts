import { describe, expect, it } from 'vitest';

import {
  parseSkillRunOutput,
  skillEvidenceRefs,
  skillNamesFromRuns,
  skillRunStageLabel,
} from './skill-pipeline';
import type { SpecForgeSkillRunDTO } from './services/specforge-service';

function skillRun(output_json?: string): SpecForgeSkillRunDTO {
  return {
    id: 1,
    stage: 'product_plan',
    status: 'completed',
    input_summary: '',
    output_summary: '',
    output_json,
    created_by: 1,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
  };
}

describe('skill pipeline helpers', () => {
  it('parses skill run output JSON into stable lists', () => {
    expect(
      parseSkillRunOutput(
        JSON.stringify({
          skill_names: ['Planning SOP', 'Planning SOP', 'Repo contract'],
          pr_nodes: ['PR-001', 'PR-002'],
        })
      )
    ).toEqual({
      skillNames: ['Planning SOP', 'Repo contract'],
      prNodes: ['PR-001', 'PR-002'],
    });
  });

  it('returns empty lists for missing or malformed output JSON', () => {
    expect(parseSkillRunOutput()).toEqual({ skillNames: [], prNodes: [] });
    expect(parseSkillRunOutput('{')).toEqual({ skillNames: [], prNodes: [] });
  });

  it('deduplicates skill names across skill runs', () => {
    expect(
      skillNamesFromRuns([
        skillRun(JSON.stringify({ skill_names: ['Planning SOP', 'Repo contract'] })),
        skillRun(JSON.stringify({ skill_names: ['Planning SOP', 'Prompt guardrail'] })),
      ])
    ).toEqual(['Planning SOP', 'Repo contract', 'Prompt guardrail']);
  });

  it('filters compiled prompt evidence refs down to skill refs', () => {
    expect(skillEvidenceRefs(['idea:1', 'skill:2', 'skill:2', 'pr_node:3', 'skill:4'])).toEqual([
      'skill:2',
      'skill:4',
    ]);
  });

  it('formats known and fallback skill run stages', () => {
    expect(skillRunStageLabel('technical_plan')).toBe('Technical plan');
    expect(skillRunStageLabel('custom_stage')).toBe('custom stage');
  });
});
