import type { PlanBundle, PRNode } from '@/features/specforge/types';
import type { QualityGateSummary } from '@/features/specforge/quality-gates';
import type {
  SpecForgeSkillDTO,
  SpecForgeSkillRunDTO,
} from '@/features/specforge/services/specforge-service';
import { repoWikiPlanningContext } from '@/features/specforge/repo-wiki-planning-context';
import {
  activeSkillEvidenceRefs,
  activeSkillNames,
  skillEvidenceRefs,
  skillNamesFromRuns,
  skillPromptContractSummary,
  skillRunStageLabel,
} from '@/features/specforge/skill-pipeline';

export interface PromptPreviewContext {
  activeSkills?: SpecForgeSkillDTO[];
  skillRuns?: SpecForgeSkillRunDTO[];
  qualityGates?: QualityGateSummary[];
  executor?: string;
  runtimeReady?: boolean;
}

function listSection(title: string, items: string[]) {
  if (!items.length) {
    return `${title}:\n- None`;
  }
  return `${title}:\n${items.map(item => `- ${item}`).join('\n')}`;
}

export function buildPromptPreview(
  plan: PlanBundle,
  node: PRNode,
  context: PromptPreviewContext = {}
) {
  const activeSkills = context.activeSkills ?? [];
  const attachedSkillNames = activeSkillNames(activeSkills);
  const attachedSkillRefs = activeSkillEvidenceRefs(activeSkills);
  const skillRuns = context.skillRuns ?? [];
  const skillNames = Array.from(new Set([...attachedSkillNames, ...skillNamesFromRuns(skillRuns)]));
  const skillRefs = skillEvidenceRefs([
    ...attachedSkillRefs,
    ...skillRuns.flatMap(run => run.evidence_refs ?? []),
  ]);
  const skillContract = skillPromptContractSummary(skillRuns, attachedSkillRefs);
  const readyGates = (context.qualityGates ?? []).filter(gate => gate.state === 'ready');
  const blockedGates = (context.qualityGates ?? []).filter(gate => gate.state === 'blocked');
  const waitingGates = (context.qualityGates ?? []).filter(gate => gate.state === 'waiting');
  const wikiContext = repoWikiPlanningContext(plan.repoProfile);

  return [
    `You are implementing ${node.nodeKey}: ${node.title}.`,
    context.executor ? `Executor: ${context.executor}` : '',
    context.runtimeReady === undefined
      ? ''
      : `Runtime readiness: ${context.runtimeReady ? 'ready' : 'not ready'}`,
    '',
    'Goal:',
    node.goal,
    '',
    'Grounded prompt contract:',
    '- Treat the evidence refs below as the approved product and engineering source of truth.',
    '- Do not invent requirements, APIs, data models, routes, commands, or dependencies that are not supported by the evidence refs.',
    '- If evidence is missing or contradictory, stop and produce an escalation summary.',
    '',
    'Skill application protocol:',
    '- If active repository skills are attached to this plan, translate them into concrete constraints for this PR node before editing.',
    '- Apply skill constraints together with acceptance criteria, non-goals, and PR DAG dependencies.',
    '- In the final task summary, include skills_applied with the skill names used and evidence refs.',
    attachedSkillNames.length
      ? `- Active repository skills attached before expert runs: ${attachedSkillNames.join(', ')}.`
      : '- No active repository skills are attached before expert runs.',
    skillNames.length
      ? `- Active skill names available for this prompt: ${skillNames.join(', ')}.`
      : '- No recorded skill names are available yet; use the explicit repository skills and plan evidence only.',
    skillRefs.length
      ? `- Skill evidence refs available for traceability: ${skillRefs.join(', ')}.`
      : '- No skill evidence refs were attached to this preview.',
    `- Skill prompt contract state: ${skillContract.state}.`,
    `- Skill prompt contract headline: ${skillContract.headline}`,
    `- Skill prompt contract next_action: ${skillContract.nextAction}`,
    skillContract.completedStages.length
      ? `- Completed expert skill stages: ${skillContract.completedStages.map(skillRunStageLabel).join(', ')}.`
      : '- Completed expert skill stages: none.',
    skillContract.missingStages.length
      ? `- Missing expert skill stages: ${skillContract.missingStages.map(skillRunStageLabel).join(', ')}.`
      : '- Missing expert skill stages: none.',
    '',
    'Expert and skill run evidence:',
    ...(skillRuns.length
      ? skillRuns.map(
          run =>
            `- ${skillRunStageLabel(run.stage)} [${run.status}]: ${
              run.output_summary || 'No output summary recorded.'
            }`
        )
      : ['- No skill run records are loaded yet; generate or refresh the plan before execution.']),
    '',
    'Quality gates:',
    ...(context.qualityGates?.length
      ? [
          `- Ready: ${readyGates.length}`,
          `- Waiting: ${waitingGates.length}`,
          `- Blocked: ${blockedGates.length}`,
          ...context.qualityGates.map(gate => `- ${gate.label} [${gate.state}]: ${gate.detail}`),
        ]
      : ['- No quality gate summary is available for this preview.']),
    '',
    'Evidence refs:',
    `- idea.raw_input: ${plan.idea}`,
    plan.contextSnapshot
      ? `- project_context_snapshot.id: ${plan.contextSnapshot.id}`
      : '- project_context_snapshot.id: none',
    plan.contextSnapshot
      ? `- project_context_snapshot.status: ${plan.contextSnapshot.snapshotStatus}`
      : '- project_context_snapshot.status: missing',
    plan.expertPolicy
      ? `- project_expert_policy.id: ${plan.expertPolicy.id}`
      : '- project_expert_policy.id: none',
    plan.expertPolicy
      ? `- project_expert_policy.version: ${plan.expertPolicy.version}`
      : '- project_expert_policy.version: missing',
    `- repo_wiki.repository_id: ${plan.repoProfile.repositoryId}`,
    `- repo_wiki.default_branch: ${plan.repoProfile.defaultBranch || 'main'}`,
    `- repo_wiki.summary: ${plan.repoProfile.summary || 'No repository wiki summary available.'}`,
    listSection('repo_wiki.stack', plan.repoProfile.stack),
    listSection('repo_wiki.coding_conventions', plan.repoProfile.codingConventions),
    listSection('repo_wiki.risk_areas', plan.repoProfile.riskAreas),
    `- repo_wiki.planning_context_state: ${wikiContext.state}`,
    `- repo_wiki.planning_context_score: ${wikiContext.scorePercent}%`,
    `- repo_wiki.next_action: ${wikiContext.nextAction}`,
    'Repo Wiki planning context sections:',
    ...wikiContext.sections.map(
      section =>
        `- ${section.label} [${section.state}, evidence=${section.evidenceCount}]: ${section.detail}`
    ),
    listSection('product_spec.goals', plan.productSpec.goals),
    listSection('technical_plan.affected_areas', plan.implementationPlan.affectedAreas),
    listSection('pr_node.expected_files', node.expectedFiles),
    listSection('pr_node.acceptance_criteria', node.acceptanceCriteria),
    listSection('repo_profile.test_commands', plan.repoProfile.testCommands),
    '',
    'Product context:',
    plan.idea,
    '',
    listSection('Product goals', plan.productSpec.goals),
    '',
    listSection('Acceptance criteria', node.acceptanceCriteria),
    '',
    listSection('Non-goals', node.nonGoals),
    '',
    listSection('Dependencies', node.dependsOn),
    '',
    listSection('Expected files', node.expectedFiles),
    '',
    listSection('Test commands', node.testCommands),
    '',
    'Scope guardrails:',
    `- Write scope is limited to target repository ${plan.repoProfile.repositoryId}.`,
    '- Keep this PR focused on the PR node goal.',
    '- Do not implement non-goals or downstream PR node work.',
    '- Follow the detected repo profile and existing conventions.',
    '',
    'PR DAG guardrails:',
    ...(plan.prDagReview.length
      ? plan.prDagReview.map(item => `- ${item}`)
      : ['- No PR DAG review notes are available; do not execute until the plan is reviewed.']),
    '',
    'Verification contract:',
    ...(node.testCommands.length
      ? node.testCommands.map(command => `- ${command}`)
      : [
          '- No explicit test commands were provided; inspect the repo profile before marking ready.',
        ]),
    '',
    'After implementation:',
    '- Run the listed tests.',
    '- Commit the change.',
    '- Prepare a PR summary with scope, non-goals, risks, tests, and evidence refs used.',
  ].join('\n');
}
