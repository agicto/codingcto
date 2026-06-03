import type {
  SpecForgeSkillDTO,
  SpecForgeSkillRunDTO,
} from '@/features/specforge/services/specforge-service';

export interface SkillRunOutput {
  skillNames: string[];
  prNodes: string[];
}

export interface SkillPromptContractSummary {
  state: 'ready' | 'partial' | 'missing';
  skillNames: string[];
  evidenceRefs: string[];
  completedStages: string[];
  missingStages: string[];
  headline: string;
  nextAction: string;
}

const requiredPlanningStages = ['product_plan', 'technical_plan', 'pr_dag'];

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

export function activeSkillNames(skills: SpecForgeSkillDTO[]) {
  return uniqueStrings(skills.filter(skill => skill.active).map(skill => skill.name));
}

export function activeSkillEvidenceRefs(skills: SpecForgeSkillDTO[]) {
  return uniqueStrings(skills.filter(skill => skill.active).map(skill => `skill:${skill.name}`));
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

export function skillPromptContractSummary(
  skillRuns: SpecForgeSkillRunDTO[],
  evidenceRefs?: string[]
): SkillPromptContractSummary {
  const skillNames = skillNamesFromRuns(skillRuns);
  const refs = skillEvidenceRefs([
    ...(evidenceRefs ?? []),
    ...skillRuns.flatMap(run => run.evidence_refs ?? []),
  ]);
  const completedStages = uniqueStrings(
    skillRuns
      .filter(run => run.status === 'completed')
      .map(run => run.stage)
  );
  const missingStages = requiredPlanningStages.filter(stage => !completedStages.includes(stage));
  const hasSkillEvidence = skillNames.length > 0 || refs.length > 0;
  const state =
    hasSkillEvidence && missingStages.length === 0
      ? 'ready'
      : hasSkillEvidence || completedStages.length > 0
        ? 'partial'
        : 'missing';

  return {
    state,
    skillNames,
    evidenceRefs: refs,
    completedStages,
    missingStages,
    headline:
      state === 'ready'
        ? 'Skill prompt contract is ready.'
        : state === 'partial'
          ? 'Skill prompt contract is partially grounded.'
          : 'Skill prompt contract has no recorded evidence yet.',
    nextAction: nextSkillPromptContractAction(state, missingStages, hasSkillEvidence),
  };
}

function nextSkillPromptContractAction(
  state: SkillPromptContractSummary['state'],
  missingStages: string[],
  hasSkillEvidence: boolean
) {
  if (state === 'ready') {
    return 'Compile the PR-node prompt and require skills_applied in the final report.';
  }
  if (!hasSkillEvidence) {
    return 'Attach repository or project skills before approving execution.';
  }
  if (missingStages.length > 0) {
    return `Refresh expert planning so skills cover ${missingStages.map(skillRunStageLabel).join(', ')}.`;
  }
  return 'Review skill evidence before dispatch.';
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
