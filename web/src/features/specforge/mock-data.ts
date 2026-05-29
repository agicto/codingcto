import type { ExecutorRuntime, PlanBundle } from "@/features/specforge/types";

export const defaultIdea =
  "Add a team invite flow. Workspace admins can invite members by email, and invited users accept through a secure link.";

export const demoRuntimeNow = Date.parse("2026-05-29T12:00:00.000Z");

export const demoRuntimes: ExecutorRuntime[] = [
  {
    runtimeId: "runtime_local_codex",
    executor: "codex_cli",
    status: "online",
    hostname: "local-runner",
    version: "0.1.0",
    lastSeenAt: new Date(demoRuntimeNow - 60_000).toISOString(),
  },
  {
    runtimeId: "runtime_cloud_codex",
    executor: "codex_cloud",
    status: "offline",
    hostname: "cloud-runner",
    version: "0.1.0",
    lastSeenAt: new Date(demoRuntimeNow - 2 * 60_000).toISOString(),
  },
];

export const demoPlan: PlanBundle = {
  idea: defaultIdea,
  repoProfile: {
    repositoryId: "repo_123",
    defaultBranch: "main",
    stack: ["Go", "Gin", "GORM", "Next.js", "TypeScript", "Tailwind"],
    testCommands: ["go test ./...", "go vet ./...", "pnpm type-check", "pnpm lint"],
    ciProvider: "GitHub Actions",
    codingConventions: [
      "Keep API modules behind service and repository seams.",
      "Keep web code in feature-first folders.",
      "Treat auth, migrations, and runner state as high-risk changes.",
    ],
    riskAreas: ["auth", "database migrations", "runner isolation"],
    summary:
      "Luas is split into a Go API and a Next.js web app. SpecForge work should keep contracts explicit and avoid shared runtime code between halves.",
    source: "demo",
    warnings: [],
    lastIndexedAt: new Date(demoRuntimeNow - 5 * 60_000).toISOString(),
  },
  productSpec: {
    goals: [
      "Turn a feature idea into a product plan, technical plan, and reviewable PR DAG.",
      "Preserve one approval checkpoint before autonomous execution starts.",
      "Expose execution state around delivery artifacts instead of agent management.",
    ],
    businessRules: [
      "A plan must be approved before execution can start.",
      "Each PR node must declare scope, non-goals, acceptance criteria, and tests.",
      "MVP runs stay within one repository and at most five PR nodes.",
    ],
    permissionRules: [
      "Authenticated workspace members can create ideas.",
      "Only authorized workspace users can approve plans and start runs.",
    ],
    acceptanceCriteria: [
      "The plan review page shows product understanding, defaults, technical plan, PR DAG, and risk notes.",
      "The user can approve the plan once and start an execution run.",
      "The run view shows queued, running, waiting, and completed PR-node tasks.",
    ],
    assumptions: [
      "The repository profile is already indexed before plan generation.",
      "Executor and GitHub operations are added behind the execution orchestrator seam.",
    ],
  },
  implementationPlan: {
    technicalSummary:
      "Add the first SpecForge workbench surface around idea intake, plan review, PR DAG inspection, and execution delivery state.",
    affectedAreas: ["web/src/features/specforge", "web/src/app/(protected)/(console)/console/specforge"],
    securityRisks: [
      "Do not display raw secrets from future repo context.",
      "Execution controls must stay behind authenticated console routes.",
    ],
    migrationRisks: ["No database migration in this web slice."],
    status: "draft",
  },
  prNodes: [
    {
      id: "prnode_001",
      nodeKey: "PR-001",
      order: 1,
      title: "Add workspace invitation data model",
      type: "foundation",
      goal: "Create the invitation model, token hash fields, and migration boundary.",
      dependsOn: [],
      estimatedRisk: "medium",
      expectedFiles: ["api/internal/modules/workspace", "api/database/migrations"],
      nonGoals: ["Do not build UI.", "Do not send emails."],
      acceptanceCriteria: ["Invitation model exists.", "Tokens are stored as hashes.", "Migration applies."],
      testCommands: ["go test ./...", "go vet ./..."],
      branchName: "specforge/team-invite-01-model",
      status: "planned",
    },
    {
      id: "prnode_002",
      nodeKey: "PR-002",
      order: 2,
      title: "Add invite create and revoke APIs",
      type: "api",
      goal: "Expose workspace admin APIs for invite creation and revocation.",
      dependsOn: ["PR-001"],
      estimatedRisk: "medium",
      expectedFiles: ["api/internal/modules/invitation"],
      nonGoals: ["Do not build frontend UI.", "Do not accept invite tokens."],
      acceptanceCriteria: ["Admins can create invites.", "Members receive 403.", "Revoked invites cannot be accepted."],
      testCommands: ["go test ./..."],
      branchName: "specforge/team-invite-02-api",
      status: "planned",
    },
    {
      id: "prnode_003",
      nodeKey: "PR-003",
      order: 3,
      title: "Add admin invite UI",
      type: "ui",
      goal: "Add a members settings UI for sending and revoking invites.",
      dependsOn: ["PR-002"],
      estimatedRisk: "low",
      expectedFiles: ["web/src/features/workspace"],
      nonGoals: ["Do not change billing.", "Do not add audit logs."],
      acceptanceCriteria: ["Admin can submit an invite.", "Pending invites render.", "Revoke action updates state."],
      testCommands: ["pnpm type-check", "pnpm lint"],
      branchName: "specforge/team-invite-03-ui",
      status: "planned",
    },
    {
      id: "prnode_004",
      nodeKey: "PR-004",
      order: 4,
      title: "Add integration tests",
      type: "verification",
      goal: "Cover the invite creation and UI workflow through focused tests.",
      dependsOn: ["PR-002", "PR-003"],
      estimatedRisk: "low",
      expectedFiles: ["api/tests", "web/src/test"],
      nonGoals: ["Do not refactor unrelated test helpers."],
      acceptanceCriteria: ["Core invite flow is covered.", "CI commands pass."],
      testCommands: ["go test ./...", "pnpm test"],
      branchName: "specforge/team-invite-04-tests",
      status: "planned",
    },
  ],
};
