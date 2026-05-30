import type { PlanBundle, PRNode } from '@/features/specforge/types';

function listSection(title: string, items: string[]) {
  if (!items.length) {
    return `${title}:\n- None`;
  }
  return `${title}:\n${items.map(item => `- ${item}`).join('\n')}`;
}

export function buildPromptPreview(plan: PlanBundle, node: PRNode) {
  return [
    `You are implementing ${node.nodeKey}: ${node.title}.`,
    '',
    'Goal:',
    node.goal,
    '',
    'Grounded prompt contract:',
    '- Treat the evidence refs below as the approved product and engineering source of truth.',
    '- Do not invent requirements, APIs, data models, routes, commands, or dependencies that are not supported by the evidence refs.',
    '- If evidence is missing or contradictory, stop and produce an escalation summary.',
    '',
    'Evidence refs:',
    `- idea.raw_input: ${plan.idea}`,
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
