'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { activeFixAttemptPollMs, hasActiveFixAttempt } from '@/features/specforge/fix-attempts';
import {
  type ApprovePlanPayload,
  type CompilePromptPayload,
  type ClaimTaskPayload,
  type CreateFixAttemptFromCIPayload,
  type CreateReviewPatchTaskPayload,
  type CreateTaskEventPayload,
  type CreateIdeaPayload,
  type DispatchRunPayload,
  type GitHubSettingsPayload,
  type InferRepoProfilePayload,
  type ListGitHubRepositoriesParams,
  type ListGitHubWebhookEventsParams,
  type ListSpecForgeRuntimesParams,
  type PreparePRNodeBranchPayload,
  type ReadPRNodeFailureLogPayload,
  type ReindexRepoArchitecturePayload,
  type RepoProfilePayload,
  type DeliverPRNodePayload,
  type RefreshPRNodeCIPayload,
  type RetryTaskPayload,
  type RuntimeDeregisterPayload,
  type RuntimeHeartbeatPayload,
  type RuntimeSweepPayload,
  type StartRunPayload,
  type StaleTaskSweepPayload,
  type SyncGitHubInstallationPayload,
  type SubmitTaskResultPayload,
  type UpsertGitHubInstallationPayload,
  type UpsertGitHubRepositoryPayload,
  type UpsertProjectSkillPayload,
  type UpsertSkillPayload,
  type VerifyPRNodeCIPayload,
  specForgeService,
} from '@/features/specforge/services/specforge-service';

const silentQueryConfig = { skipErrorHandler: true };
const silentQueryMeta = { silentError: true };

export const specForgeKeys = {
  all: ['specforge'] as const,
  repoProfile: (repoId: string) => [...specForgeKeys.all, 'repo-profile', repoId] as const,
  repoArchitecture: (repoId: string) =>
    [...specForgeKeys.all, 'repo-architecture', repoId] as const,
  skills: (repoId: string) => [...specForgeKeys.all, 'skills', repoId] as const,
  projectSkills: (projectId: number) =>
    [...specForgeKeys.all, 'project-skills', projectId] as const,
  planSkillRuns: (planId: number) => [...specForgeKeys.all, 'plan-skill-runs', planId] as const,
  ideaPlan: (ideaId: number) => [...specForgeKeys.all, 'idea-plan', ideaId] as const,
  run: (runId: number) => [...specForgeKeys.all, 'run', runId] as const,
  taskEvents: (taskId: number, afterSeq?: number) =>
    [...specForgeKeys.all, 'task-events', taskId, afterSeq ?? 0] as const,
  fixAttempts: (prNodeId: number) => [...specForgeKeys.all, 'fix-attempts', prNodeId] as const,
  escalationSummary: (prNodeId: number) =>
    [...specForgeKeys.all, 'escalation-summary', prNodeId] as const,
  runtimePendingTasks: (runtimeId: string, executor?: string) =>
    [...specForgeKeys.all, 'runtime-pending-tasks', runtimeId, executor ?? ''] as const,
  runtimes: (params?: ListSpecForgeRuntimesParams) =>
    [
      ...specForgeKeys.all,
      'runtimes',
      params?.executor ?? '',
      params?.status ?? '',
      params?.limit ?? 50,
    ] as const,
  githubWebhookEvents: (params?: ListGitHubWebhookEventsParams) =>
    [
      ...specForgeKeys.all,
      'github-webhook-events',
      params?.status ?? '',
      params?.repository_full_name ?? '',
      params?.limit ?? 50,
    ] as const,
  githubRepositories: (params?: ListGitHubRepositoriesParams) =>
    [...specForgeKeys.all, "github-repositories", params?.workspace_id ?? ""] as const,
  githubRepository: (repoId: string) =>
    [...specForgeKeys.all, 'github-repository', repoId] as const,
  githubSettings: (workspaceId: string) =>
    [...specForgeKeys.all, 'github-settings', workspaceId] as const,
};

