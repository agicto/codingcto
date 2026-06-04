import { env } from '@/config/env';
import { createRequest } from '@/http';

export type {
  SpecForgeRuntimeDTO as CodingCTORuntimeDTO,
  SpecForgeSkillDTO as CodingCTOSkillDTO,
} from '@/features/specforge/services/specforge-service';

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

export interface CodingCTODirectAgentTaskDTO {
  id: number;
  created_by: number;
  repository_id: string;
  title: string;
  prompt: string;
  executor: string;
  status: string;
  runtime_id?: string;
  session_id?: string;
  workdir?: string;
  process_ref?: string;
  output_log?: string;
  error_log?: string;
  exit_code?: number;
  failure_reason?: string;
  dispatched_at?: string;
  started_at?: string;
  finished_at?: string;
  last_progress_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CodingCTODirectTaskEventDTO {
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

export interface CreateCodingCTODirectAgentTaskPayload {
  repository_id: string;
  title?: string;
  prompt: string;
  executor?: string;
  runtime_id?: string;
}

export interface ListCodingCTODirectAgentTasksParams {
  limit?: number;
  repository_id?: string;
  executor?: string;
  runtime_id?: string;
}

export const codingCTOService = {
  createDirectAgentTask: (payload: CreateCodingCTODirectAgentTaskPayload) =>
    request.post<CodingCTODirectAgentTaskDTO, CreateCodingCTODirectAgentTaskPayload>(
      '/agent-tasks',
      payload
    ),

  listDirectAgentTasks: (params: ListCodingCTODirectAgentTasksParams = {}) => {
    const query = new URLSearchParams();
    query.set('limit', String(params.limit ?? 10));
    if (params.repository_id) {
      query.set('repository_id', params.repository_id);
    }
    if (params.executor) {
      query.set('executor', params.executor);
    }
    if (params.runtime_id) {
      query.set('runtime_id', params.runtime_id);
    }
    return request.get<{ tasks: CodingCTODirectAgentTaskDTO[] }>(`/agent-tasks?${query.toString()}`);
  },

  getDirectAgentTask: (taskId: number) =>
    request.get<CodingCTODirectAgentTaskDTO>(`/agent-tasks/${taskId}`),

  cancelDirectAgentTask: (taskId: number) =>
    request.post<CodingCTODirectAgentTaskDTO, undefined>(`/agent-tasks/${taskId}/cancel`),

  listDirectTaskEvents: (taskId: number) =>
    request.get<{ events: CodingCTODirectTaskEventDTO[] }>(`/agent-tasks/${taskId}/events`),
};
