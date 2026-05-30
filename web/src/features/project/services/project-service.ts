import { env } from "@/config/env";
import { createRequest, type RequestConfig } from "@/http";

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

export interface ProjectDTO {
  id: number;
  workspace_id: string;
  name: string;
  slug: string;
  description: string;
  status: "active" | "archived" | string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectRepositoryDTO {
  id: number;
  workspace_id: string;
  project_id: number;
  repository_id: string;
  role: "primary" | "dependency" | "docs" | "infra" | string;
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
  skills: ProjectSkillDTO[];
  warnings?: string[];
}

export interface ProjectContextDTO {
  project: ProjectDTO;
  repositories: ProjectRepositoryDTO[];
  repository_contexts: ProjectRepositoryContextDTO[];
}

export interface CreateProjectPayload {
  workspace_id: string;
  name: string;
  slug: string;
  description?: string;
}

export interface BindRepositoryPayload {
  repository_id: string;
  role: "primary" | "dependency" | "docs" | "infra";
}

export const projectService = {
  listProjects: (workspaceId: string, config?: RequestConfig) =>
    request.get<{ projects: ProjectDTO[] }>(
      `/projects?workspace_id=${encodeURIComponent(workspaceId)}`,
      config
    ),

  createProject: (payload: CreateProjectPayload, config?: RequestConfig) =>
    request.post<{ project: ProjectDTO }, CreateProjectPayload>("/projects", payload, config),

  getProjectContext: (projectId: number, config?: RequestConfig) =>
    request.get<{ context: ProjectContextDTO }>(`/projects/${projectId}/context`, config),

  bindRepository: (projectId: number, payload: BindRepositoryPayload, config?: RequestConfig) =>
    request.post<{ repository: ProjectRepositoryDTO }, BindRepositoryPayload>(
      `/projects/${projectId}/repositories`,
      payload,
      config
    ),
};