export function useRepoProfile(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.repoProfile(repoId),
    queryFn: () => specForgeService.getRepoProfile(repoId, silentQueryConfig),
    enabled: Boolean(repoId),
    meta: silentQueryMeta,
  });
}

export function useInferRepoProfile(repoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: InferRepoProfilePayload) =>
      specForgeService.inferRepoProfile(repoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.repoProfile(repoId) });
    },
  });
}

export function useRepoArchitectureStatus(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.repoArchitecture(repoId),
    queryFn: () => specForgeService.getRepoArchitectureStatus(repoId, silentQueryConfig),
    enabled: Boolean(repoId),
    meta: silentQueryMeta,
  });
}

export function useReindexRepoArchitecture(repoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: ReindexRepoArchitecturePayload) =>
      specForgeService.reindexRepoArchitecture(repoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.repoArchitecture(repoId) });
      queryClient.invalidateQueries({ queryKey: specForgeKeys.repoProfile(repoId) });
    },
  });
}

export function useSpecForgeSkills(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.skills(repoId),
    queryFn: () => specForgeService.listSkills(repoId, silentQueryConfig),
    enabled: Boolean(repoId),
    meta: silentQueryMeta,
  });
}

export function useSpecForgeProjectSkills(projectId?: number) {
  return useQuery({
    queryKey: specForgeKeys.projectSkills(projectId ?? 0),
    queryFn: () => specForgeService.listProjectSkills(projectId ?? 0, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useSpecForgePlanSkillRuns(planId?: number) {
  return useQuery({
    queryKey: specForgeKeys.planSkillRuns(planId ?? 0),
    queryFn: () => specForgeService.listPlanSkillRuns(planId ?? 0, silentQueryConfig),
    enabled: Boolean(planId),
    meta: silentQueryMeta,
  });
}

export function usePlanForIdea(ideaId?: number) {
  return useQuery({
    queryKey: specForgeKeys.ideaPlan(ideaId ?? 0),
    queryFn: () => specForgeService.getPlanForIdea(ideaId ?? 0),
    enabled: Boolean(ideaId),
  });
}

export function useExecutionRun(
  runId?: number,
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: specForgeKeys.run(runId ?? 0),
    queryFn: () => specForgeService.getRun(runId ?? 0),
    enabled: Boolean(runId) && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval,
  });
}

export function useSpecForgeTaskEvents(taskId?: number, afterSeq?: number) {
  return useQuery({
    queryKey: specForgeKeys.taskEvents(taskId ?? 0, afterSeq),
    queryFn: () => specForgeService.listTaskEvents(taskId ?? 0, afterSeq),
    enabled: Boolean(taskId),
  });
}

export function useSpecForgeFixAttempts(prNodeId?: number) {
  return useQuery({
    queryKey: specForgeKeys.fixAttempts(prNodeId ?? 0),
    queryFn: () => specForgeService.listFixAttempts(prNodeId ?? 0),
    enabled: Boolean(prNodeId),
    refetchInterval: query =>
      hasActiveFixAttempt(query.state.data) ? activeFixAttemptPollMs : false,
  });
}

export function useSpecForgeEscalationSummary(prNodeId?: number, refetchWhileActive = false) {
  return useQuery({
    queryKey: specForgeKeys.escalationSummary(prNodeId ?? 0),
    queryFn: () => specForgeService.getEscalationSummary(prNodeId ?? 0),
    enabled: Boolean(prNodeId),
    refetchInterval: refetchWhileActive ? activeFixAttemptPollMs : false,
  });
}

export function useSpecForgeRuntimePendingTasks(runtimeId?: string, executor?: string) {
  return useQuery({
    queryKey: specForgeKeys.runtimePendingTasks(runtimeId ?? '', executor),
    queryFn: () => specForgeService.listRuntimePendingTasks(runtimeId ?? '', executor),
    enabled: Boolean(runtimeId),
  });
}

export function useSpecForgeRuntimes(params?: ListSpecForgeRuntimesParams) {
  return useQuery({
    queryKey: specForgeKeys.runtimes(params),
    queryFn: () => specForgeService.listRuntimes(params, silentQueryConfig),
    meta: silentQueryMeta,
  });
}

export function useGitHubWebhookEvents(params?: ListGitHubWebhookEventsParams) {
  return useQuery({
    queryKey: specForgeKeys.githubWebhookEvents(params),
    queryFn: () => specForgeService.listGitHubWebhookEvents(params, silentQueryConfig),
    meta: silentQueryMeta,
  });
}

export function useGitHubRepository(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.githubRepository(repoId),
    queryFn: () => specForgeService.getGitHubRepository(repoId, silentQueryConfig),
    enabled: Boolean(repoId),
    meta: silentQueryMeta,
  });
}

