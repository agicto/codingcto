'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  type BindRepositoryPayload,
  type CreateProjectPayload,
  type CreateWorkspacePayload,
  type UpsertProjectExpertPolicyPayload,
  type UpsertProjectRuntimeBindingPayload,
  type UpdateProjectPayload,
  projectService,
} from '@/features/project/services/project-service';

const silentQueryConfig = { skipErrorHandler: true };
const silentQueryMeta = { silentError: true };

export const projectKeys = {
  all: ['projects'] as const,
  workspaces: () => [...projectKeys.all, 'workspaces'] as const,
  list: (workspaceId: string) => [...projectKeys.all, 'list', workspaceId] as const,
  detail: (projectId: number) => [...projectKeys.all, 'detail', projectId] as const,
  repositoryOptions: (projectId: number) =>
    [...projectKeys.all, 'repository-options', projectId] as const,
  readiness: (projectId: number) => [...projectKeys.all, 'readiness', projectId] as const,
  context: (projectId: number) => [...projectKeys.all, 'context', projectId] as const,
  deepWiki: (projectId: number) => [...projectKeys.all, 'deepwiki', projectId] as const,
  expertPolicy: (projectId: number) => [...projectKeys.all, 'expert-policy', projectId] as const,
  runtimeBindings: (projectId: number) =>
    [...projectKeys.all, 'runtime-bindings', projectId] as const,
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

export function useProject(projectId: number) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => projectService.getProject(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useUpdateProject(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, payload }: { projectId: number; payload: UpdateProjectPayload }) =>
      projectService.updateProject(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: response => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list(workspaceId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(response.project.id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(response.project.id) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(response.project.id) });
    },
  });
}

export function useDeleteProject(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: number) => projectService.deleteProject(projectId, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: (_response, projectId) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.list(workspaceId) });
      queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
      queryClient.removeQueries({ queryKey: projectKeys.context(projectId) });
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

export function useProjectDeepWiki(projectId: number) {
  return useQuery({
    queryKey: projectKeys.deepWiki(projectId),
    queryFn: () => projectService.listProjectDeepWiki(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    refetchInterval: query => {
      const repositories = query.state.data?.repositories ?? [];
      return repositories.some(item => {
        const status = item.index?.status || item.source?.status;
        return status && status !== 'ready' && status !== 'failed';
      })
        ? 2000
        : false;
    },
    meta: silentQueryMeta,
  });
}

export function useProjectRepositoryOptions(projectId: number) {
  return useQuery({
    queryKey: projectKeys.repositoryOptions(projectId),
    queryFn: () => projectService.listRepositoryOptions(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useRefreshProjectContextSnapshot(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => projectService.reindexProjectContext(projectId, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useReindexProjectRepositoryDeepWiki(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) =>
      projectService.reindexProjectRepositoryDeepWiki(projectId, repositoryId, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.deepWiki(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useDeleteProjectRepositoryDeepWiki(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) =>
      projectService.deleteProjectRepositoryDeepWiki(projectId, repositoryId, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.deepWiki(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useProjectReadiness(projectId: number) {
  return useQuery({
    queryKey: projectKeys.readiness(projectId),
    queryFn: () => projectService.getProjectReadiness(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useProjectExpertPolicy(projectId: number) {
  return useQuery({
    queryKey: projectKeys.expertPolicy(projectId),
    queryFn: () => projectService.getProjectExpertPolicy(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useProjectRuntimeBindings(projectId: number) {
  return useQuery({
    queryKey: projectKeys.runtimeBindings(projectId),
    queryFn: () => projectService.listProjectRuntimeBindings(projectId, silentQueryConfig),
    enabled: Boolean(projectId),
    meta: silentQueryMeta,
  });
}

export function useCreateProjectExpertPolicy(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertProjectExpertPolicyPayload) =>
      projectService.createProjectExpertPolicy(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.expertPolicy(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useUpdateProjectExpertPolicy(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      policyId,
      payload,
    }: {
      policyId: number;
      payload: UpsertProjectExpertPolicyPayload;
    }) => projectService.updateProjectExpertPolicy(projectId, policyId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.expertPolicy(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useCreateProjectRuntimeBinding(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpsertProjectRuntimeBindingPayload) =>
      projectService.createProjectRuntimeBinding(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.runtimeBindings(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useUpdateProjectRuntimeBinding(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      bindingId,
      payload,
    }: {
      bindingId: number;
      payload: UpsertProjectRuntimeBindingPayload;
    }) =>
      projectService.updateProjectRuntimeBinding(projectId, bindingId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.runtimeBindings(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
    },
  });
}

export function useBindProjectRepository(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: BindRepositoryPayload) =>
      projectService.bindRepository(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.repositoryOptions(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.deepWiki(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.runtimeBindings(projectId) });
    },
  });
}

export function useBindAnyProjectRepository() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      payload,
    }: {
      projectId: number;
      payload: BindRepositoryPayload;
    }) => projectService.bindRepository(projectId, payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: (_response, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.repositoryOptions(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.deepWiki(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.runtimeBindings(projectId) });
    },
  });
}

export function useUnbindProjectRepository(projectId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (repositoryId: string) =>
      projectService.unbindRepository(projectId, repositoryId, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.repositoryOptions(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.deepWiki(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.runtimeBindings(projectId) });
    },
  });
}
