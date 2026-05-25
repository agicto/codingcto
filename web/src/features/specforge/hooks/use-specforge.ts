"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ApprovePlanPayload,
  type CompilePromptPayload,
  type ClaimTaskPayload,
  type CreateTaskEventPayload,
  type CreateIdeaPayload,
  type DispatchRunPayload,
  type RepoProfilePayload,
  type RetryTaskPayload,
  type RuntimeHeartbeatPayload,
  type RuntimeSweepPayload,
  type StartRunPayload,
  type StaleTaskSweepPayload,
  type SubmitTaskResultPayload,
  type UpsertSkillPayload,
  specForgeService,
} from "@/features/specforge/services/specforge-service";

export const specForgeKeys = {
  all: ["specforge"] as const,
  repoProfile: (repoId: string) => [...specForgeKeys.all, "repo-profile", repoId] as const,
  skills: (repoId: string) => [...specForgeKeys.all, "skills", repoId] as const,
  ideaPlan: (ideaId: number) => [...specForgeKeys.all, "idea-plan", ideaId] as const,
  run: (runId: number) => [...specForgeKeys.all, "run", runId] as const,
  taskEvents: (taskId: number, afterSeq?: number) =>
    [...specForgeKeys.all, "task-events", taskId, afterSeq ?? 0] as const,
};

export function useRepoProfile(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.repoProfile(repoId),
    queryFn: () => specForgeService.getRepoProfile(repoId),
    enabled: Boolean(repoId),
  });
}

export function useSpecForgeSkills(repoId: string) {
  return useQuery({
    queryKey: specForgeKeys.skills(repoId),
    queryFn: () => specForgeService.listSkills(repoId),
    enabled: Boolean(repoId),
  });
}

export function usePlanForIdea(ideaId?: number) {
  return useQuery({
    queryKey: specForgeKeys.ideaPlan(ideaId ?? 0),
    queryFn: () => specForgeService.getPlanForIdea(ideaId ?? 0),
    enabled: Boolean(ideaId),
  });
}

export function useExecutionRun(runId?: number) {
  return useQuery({
    queryKey: specForgeKeys.run(runId ?? 0),
    queryFn: () => specForgeService.getRun(runId ?? 0),
    enabled: Boolean(runId),
  });
}

export function useSpecForgeTaskEvents(taskId?: number, afterSeq?: number) {
  return useQuery({
    queryKey: specForgeKeys.taskEvents(taskId ?? 0, afterSeq),
    queryFn: () => specForgeService.listTaskEvents(taskId ?? 0, afterSeq),
    enabled: Boolean(taskId),
  });
}

export function useUpsertRepoProfile(repoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RepoProfilePayload) => specForgeService.upsertRepoProfile(repoId, payload),
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

export function useCreateSpecForgeIdea(repoId: string) {
  return useMutation({
    mutationFn: (payload: CreateIdeaPayload) => specForgeService.createIdea(repoId, payload),
  });
}

export function useApproveSpecForgePlan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, payload }: { planId: number; payload: ApprovePlanPayload }) =>
      specForgeService.approvePlan(planId, payload),
    onSuccess: (bundle) => {
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

export function useStartExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ planId, payload }: { planId: number; payload?: StartRunPayload }) =>
      specForgeService.startRun(planId, payload),
    onSuccess: (bundle) => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useDispatchExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, payload }: { runId: number; payload?: DispatchRunPayload }) =>
      specForgeService.dispatchRun(runId, payload),
    onSuccess: (bundle) => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useCancelExecutionRun() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (runId: number) => specForgeService.cancelRun(runId),
    onSuccess: (bundle) => {
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
    onSuccess: (bundle) => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useRetryExecutionTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload?: RetryTaskPayload }) =>
      specForgeService.retryTask(taskId, payload),
    onSuccess: (bundle) => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}

export function useCreateSpecForgeTaskEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, payload }: { taskId: number; payload: CreateTaskEventPayload }) =>
      specForgeService.createTaskEvent(taskId, payload),
    onSuccess: (event) => {
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
    onSuccess: (bundle) => {
      queryClient.setQueryData(specForgeKeys.run(bundle.run.id), bundle);
    },
  });
}