export function useGitHubRepositories(params?: ListGitHubRepositoriesParams) {
  return useQuery({
    queryKey: specForgeKeys.githubRepositories(params),
    queryFn: () => specForgeService.listGitHubRepositories(params, silentQueryConfig),
    meta: silentQueryMeta,
  });
}

export function useGitHubSettings(workspaceId: string) {
  return useQuery({
    queryKey: specForgeKeys.githubSettings(workspaceId),
    queryFn: () => specForgeService.getGitHubSettings(workspaceId, silentQueryConfig),
    enabled: Boolean(workspaceId),
    meta: silentQueryMeta,
  });
}

export function useUpsertGitHubSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: GitHubSettingsPayload) => specForgeService.upsertGitHubSettings(payload),
    onSuccess: settings => {
      queryClient.setQueryData(specForgeKeys.githubSettings(settings.workspace_id), settings);
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.githubSettings(settings.workspace_id),
      });
    },
  });
}

export function useUpsertGitHubInstallation() {
  return useMutation({
    mutationFn: (payload: UpsertGitHubInstallationPayload) =>
      specForgeService.upsertGitHubInstallation(payload),
  });
}

export function useSyncGitHubInstallation() {
  return useMutation({
    mutationFn: (payload: SyncGitHubInstallationPayload) =>
      specForgeService.syncGitHubInstallation(payload),
  });
}

export function useUpsertGitHubRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertGitHubRepositoryPayload) =>
      specForgeService.upsertGitHubRepository(payload),
    onSuccess: repository => {
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.githubRepositories({ workspace_id: repository.workspace_id }),
      });
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.githubRepository(repository.repository_id),
      });
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.repoProfile(repository.repository_id),
      });
    },
  });
}

export function useUpsertRepoProfile(repoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RepoProfilePayload) =>
      specForgeService.upsertRepoProfile(repoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.repoProfile(repoId) });
    },
  });
}

export function useUpsertSpecForgeSkill(repoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertSkillPayload) => specForgeService.upsertSkill(repoId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.skills(repoId) });
    },
  });
}

export function useUpsertSpecForgeProjectSkill(projectId?: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertProjectSkillPayload) => {
      if (!projectId) {
        throw new Error('Project ID is required to save a project skill.');
      }
      return specForgeService.upsertProjectSkill(projectId, payload);
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: specForgeKeys.projectSkills(projectId) });
      }
    },
  });
}

export function useCreateSpecForgeIdea(repoId: string) {
  return useMutation({
    mutationFn: (payload: CreateIdeaPayload) => specForgeService.createIdea(repoId, payload),
  });
}

export function useCreateSpecForgeProjectIdea(projectId?: number) {
  return useMutation({
    mutationFn: (payload: CreateIdeaPayload) => {
      if (!projectId) {
        throw new Error('Project ID is required to create a project-scoped CodingCTO requirement.');
      }
      return specForgeService.createProjectRequirement(projectId, payload);
    },
  });
}

export function useApproveSpecForgePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, payload }: { planId: number; payload: ApprovePlanPayload }) =>
      specForgeService.approvePlan(planId, payload),
    onSuccess: bundle => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.ideaPlan(bundle.idea.id) });
    },
  });
}

