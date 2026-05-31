import { env } from '@/config/env';
import type { ProjectContextDTO } from '@/features/project/services/project-service';
import { createRequest, type RequestConfig } from '@/http';

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

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

export interface InferRepoProfilePayload {
  default_branch?: string;
  file_paths?: string[];
  package_scripts?: Record<string, string>;
}

export interface ReindexRepoArchitecturePayload {
  default_branch?: string;
  file_paths?: string[];
  package_scripts?: Record<string, string>;
}

export interface CreateIdeaPayload {
  input: string;
  type?: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';
}

export interface ApprovePlanPayload {
  approved: true;
  decision_overrides?: Record<string, string>;
}

export interface CompilePromptPayload {
  type?: 'implementation' | 'fix' | 'review_patch';
}

export interface PreparePRNodeBranchPayload {
  repository_id: string;
  pr_node_id: number;
  base_branch?: string;
}

export interface DeliverPRNodePayload {
  repository_id: string;
  pr_node_id: number;
  title?: string;
  body?: string;
  base_branch?: string;
  draft?: boolean;
}

export interface RefreshPRNodeCIPayload {
  repository_id: string;
  pr_node_id: number;
}

export interface ReadPRNodeFailureLogPayload {
  repository_id: string;
  pr_node_id: number;
}

export interface VerifyPRNodeCIPayload {
  repository_id: string;
}

export interface CreateFixAttemptFromCIPayload {
  repository_id: string;
  workflow_run_id?: number;
  workflow_run_url?: string;
  conclusion?: string;
}

export interface UpsertSkillPayload {
  name: string;
  description?: string;
  content: string;
  active?: boolean;
}

export interface UpsertProjectSkillPayload extends UpsertSkillPayload {
  repository_id: string;
  sort_order?: number;
}

