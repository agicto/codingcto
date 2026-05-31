import { env } from '@/config/env';
import { createRequest, type RequestConfig } from '@/http';

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

export interface ProjectDTO {
  id: number;
  workspace_id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'archived' | string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceDTO {
  id: number;
  workspace_id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'archived' | string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRepositoryDTO {
  id: number;
  workspace_id: string;
  project_id: number;
  repository_id: string;
  role: 'primary' | 'dependency' | 'docs' | 'infra' | string;
  active: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRepoProfileDTO {
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

export interface ProjectRepoArchitectureSnapshotDTO {
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

export interface ProjectSkillDTO {
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

export interface ProjectRepositoryContextDTO {
  repository: ProjectRepositoryDTO;
  profile?: ProjectRepoProfileDTO;
  architecture_snapshot?: ProjectRepoArchitectureSnapshotDTO;
  architecture_stale: boolean;
  architecture_warnings?: string[];
  skills: ProjectSkillDTO[];
  warnings?: string[];
}

export interface ProjectContextReadinessDTO {
  has_primary_repository: boolean;
  active_repository_count: number;
  read_only_repository_count: number;
  skill_count: number;
  warning_count: number;
  guardrails?: string[];
  summary: string;
  next_action: string;
}

export interface ProjectContextDTO {
  project: ProjectDTO;
  repositories: ProjectRepositoryDTO[];
  repository_contexts: ProjectRepositoryContextDTO[];
  primary_repository_id?: string;
  execution_repository_id?: string;
  read_only_repository_ids?: string[];
  execution_guardrails?: string[];
  readiness?: ProjectContextReadinessDTO;
}

export interface CreateProjectPayload {
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface CreateWorkspacePayload {
  workspace_id?: string;
  name: string;
  slug?: string;
  description?: string;
}

export interface BindRepositoryPayload {
  repository_id: string;
  role: 'primary' | 'dependency' | 'docs' | 'infra';
}

export const projectService = {
  listWorkspaces: (config?: RequestConfig) =>
    request.get<{ workspaces: WorkspaceDTO[] }>('/workspaces', config),

  createWorkspace: (payload: CreateWorkspacePayload, config?: RequestConfig) =>
    request.post<{ workspace: WorkspaceDTO }, CreateWorkspacePayload>('/workspaces', payload, config),

  listProjects: (workspaceId: string, config?: RequestConfig) =>
    request.get<{ projects: ProjectDTO[] }>(
      `/projects?workspace_id=${encodeURIComponent(workspaceId)}`,
      config
    ),

  createProject: (payload: CreateProjectPayload, config?: RequestConfig) =>
    request.post<{ project: ProjectDTO }, CreateProjectPayload>('/projects', payload, config),

  getProjectContext: (projectId: number, config?: RequestConfig) =>
    request.get<{ context: ProjectContextDTO }>(`/projects/${projectId}/context`, config),

  bindRepository: (projectId: number, payload: BindRepositoryPayload, config?: RequestConfig) =>
    request.post<{ repository: ProjectRepositoryDTO }, BindRepositoryPayload>(
      `/projects/${projectId}/repositories`,
      payload,
      config
    ),

  unbindRepository: (projectId: number, repositoryId: string, config?: RequestConfig) =>
    request.delete<void>(
      `/projects/${projectId}/repositories/${encodeURIComponent(repositoryId)}`,
      config
    ),
};