export function useCompileSpecForgePrompt() {
  return useMutation({
    mutationFn: ({ prNodeId, payload }: { prNodeId: number; payload?: CompilePromptPayload }) =>
      specForgeService.compilePrompt(prNodeId, payload),
  });
}

export function usePrepareSpecForgePRNodeBranch() {
  return useMutation({
    mutationFn: (payload: PreparePRNodeBranchPayload) =>
      specForgeService.preparePRNodeBranch(payload),
  });
}

export function useDeliverSpecForgePRNode() {
  return useMutation({
    mutationFn: (payload: DeliverPRNodePayload) => specForgeService.deliverPRNode(payload),
  });
}

export function useRefreshSpecForgePRNodeCI() {
  return useMutation({
    mutationFn: (payload: RefreshPRNodeCIPayload) => specForgeService.refreshPRNodeCI(payload),
  });
}

export function useReadSpecForgePRNodeFailureLog() {
  return useMutation({
    mutationFn: (payload: ReadPRNodeFailureLogPayload) =>
      specForgeService.readPRNodeFailureLog(payload),
  });
}

export function useCreateSpecForgeFixAttemptFromCI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      prNodeId,
      payload,
    }: {
      prNodeId: number;
      payload: CreateFixAttemptFromCIPayload;
    }) => specForgeService.createFixAttemptFromCI(prNodeId, payload),
    onSuccess: attempt => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.fixAttempts(attempt.pr_node_id) });
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.escalationSummary(attempt.pr_node_id),
      });
    },
  });
}

export function useVerifySpecForgePRNodeCI() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ prNodeId, payload }: { prNodeId: number; payload: VerifyPRNodeCIPayload }) =>
      specForgeService.verifyPRNodeCI(prNodeId, payload),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.fixAttempts(result.pr_node.id) });
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.escalationSummary(result.pr_node.id),
      });
    },
  });
}

export function useStartExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, payload }: { planId: number; payload?: StartRunPayload }) =>
      specForgeService.startRun(planId, payload),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useDispatchExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, payload }: { runId: number; payload?: DispatchRunPayload }) =>
      specForgeService.dispatchRun(runId, payload),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useCancelExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: number) => specForgeService.cancelRun(runId),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useHeartbeatSpecForgeRuntime() {
  return useMutation({
    mutationFn: (payload: RuntimeHeartbeatPayload) => specForgeService.heartbeatRuntime(payload),
  });
}

export function useSweepSpecForgeRuntimes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload?: RuntimeSweepPayload) => specForgeService.sweepStaleRuntimes(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.all });
    },
  });
}

export function useDeregisterSpecForgeRuntimes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RuntimeDeregisterPayload) => specForgeService.deregisterRuntimes(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.all });
    },
  });
}

export function useSweepSpecForgeTasks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload?: StaleTaskSweepPayload) => specForgeService.sweepStaleTasks(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: specForgeKeys.all });
    },
  });
}

export function useClaimSpecForgeTask() {
  return useMutation({
    mutationFn: ({ runtimeId, payload }: { runtimeId: string; payload?: ClaimTaskPayload }) =>
      specForgeService.claimTask(runtimeId, payload),
  });
}

export function useSubmitExecutionTaskResult() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: SubmitTaskResultPayload }) =>
      specForgeService.submitTaskResult(taskId, payload),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useRetryExecutionTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload?: RetryTaskPayload }) =>
      specForgeService.retryTask(taskId, payload),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useCreateReviewPatchTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: CreateReviewPatchTaskPayload }) =>
      specForgeService.createReviewPatchTask(taskId, payload),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useCreateSpecForgeTaskEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: CreateTaskEventPayload }) =>
      specForgeService.createTaskEvent(taskId, payload),
    onSuccess: event => {
      queryClient.invalidateQueries({
        queryKey: specForgeKeys.taskEvents(event.task_id),
      });
    },
  });
}

export function useCompleteExecutionTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: number) => specForgeService.completeTask(taskId),
    onSuccess: bundle => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}