export interface StartRunPayload {
  executor?: string;
  pr_node_ids?: number[];
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

export interface RuntimeSweepPayload {
  stale_seconds?: number;
}

export interface RuntimeDeregisterPayload {
  runtime_ids: string[];
}

export interface ListSpecForgeRuntimesParams {
  executor?: string;
  status?: string;
  limit?: number;
}

export interface StaleTaskSweepPayload {
  dispatch_timeout_seconds?: number;
  running_timeout_seconds?: number;
}

export interface RetryTaskPayload {
  force_fresh_session?: boolean;
}

export interface CreateReviewPatchTaskPayload {
  feedback: string;
  force_fresh_session?: boolean;
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
  status: 'completed' | 'failed' | 'timeout';
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

export interface ListGitHubWebhookEventsParams {
  status?: string;
  repository_full_name?: string;
  limit?: number;
}

export interface UpsertGitHubInstallationPayload {
  workspace_id: string;
  installation_id: number;
  account_login: string;
  permissions?: Record<string, string>;
}

export interface GitHubInstallationDTO {
  id: number;
  workspace_id: string;
  installation_id: number;
  account_login: string;
  permissions: Record<string, string>;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SyncGitHubInstallationPayload {
  workspace_id: string;
  installation_id: number;
}

export interface GitHubRepositoryOptionDTO {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  repo: string;
  default_branch: string;
  is_private: boolean;
  html_url: string;
}

export interface SyncGitHubInstallationDTO {
  installation: GitHubInstallationDTO;
  repositories: GitHubRepositoryOptionDTO[];
}

export interface UpsertGitHubRepositoryPayload {
  repository_id?: string;
  workspace_id: string;
  github_installation_id: number;
  github_owner: string;
  github_repo: string;
  default_branch?: string;
  is_private?: boolean;
}

export interface GitHubRepositoryDTO {
  id: number;
  repository_id: string;
  workspace_id: string;
  github_installation_id: number;
  github_owner: string;
  github_repo: string;
  default_branch: string;
  is_private: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ListGitHubRepositoriesParams {
  workspace_id?: string;
}

export interface ListGitHubRepositoriesDTO {
  repositories: GitHubRepositoryDTO[];
}

export interface GitHubSettingsPayload {
  workspace_id: string;
  enabled?: boolean;
  pull_request_sidebar?: boolean;
  co_authored_by_trailer?: boolean;
  issue_pr_auto_link?: boolean;
}

export interface GitHubSettingsDTO {
  id: number;
  workspace_id: string;
  enabled: boolean;
  pull_request_sidebar: boolean;
  co_authored_by_trailer: boolean;
  issue_pr_auto_link: boolean;
  updated_by: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubWebhookEventDTO {
  id: number;
  delivery_id: string;
  event_type: string;
  action: string;
  installation_id: number;
  repository_full_name: string;
  payload: string;
  signature: string;
  status: string;
  received_at: string;
  created_at: string;
  updated_at: string;
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
  source: string;
  warnings: string[];
  created_by: number;
  last_indexed_at: string;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeRepoArchitectureSnapshotDTO {
  id: number;
  repository_id: string;
  commit_sha: string;
  stack: string[];
  modules: string[];
  entrypoints: string[];
  test_commands: string[];
  ci_workflows: string[];
  risk_areas: string[];
  summary: string;
  generated_by: string;
  warnings: string[];
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeRepoArchitectureStatusDTO {
  snapshot?: SpecForgeRepoArchitectureSnapshotDTO;
  stale: boolean;
  stale_reasons?: string[];
}

export interface SpecForgePlanBundleDTO {
  requirement?: {
    id: number;
    workspace_id: string;
    project_id: number;
    created_by: number;
    raw_input: string;
    type: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  idea: {
    id: number;
    requirement_id?: number;
    project_id?: number;
    repository_id: string;
    created_by: number;
    raw_input: string;
    type: string;
    status: string;
    created_at: string;
    updated_at: string;
  };
  repo_profile?: SpecForgeRepoProfileDTO;
  project_context?: ProjectContextDTO;
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
    requirement_id?: number;
    idea_id: number;
    product_spec_id: number;
    version: number;
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
    approved_snapshot_hash?: string;
    approved_snapshot_at?: string;
    decision_overrides?: string[];
    created_at: string;
    updated_at: string;
  };
  pr_nodes: SpecForgePRNodeDTO[];
  pr_dag_review?: string[];
}

export interface SpecForgePRNodeDTO {
  id: number;
  plan_id: number;
  repository_id: string;
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
  github_pr_number?: number;
  github_pr_url?: string;
  head_sha?: string;
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

export interface SpecForgeProjectSkillDTO {
  id: number;
  workspace_id: string;
  project_id: number;
  repository_id: string;
  skill_id: number;
  active: boolean;
  sort_order: number;
  created_by: number;
  created_at: string;
  updated_at: string;
  skill?: SpecForgeSkillDTO;
}

export interface SpecForgeSkillRunDTO {
  id: number;
  requirement_id?: number;
  plan_id?: number;
  project_id?: number;
  skill_id?: number;
  stage: string;
  status: string;
  input_summary: string;
  output_summary: string;
  output_json?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeFixAttemptDTO {
  id: number;
  pr_node_id: number;
  failure_type: string;
  ci_log_excerpt: string;
  attempt_number: number;
  status: string;
  confidence: number;
  likely_cause: string;
  recommended_action: string;
  can_auto_fix: boolean;
  workflow_run_id?: number;
  workflow_run_url?: string;
  conclusion?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface SpecForgeEscalationSummaryDTO {
  pr_node_id: number;
  status: string;
  attempts_used: number;
  max_attempts: number;
  failure_types: string[];
  reason: string;
  recommended_option: string;
  decision_options: string[];
  latest_failure_type: string;
  latest_likely_cause: string;
  latest_action: string;
  can_continue_auto_fix: boolean;
}

export interface SpecForgeVerifyPRNodeCIResponseDTO {
  pr_node: SpecForgePRNodeDTO;
  fix_attempt?: SpecForgeFixAttemptDTO;
  escalation_summary?: SpecForgeEscalationSummaryDTO;
  verification_state: string;
  next_action: string;
}

export interface SpecForgePRNodeFailureLogDTO {
  pr_node_id: number;
  workflow_run_id: number;
  job_id: number;
  job_name: string;
  head_sha: string;
  log_excerpt: string;
  failed_steps: string[];
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
  parent_task_id?: number;
  session_id?: string;
  workdir?: string;
}

export interface SpecForgeClaimedPRNodeDTO {
  id: number;
  repository_id: string;
  node_key: string;
  title: string;
  type: string;
  goal: string;
  depends_on: string[];
  expected_files: string[];
  non_goals: string[];
  acceptance_criteria: string[];
  test_commands: string[];
  branch_name: string;
}

export interface SpecForgeClaimedPromptDTO {
  id: number;
  version: string;
  type: string;
  prompt_text: string;
  prompt_hash: string;
}

export interface SpecForgeClaimedExecutionContextDTO {
  repository_id: string;
  branch_name: string;
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

export interface SpecForgeRuntimeSweepResultDTO {
  offline_runtimes: SpecForgeRuntimeDTO[];
  failed_tasks: SpecForgeExecutionBundleDTO['tasks'];
}

export interface SpecForgeTaskSweepResultDTO {
  failed_tasks: SpecForgeExecutionBundleDTO['tasks'];
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
  selected_pr_node_ids?: number[];
  tasks: Array<{
    id: number;
    run_id: number;
    pr_node_id: number;
    executor: string;
    status: string;
    runtime_id?: string;
    attempt_number: number;
    parent_task_id?: number;
    fix_attempt_id?: number;
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
  upsertGitHubInstallation: (payload: UpsertGitHubInstallationPayload) =>
    request.post<GitHubInstallationDTO, UpsertGitHubInstallationPayload>(
      '/github/installations',
      payload
    ),

  syncGitHubInstallation: (payload: SyncGitHubInstallationPayload) =>
    request.post<SyncGitHubInstallationDTO, SyncGitHubInstallationPayload>(
      '/github/installations/sync',
      payload
    ),

  upsertGitHubRepository: (payload: UpsertGitHubRepositoryPayload) =>
    request.post<GitHubRepositoryDTO, UpsertGitHubRepositoryPayload>(
      '/github/repositories',
      payload
    ),

  listGitHubRepositories: (
    params?: ListGitHubRepositoriesParams,
    config?: RequestConfig
  ) => {
    const search = new URLSearchParams();
    if (params?.workspace_id) {
      search.set("workspace_id", params.workspace_id);
    }
    const suffix = search.toString() ? `?${search.toString()}` : "";
    return request.get<ListGitHubRepositoriesDTO>(`/github/repositories${suffix}`, config);
  },

  getGitHubRepository: (repoId: string, config?: RequestConfig) =>
    request.get<GitHubRepositoryDTO>(`/repositories/${repoId}`, config),

  getGitHubSettings: (workspaceId: string, config?: RequestConfig) =>
    request.get<GitHubSettingsDTO>(
      `/github/settings?workspace_id=${encodeURIComponent(workspaceId)}`,
      config
    ),

  upsertGitHubSettings: (payload: GitHubSettingsPayload) =>
    request.put<GitHubSettingsDTO, GitHubSettingsPayload>('/github/settings', payload),

  upsertRepoProfile: (repoId: string, payload: RepoProfilePayload) =>
    request.post<SpecForgeRepoProfileDTO, RepoProfilePayload>(
      `/repositories/${repoId}/profile`,
      payload
    ),

  getRepoProfile: (repoId: string, config?: RequestConfig) =>
    request.get<SpecForgeRepoProfileDTO | null>(`/repositories/${repoId}/profile`, config),

  inferRepoProfile: (repoId: string, payload: InferRepoProfilePayload) =>
    request.post<SpecForgeRepoProfileDTO, InferRepoProfilePayload>(
      `/repositories/${repoId}/profile/infer`,
      payload
    ),

  getRepoArchitectureStatus: (repoId: string, config?: RequestConfig) =>
    request.get<SpecForgeRepoArchitectureStatusDTO>(`/repositories/${repoId}/architecture`, config),

  reindexRepoArchitecture: (repoId: string, payload: ReindexRepoArchitecturePayload) =>
    request.post<SpecForgeRepoArchitectureStatusDTO, ReindexRepoArchitecturePayload>(
      `/repositories/${repoId}/architecture/reindex`,
      payload
    ),

  listGitHubWebhookEvents: (params?: ListGitHubWebhookEventsParams, config?: RequestConfig) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.repository_full_name)
      query.set('repository_full_name', params.repository_full_name);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request.get<{ events: GitHubWebhookEventDTO[] }>(`/github/webhooks${suffix}`, config);
  },

  createIdea: (repoId: string, payload: CreateIdeaPayload) =>
    request.post<SpecForgePlanBundleDTO, CreateIdeaPayload>(
      `/repositories/${repoId}/ideas`,
      payload
    ),

  createProjectIdea: (projectId: number, payload: CreateIdeaPayload) =>
    request.post<SpecForgePlanBundleDTO, CreateIdeaPayload>(
      `/projects/${projectId}/ideas`,
      payload
    ),

  createProjectRequirement: (projectId: number, payload: CreateIdeaPayload) =>
    request.post<SpecForgePlanBundleDTO, CreateIdeaPayload>(
      `/projects/${projectId}/requirements`,
      payload
    ),

  getPlanForIdea: (ideaId: number) => request.get<SpecForgePlanBundleDTO>(`/ideas/${ideaId}/plan`),

  getPlanForRequirement: (requirementId: number) =>
    request.get<SpecForgePlanBundleDTO>(`/requirements/${requirementId}/plan`),

  generateRequirementPlan: (requirementId: number, payload?: CreateIdeaPayload) =>
    request.post<SpecForgePlanBundleDTO, CreateIdeaPayload | undefined>(
      `/requirements/${requirementId}/generate-plan`,
      payload
    ),

  approvePlan: (planId: number, payload: ApprovePlanPayload) =>
    request.post<SpecForgePlanBundleDTO, ApprovePlanPayload>(`/plans/${planId}/approve`, payload),

  listSkills: (repoId: string, config?: RequestConfig) =>
    request.get<{ skills: SpecForgeSkillDTO[] }>(`/repositories/${repoId}/skills`, config),

  upsertSkill: (repoId: string, payload: UpsertSkillPayload) =>
    request.post<{ skill: SpecForgeSkillDTO }, UpsertSkillPayload>(
      `/repositories/${repoId}/skills`,
      payload
    ),

  listProjectSkills: (projectId: number, config?: RequestConfig) =>
    request.get<{ project_skills: SpecForgeProjectSkillDTO[] }>(
      `/projects/${projectId}/skills`,
      config
    ),

  upsertProjectSkill: (projectId: number, payload: UpsertProjectSkillPayload) =>
    request.post<{ project_skill: SpecForgeProjectSkillDTO }, UpsertProjectSkillPayload>(
      `/projects/${projectId}/skills`,
      payload
    ),

  listPlanSkillRuns: (planId: number, config?: RequestConfig) =>
    request.get<{ skill_runs: SpecForgeSkillRunDTO[] }>(`/plans/${planId}/skill-runs`, config),

  listRequirementSkillRuns: (requirementId: number, config?: RequestConfig) =>
    request.get<{ skill_runs: SpecForgeSkillRunDTO[] }>(
      `/requirements/${requirementId}/skill-runs`,
      config
    ),

  compilePrompt: (prNodeId: number, payload?: CompilePromptPayload) =>
    request.post<{ prompt: SpecForgeCompiledPromptDTO }, CompilePromptPayload | undefined>(
      `/pr-nodes/${prNodeId}/prompts`,
      payload
    ),

  preparePRNodeBranch: (payload: PreparePRNodeBranchPayload) =>
    request.post<SpecForgePRNodeDTO, PreparePRNodeBranchPayload>(
      '/github/pr-nodes/prepare-branch',
      payload
    ),

  deliverPRNode: (payload: DeliverPRNodePayload) =>
    request.post<SpecForgePRNodeDTO, DeliverPRNodePayload>('/github/pr-nodes/deliver', payload),

  refreshPRNodeCI: (payload: RefreshPRNodeCIPayload) =>
    request.post<SpecForgePRNodeDTO, RefreshPRNodeCIPayload>(
      '/github/pr-nodes/refresh-ci',
      payload
    ),

  readPRNodeFailureLog: (payload: ReadPRNodeFailureLogPayload) =>
    request.post<SpecForgePRNodeFailureLogDTO, ReadPRNodeFailureLogPayload>(
      '/github/pr-nodes/failure-log',
      payload
    ),

  listFixAttempts: (prNodeId: number) =>
    request.get<SpecForgeFixAttemptDTO[]>(`/pr-nodes/${prNodeId}/fix-attempts`),

  getEscalationSummary: (prNodeId: number) =>
    request.get<SpecForgeEscalationSummaryDTO>(`/pr-nodes/${prNodeId}/escalation-summary`),

  verifyPRNodeCI: (prNodeId: number, payload: VerifyPRNodeCIPayload) =>
    request.post<SpecForgeVerifyPRNodeCIResponseDTO, VerifyPRNodeCIPayload>(
      `/pr-nodes/${prNodeId}/verify-ci`,
      payload
    ),

  createFixAttemptFromCI: (prNodeId: number, payload: CreateFixAttemptFromCIPayload) =>
    request.post<SpecForgeFixAttemptDTO, CreateFixAttemptFromCIPayload>(
      `/pr-nodes/${prNodeId}/fix-attempts/from-ci`,
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

  cancelRun: (runId: number) =>
    request.post<SpecForgeExecutionBundleDTO, undefined>(`/runs/${runId}/cancel`),

  heartbeatRuntime: (payload: RuntimeHeartbeatPayload) =>
    request.post<{ runtime: SpecForgeRuntimeDTO; claim_pending: boolean }, RuntimeHeartbeatPayload>(
      `/runtimes/heartbeat`,
      payload
    ),

  listRuntimes: (params?: ListSpecForgeRuntimesParams, config?: RequestConfig) => {
    const query = new URLSearchParams();
    if (params?.executor) query.set('executor', params.executor);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return request.get<{ runtimes: SpecForgeRuntimeDTO[] }>(`/runtimes${suffix}`, config);
  },

  sweepStaleRuntimes: (payload?: RuntimeSweepPayload) =>
    request.post<SpecForgeRuntimeSweepResultDTO, RuntimeSweepPayload | undefined>(
      `/runtimes/sweep`,
      payload
    ),

  deregisterRuntimes: (payload: RuntimeDeregisterPayload) =>
    request.post<SpecForgeRuntimeSweepResultDTO, RuntimeDeregisterPayload>(
      `/runtimes/deregister`,
      payload
    ),

  listRuntimePendingTasks: (runtimeId: string, executor?: string) => {
    const query = executor ? `?executor=${encodeURIComponent(executor)}` : '';
    return request.get<{ tasks: SpecForgeExecutionBundleDTO['tasks'] }>(
      `/runtimes/${runtimeId}/tasks/pending${query}`
    );
  },

  sweepStaleTasks: (payload?: StaleTaskSweepPayload) =>
    request.post<SpecForgeTaskSweepResultDTO, StaleTaskSweepPayload | undefined>(
      `/tasks/sweep`,
      payload
    ),

  claimTask: (runtimeId: string, payload?: ClaimTaskPayload) =>
    request.post<
      {
        task?: SpecForgeClaimedTaskDTO;
        pr_node?: SpecForgeClaimedPRNodeDTO;
        prompt?: SpecForgeClaimedPromptDTO;
        execution_context?: SpecForgeClaimedExecutionContextDTO;
      },
      ClaimTaskPayload | undefined
    >(`/runtimes/${runtimeId}/claim`, payload),

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

  retryTask: (taskId: number, payload?: RetryTaskPayload) =>
    request.post<SpecForgeExecutionBundleDTO, RetryTaskPayload | undefined>(
      `/tasks/${taskId}/retry`,
      payload
    ),

  createReviewPatchTask: (taskId: number, payload: CreateReviewPatchTaskPayload) =>
    request.post<SpecForgeExecutionBundleDTO, CreateReviewPatchTaskPayload>(
      `/tasks/${taskId}/review-patch`,
      payload
    ),

  submitTaskResult: (taskId: number, payload: SubmitTaskResultPayload) =>
    request.post<SpecForgeExecutionBundleDTO, SubmitTaskResultPayload>(
      `/tasks/${taskId}/result`,
      payload
    ),

  listTaskEvents: (taskId: number, afterSeq?: number) => {
    const query = afterSeq && afterSeq > 0 ? `?after_seq=${afterSeq}` : '';
    return request.get<{ events: SpecForgeTaskEventDTO[] }>(`/tasks/${taskId}/events${query}`);
  },

  createTaskEvent: (taskId: number, payload: CreateTaskEventPayload) =>
    request.post<SpecForgeTaskEventDTO, CreateTaskEventPayload>(`/tasks/${taskId}/events`, payload),

  completeTask: (taskId: number) =>
    request.post<SpecForgeExecutionBundleDTO, undefined>(`/tasks/${taskId}/complete`),
};

export type SpecForgeService = typeof specForgeService;
