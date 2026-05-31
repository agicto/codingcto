"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type BindRepositoryPayload,
  type CreateProjectPayload,
  type CreateWorkspacePayload,
  projectService,
} from "@/features/project/services/project-service";

const silentQueryConfig = { skipErrorHandler: true };
const silentQueryMeta = { silentError: true };

export const projectKeys = {
  all: ["projects"] as const,
  workspaces: () => [...projectKeys.all, "workspaces"] as const,
  list: (workspaceId: string) => [...projectKeys.all, "list", workspaceId] as const,
  context: (projectId: number) => [...projectKeys.all, "context", projectId] as const,
};

export function useWorkspaces() {
  return useQuery({
    queryKey: projectKeys.workspaces(),
    queryFn: () => projectService.listWorkspaces(silentQueryConfig),
    meta: silentQueryMeta,
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateWorkspacePayload) =>
      projectService.createWorkspace(payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.workspaces() });
    },
  });
}

export function useProjects(workspaceId: string) {
  return useQuery({
    queryKey: projectKeys.list(workspaceId),
    queryFn: () => projectService.listProjects(workspaceId, silentQueryConfig),
    enabled: Boolean(workspaceId),
    meta: silentQueryMeta,
  });
}

export function useCreateProject(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateProjectPayload) =>
      projectService.createProject(payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list(workspaceId) });
    },
  });
}

export function useProjectContext(projectId: number) {
  return useQuery({
    queryKey: projectKeys.context(projectId),
    queryFn: () => projectService.getProjectContext(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useBindProjectRepository(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BindRepositoryPayload) =>
      projectService.bindRepository(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
    },
  });
}
