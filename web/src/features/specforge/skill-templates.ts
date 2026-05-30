export interface SpecForgeSkillTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const specForgeSkillTemplates: SpecForgeSkillTemplate[] = [
  {
    id: "planning-sop",
    name: "CodingCTO planning SOP",
    description: "Evidence-first planning workflow for idea-to-PR decomposition.",
    content: [
      "Use this SOP before generating or executing PR nodes.",
      "",
      "1. State the product objective in one sentence and name the user outcome.",
      "2. Extract business rules, permission rules, edge cases, non-goals, and acceptance criteria from the idea.",
      "3. Mark every inferred decision as an assumption and prefer conservative defaults when the repo gives no evidence.",
      "4. Read repo evidence before planning: README, package or module manifests, routes, models, tests, CI, AGENTS.md, and recent conventions.",
      "5. Map each acceptance criterion to at least one technical surface: data model, API, UI, test, permission, or integration.",
      "6. Split work into reviewable PR nodes with clear dependencies, expected files, non-goals, and test commands.",
      "7. Reject a PR node if it mixes database, API, UI, email, and auth changes without a dependency reason.",
      "8. Run a reverse trace: every original goal must be covered, and every PR node must serve a goal.",
      "9. If evidence is missing, keep the plan in review or create a foundation PR instead of inventing implementation details.",
      "10. Compile prompts from the approved plan snapshot only; do not broaden scope during implementation or fixes.",
    ].join("\n"),
  },
  {
    id: "review-gate",
    name: "CodingCTO review gate",
    description: "Quality gate for self-review before opening or updating PRs.",
    content: [
      "Apply this gate before marking a PR node ready for review.",
      "",
      "1. Confirm the diff stays inside the PR node goal and non-goals.",
      "2. Verify modified files match the expected file scope or explain the deviation in the PR notes.",
      "3. Run the node test commands and record skipped checks with the reason.",
      "4. Check auth, secrets, migrations, external integrations, and runner state for regression risk.",
      "5. Compare the implementation against acceptance criteria and the approved plan snapshot.",
      "6. If CI fails, classify the failure before patching and limit auto-fix attempts to the configured budget.",
      "7. If the same failure repeats or the product direction is unclear, stop and produce an escalation summary.",
    ].join("\n"),
  },
];

export function skillTemplateById(id: string) {
  return specForgeSkillTemplates.find((template) => template.id === id);
}
