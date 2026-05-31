export interface RepoProfile {
  repositoryId: string;
  defaultBranch: string;
  stack: string[];
  testCommands: string[];
  ciProvider: string;
  codingConventions: string[];
  riskAreas: string[];
  summary: string;
  source: string;
  warnings: string[];
  lastIndexedAt?: string;
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
  status: 'draft' | 'approved';
}

export interface PRNode {
  id: string;
  taskId?: number;
  nodeKey: string;
  order: number;
  title: string;
  type: 'foundation' | 'backend' | 'frontend' | 'implementation' | 'api' | 'ui' | 'verification';
  goal: string;
  dependsOn: string[];
  estimatedRisk: 'low' | 'medium' | 'high';
  expectedFiles: string[];
  nonGoals: string[];
  acceptanceCriteria: string[];
  testCommands: string[];
  branchName: string;
  githubPrNumber?: number;
  githubPrUrl?: string;
  headSha?: string;
  executor?: string;
  runtimeId?: string;
  sessionId?: string;
  workdir?: string;
  attemptNumber?: number;
  fixAttemptId?: number;
  failureReason?: string;
  logsUrl?: string;
  outputLog?: string;
  errorLog?: string;
  status:
    | 'planned'
    | 'queued'
    | 'running'
    | 'waiting_on_dependencies'
    | 'pr_opened'
    | 'ci_running'
    | 'ready_for_review'
    | 'blocked'
    | 'merged'
    | 'closed'
    | 'completed'
    | 'failed'
    | 'cancelled';
}

export interface PlanBundle {
  ideaId?: number;
  planId?: number;
  idea: string;
  repoProfile: RepoProfile;
  productSpec: ProductSpec;
  implementationPlan: ImplementationPlan;
  prNodes: PRNode[];
  prDagReview: string[];
}

export interface ExecutionRun {
  runId?: number;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'blocked' | 'cancelled';
  startedAt?: string;
  selectedPRNodeIds: string[];
  tasks: PRNode[];
}

export type RuntimeHealth = 'online' | 'recently_lost' | 'offline' | 'stale';

export interface ExecutorRuntime {
  runtimeId: string;
  executor: string;
  status: 'online' | 'offline' | string;
  hostname?: string;
  version?: string;
  availableClis: ExecutorRuntimeCLI[];
  sandbox?: ExecutorRuntimeSandbox;
  skillRoots: ExecutorRuntimeSkillRoot[];
  localSkillCount: number;
  capabilitiesHash?: string;
  lastSeenAt?: string;
}

export interface ExecutorRuntimeCLI {
  name: string;
  command: string;
  path?: string;
  version?: string;
  available: boolean;
}

export interface ExecutorRuntimeSandbox {
  provider?: string;
  mode?: string;
  networkAccess: boolean;
  writable: boolean;
  approvalPolicy?: string;
  reason?: string;
}

export interface ExecutorRuntimeSkillRoot {
  provider: string;
  path: string;
  writable: boolean;
}
