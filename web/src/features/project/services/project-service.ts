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

export interface ProjectContextDTO {
  project: ProjectDTO;
  repositories: ProjectRepositoryDTO[];
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
