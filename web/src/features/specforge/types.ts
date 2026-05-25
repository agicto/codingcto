export interface RepoProfile {
  repositoryId: string;
  defaultBranch: string;
  stack: string[];
  testCommands: string[];
  ciProvider: string;
  codingConventions: string[];
  riskAreas: string[];
  summary: string;
}

export interface ProductSpec {
  goals: string[];
  businessRules: string[];
  permissionRules: string[];
  acceptanceCriteria: string[];
  assumptions: string[];
}

export interface ImplementationPlan {
  technicalSummary: string;
  affectedAreas: string[];
  securityRisks: string[];
  migrationRisks: string[];
  status: "draft" | "approved";
}

export interface PRNode {
  id: string;
  nodeKey: string;
  order: number;
  title: string;
  type: "foundation" | "api" | "ui" | "verification";
  goal: string;
  dependsOn: string[];
  estimatedRisk: "low" | "medium" | "high";
  expectedFiles: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  testCommands: string[];
  branchName: string;
  status: "planned" | "queued" | "running" | "waiting_on_dependencies" | "completed";
}

export interface PlanBundle {
  idea: string;
  repoProfile: RepoProfile;
  productSpec: ProductSpec;
  implementationPlan: ImplementationPlan;
  prNodes: PRNode[];
}

export interface ExecutionRun {
  status: "idle" | "queued" | "running" | "completed";
  startedAt?: string;
  tasks: PRNode[];
}
