import request from "@/http";

export interface RepoProfilePayload {
  default_branch?: string;
  stack?: string[];
  test_commands?: string[];
  ci_provider?: string;
  app_structure?: string[];
  coding_conventions?: string[];
  risk_areas?: string[];
  summary?: string;
}

export interface CreateIdeaPayload {
  input: string;
  type?: "feature" | "bugfix" | "refactor" | "docs" | "test";
}

export interface ApprovePlanPayload {
  approved: true;
  decision_overrides?: Record<string, string>;
}

export interface CompilePromptPayload {
  type?: "implementation" | "fix" | "review_patch";
}

export interface UpsertSkillPayload {
  name: string;
  description?: string;
  content: string;
  active?: boolean;
}

export interface StartRunPayload {
  executor?: string;
}

export interface DispatchRunPayload {
  max_tasks?: number;
}

export interface RuntimeHeartbeatPayload {
  runtime_id: string;
  executor?: string;
  hostname?: string;
  version?: string;
}

export interface ClaimTaskPayload {
  executor?: string;
  session_id?: string;
  workdir?: string;
}

export interface ExecuteTaskPayload {
  runtime_id?: string;
  session_id?: string;
  workdir?: string;
  env?: Record<string, string>;
}

export interface SubmitTaskResultPayload {
  runtime_id?: string;
  session_id?: string;
  workdir?: string;
  status: "completed" | "failed" | "timeout";
  output?: string;
  error?: string;
  exit_code?: number;
  failure_reason?: string;
}

export interface CreateTaskEventPayload {
  type: string;
  tool?: string;
  content?: string;
  input?: string;
  output?: string;
}

export interface PinTaskSessionPayload {
  session_id?: string;
  workdir?: string;
}

export interface SpecForgeRepoProfileDTO {
  id: number;
  repository_id: string;
  default_branch: string;
  stack: string[];
  test_commands: string[];
  ci_provider: string;
  app_structure: string[];
  coding_conventions: string[];
  risk_areas: string[];
  summary: string;
  created_by: number;
  last_indexed_at: string;
  created_at: string;
  updated_at: string;
}

