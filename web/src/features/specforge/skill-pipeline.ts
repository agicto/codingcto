import type { SpecForgeSkillRunDTO } from '@/features/specforge/services/specforge-service';

export interface SkillRunOutput {
  skillNames: string[];
  prNodes: string[];
}

export function parseSkillRunOutput(outputJSON?: string): SkillRunOutput {
  if (!outputJSON) {
    return { skillNames: [], prNodes: [] };
  }

  try {
    const parsed = JSON.parse(outputJSON) as {
      skill_names?: unknown;
      pr_nodes?: unknown;
    };

    return {
      skillNames: stringList(parsed.skill_names),
      prNodes: stringList(parsed.pr_nodes),
    };
  } catch {
    return { skillNames: [], prNodes: [] };
  }
}

export function skillNamesFromRuns(skillRuns: SpecForgeSkillRunDTO[]) {
  return uniqueStrings(skillRuns.flatMap(run => parseSkillRunOutput(run.output_json).skillNames));
}

export function skillEvidenceRefs(evidenceRefs?: string[]) {
  return uniqueStrings((evidenceRefs ?? []).filter(ref => ref.startsWith('skill:')));
}

export function skillRunStageLabel(stage: string) {
  const labels: Record<string, string> = {
    product_plan: 'Product plan',
    technical_plan: 'Technical plan',
    pr_dag: 'PR DAG',
    self_review: 'Self review',
  };
  return labels[stage] ?? stage.replaceAll('_', ' ');
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}
