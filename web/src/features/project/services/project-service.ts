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

export interface ProjectReadinessCheckDTO {
  key: string;
  label: string;
  status: 'blocked' | 'attention' | 'ready' | string;
  detail?: string;
  required: boolean;
}

export interface ProjectReadinessDTO {
  project_id: number;
  readiness_status: 'blocked' | 'attention' | 'ready' | string;
  next_step: string;
  next_action: string;
  summary: string;
  primary_repository_id?: string;
  has_primary_repository: boolean;
  active_repository_count: number;
  read_only_repository_count: number;
  skill_count: number;
  warning_count: number;
  runtime_count: number;
  checks?: ProjectReadinessCheckDTO[];
  warnings?: string[];
  guardrails?: string[];
}

export interface ProjectRepositoryContextContractFragmentDTO {
  repository_id: string;
  role: string;
  writable: boolean;
  has_profile: boolean;
  has_architecture_snapshot: boolean;
  architecture_stale: boolean;
  stack?: string[];
  test_commands?: string[];
  risk_areas?: string[];
  coding_conventions?: string[];
  architecture_modules?: string[];
  architecture_entrypoints?: string[];
  architecture_ci_workflows?: string[];
  architecture_snapshot_commit?: string;
  skill_names?: string[];
}

export interface ProjectContextContractDTO {
  version: string;
  project_id: number;
  project_name: string;
  primary_repository_id?: string;
  execution_repository_id?: string;
  read_only_repository_ids?: string[];
  active_repository_count: number;
  skill_names?: string[];
  missing_evidence?: string[];
  warnings?: string[];
  prompt_guardrails?: string[];
  repositories?: ProjectRepositoryContextContractFragmentDTO[];
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
  context_contract?: ProjectContextContractDTO;
}

export interface CreateProjectPayload {
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface UpdateProjectPayload {
  name?: string;
  slug?: string;
  description?: string;
  status?: 'active' | 'archived';
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
    request.post<{ workspace: WorkspaceDTO }, CreateWorkspacePayload>(
      '/workspaces',
      payload,
      config
    ),

  listProjects: (workspaceId: string, config?: RequestConfig) =>
    request.get<{ projects: ProjectDTO[] }>(
      `/projects?workspace_id=${encodeURIComponent(workspaceId)}`,
      config
    ),

  createProject: (payload: CreateProjectPayload, config?: RequestConfig) =>
    request.post<{ project: ProjectDTO }, CreateProjectPayload>('/projects', payload, config),

  getProject: (projectId: number, config?: RequestConfig) =>
    request.get<{ project: ProjectDTO }>(`/projects/${projectId}`, config),

  updateProject: (projectId: number, payload: UpdateProjectPayload, config?: RequestConfig) =>
    request.patch<{ project: ProjectDTO }, UpdateProjectPayload>(
      `/projects/${projectId}`,
      payload,
      config
    ),

  deleteProject: (projectId: number, config?: RequestConfig) =>
    request.delete<void>(`/projects/${projectId}`, config),

  getProjectContext: (projectId: number, config?: RequestConfig) =>
    request.get<{ context: ProjectContextDTO }>(`/projects/${projectId}/context`, config),

  getProjectReadiness: (projectId: number, config?: RequestConfig) =>
    request.get<{ readiness: ProjectReadinessDTO }>(`/projects/${projectId}/readiness`, config),

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