export interface SpecForgePlanBundleDTO {
  idea: {
    id: number;
    repository_id: string;
    created_by: number;
    raw_input: string;
    type: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  repo_profile?: SpecForgeRepoProfileDTO;
  product_spec: {
    id: number;
    idea_id: number;
    goals: string[];
    user_stories: string[];
    business_rules: string[];
    permission_rules: string[];
    edge_cases: string[];
    non_goals: string[];
    acceptance_criteria: string[];
    assumptions: string[];
    created_at: string;
    updated_at: string;
  };
  implementation_plan: {
    id: number;
    idea_id: number;
    product_spec_id: number;
    technical_summary: string;
    affected_areas: string[];
    data_model_changes: string[];
    api_changes: string[];
    ui_changes: string[];
    test_strategy: string[];
    security_risks: string[];
    migration_risks: string[];
    status: string;
    approved_by?: number;
    approved_at?: string;
    decision_overrides?: string[];
    created_at: string;
    updated_at: string;
  };
  pr_nodes: SpecForgePRNodeDTO[];
}

export interface SpecForgePRNodeDTO {
  id: number;
  plan_id: number;
  node_key: string;
  order: number;
  title: string;
  type: string;
  goal: string;
  depends_on: string[];
  estimated_risk: string;
  expected_files: string[];
  non_goals: string[];
  acceptance_criteria: string[];
  test_commands: string[];
  branch_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeCompiledPromptDTO {
  id: number;
  pr_node_id: number;
  plan_id: number;
  type: string;
  version: string;
  prompt_text: string;
  prompt_hash: string;
  created_by: number;
  created_at: string;
}

export interface SpecForgeSkillDTO {
  id: number;
  repository_id: string;
  name: string;
  description: string;
  content: string;
  active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeRuntimeDTO {
  id: number;
  runtime_id: string;
  executor: string;
  status: string;
  hostname?: string;
  version?: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeClaimedTaskDTO {
  id: number;
  run_id: number;
  pr_node_id: number;
  executor: string;
  status: string;
  runtime_id: string;
  attempt_number: number;
  session_id?: string;
  workdir?: string;
}

export interface SpecForgeTaskEventDTO {
  id: number;
  task_id: number;
  seq: number;
  type: string;
  tool?: string;
  content?: string;
  input?: string;
  output?: string;
  created_at: string;
}

export interface SpecForgeExecutionBundleDTO {
  run: {
    id: number;
    plan_id: number;
    status: string;
    started_by: number;
    started_at: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
  };
  plan?: SpecForgePlanBundleDTO;
  tasks: Array<{
    id: number;
    run_id: number;
    pr_node_id: number;
    executor: string;
    status: string;
    runtime_id?: string;
    attempt_number: number;
    session_id?: string;
    workdir?: string;
    failure_reason?: string;
    logs_url?: string;
    output_log?: string;
    error_log?: string;
    exit_code?: number;
    dispatched_at?: string;
    started_at?: string;
    finished_at?: string;
    created_at: string;
    updated_at: string;
  }>;
}

export const specForgeService = {
  upsertRepoProfile: (repoId: string, payload: RepoProfilePayload) =>
    request.post<SpecForgeRepoProfileDTO, RepoProfilePayload>(
      `/repositories/${repoId}/profile`,
      payload
    ),

  getRepoProfile: (repoId: string) =>
    request.get<SpecForgeRepoProfileDTO>(`/repositories/${repoId}/profile`),

  createIdea: (repoId: string, payload: CreateIdeaPayload) =>
    request.post<SpecForgePlanBundleDTO, CreateIdeaPayload>(
      `/repositories/${repoId}/ideas`,
      payload
    ),

  getPlanForIdea: (ideaId: number) => request.get<SpecForgePlanBundleDTO>(`/ideas/${ideaId}/plan`),

  approvePlan: (planId: number, payload: ApprovePlanPayload) =>
    request.post<SpecForgePlanBundleDTO, ApprovePlanPayload>(`/plans/${planId}/approve`, payload),

  listSkills: (repoId: string) =>
    request.get<{ skills: SpecForgeSkillDTO[] }>(`/repositories/${repoId}/skills`),

  upsertSkill: (repoId: string, payload: UpsertSkillPayload) =>
    request.post<{ skill: SpecForgeSkillDTO }, UpsertSkillPayload>(
      `/repositories/${repoId}/skills`,
      payload
    ),

  compilePrompt: (prNodeId: number, payload?: CompilePromptPayload) =>
    request.post<{ prompt: SpecForgeCompiledPromptDTO }, CompilePromptPayload | undefined>(
      `/pr-nodes/${prNodeId}/prompts`,
      payload
    ),

  startRun: (planId: number, payload?: StartRunPayload) =>
    request.post<SpecForgeExecutionBundleDTO, StartRunPayload | undefined>(
      `/plans/${planId}/run`,
      payload
    ),

  getRun: (runId: number) => request.get<SpecForgeExecutionBundleDTO>(`/runs/${runId}`),

  dispatchRun: (runId: number, payload?: DispatchRunPayload) =>
    request.post<SpecForgeExecutionBundleDTO, DispatchRunPayload | undefined>(
      `/runs/${runId}/dispatch`,
      payload
    ),

  heartbeatRuntime: (payload: RuntimeHeartbeatPayload) =>
    request.post<
      { runtime: SpecForgeRuntimeDTO; claim_pending: boolean },
      RuntimeHeartbeatPayload
    >(`/runtimes/heartbeat`, payload),

  claimTask: (runtimeId: string, payload?: ClaimTaskPayload) =>
    request.post<{ task?: SpecForgeClaimedTaskDTO }, ClaimTaskPayload | undefined>(
      `/runtimes/${runtimeId}/claim`,
      payload
    ),

  pinTaskSession: (taskId: number, payload: PinTaskSessionPayload) =>
    request.post<SpecForgeExecutionBundleDTO, PinTaskSessionPayload>(
      `/tasks/${taskId}/session`,
      payload
    ),

  executeTask: (taskId: number, payload: ExecuteTaskPayload) =>
    request.post<SpecForgeExecutionBundleDTO, ExecuteTaskPayload>(
      `/tasks/${taskId}/execute`,
      payload
    ),

  submitTaskResult: (taskId: number, payload: SubmitTaskResultPayload) =>
    request.post<SpecForgeExecutionBundleDTO, SubmitTaskResultPayload>(
      `/tasks/${taskId}/result`,
      payload
    ),

  listTaskEvents: (taskId: number, afterSeq?: number) => {
    const query = afterSeq && afterSeq > 0 ? `?after_seq=${afterSeq}` : "";
    return request.get<{ events: SpecForgeTaskEventDTO[] }>(`/tasks/${taskId}/events${query}`);
  },

  createTaskEvent: (taskId: number, payload: CreateTaskEventPayload) =>
    request.post<SpecForgeTaskEventDTO, CreateTaskEventPayload>(`/tasks/${taskId}/events`, payload),

  completeTask: (taskId: number) =>
    request.post<SpecForgeExecutionBundleDTO, undefined>(`/tasks/${taskId}/complete`),
};

export type SpecForgeService = typeof specForgeService;
