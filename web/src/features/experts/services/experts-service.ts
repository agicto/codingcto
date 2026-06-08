import { env } from '@/config/env';
import { createRequest } from '@/http';

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

export interface ExpertSkillInput {
  id?: string | number;
  name: string;
  description?: string;
  content?: string;
  target_agents?: string[];
}

export interface ExpertRepositoryInput {
  repository_id?: string;
  full_name?: string;
  default_branch?: string;
}

export interface GenerateExpertImplementationPlanPayload {
  idea: string;
  mode?: 'mvp' | 'standard' | 'deep';
  repository?: ExpertRepositoryInput;
  skills?: ExpertSkillInput[];
}

export interface ExpertImplementationPlan {
  title: string;
  summary: string;
  problem: string;
  target_users: string[];
  scope: {
    in_scope: string[];
    out_of_scope: string[];
  };
  expert_skills: Array<{
    name: string;
    how_applied: string;
    constraints: string[];
  }>;
  architecture: {
    modules: string[];
    data_flow: string[];
    apis: string[];
    risks: string[];
  };
  milestones: Array<{
    id: string;
    title: string;
    deliverables: string[];
    acceptance_criteria: string[];
    files: string[];
    tests: string[];
  }>;
  risks: Array<{
    risk: string;
    mitigation: string;
  }>;
  open_questions: string[];
  next_steps: string[];
}

export interface ExpertImplementationPlanResponse {
  plan: ExpertImplementationPlan;
  markdown: string;
  provider: 'deepseek';
  model: string;
  tool_call: {
    name: string;
    id?: string;
    finish_reason?: string;
  };
  usage: Record<string, unknown>;
}

export interface ExpertPlanStreamEvent {
  type: 'status' | 'thinking' | 'tool_call' | 'progress' | 'result' | 'error';
  message?: string;
  phase?: string;
  tool_name?: string;
  tool_call_id?: string;
  arguments_bytes?: number;
  details?: string[];
  response?: ExpertImplementationPlanResponse;
  error_code?: string;
  error?: string;
}

export interface GenerateExpertImplementationPlanStreamOptions {
  signal?: AbortSignal;
  onEvent?: (event: ExpertPlanStreamEvent) => void;
}

export const expertsService = {
  generateImplementationPlan: (payload: GenerateExpertImplementationPlanPayload) =>
    request.post<ExpertImplementationPlanResponse, GenerateExpertImplementationPlanPayload>(
      '/experts/implementation-plan',
      payload,
      { skipErrorHandler: true }
    ),
  generateImplementationPlanStream: async (
    payload: GenerateExpertImplementationPlanPayload,
    options: GenerateExpertImplementationPlanStreamOptions = {}
  ) => {
    const response = await fetch(expertStreamURL(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        accept: 'application/x-ndjson',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: options.signal,
    });

    if (!response.ok) {
      const body = await readErrorBody(response);
      throw new Error(body);
    }
    if (!response.body) {
      throw new Error('当前浏览器不支持流式响应。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: ExpertImplementationPlanResponse | null = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const event = parseStreamEvent(line);
        if (!event) {
          continue;
        }
        options.onEvent?.(event);
        if (event.type === 'error') {
          throw new Error(event.error || event.message || '生成实施方案失败。');
        }
        if (event.type === 'result' && event.response) {
          result = event.response;
        }
      }
    }

    const tail = decoder.decode();
    if (tail) {
      buffer += tail;
    }
    const event = parseStreamEvent(buffer);
    if (event) {
      options.onEvent?.(event);
      if (event.type === 'error') {
        throw new Error(event.error || event.message || '生成实施方案失败。');
      }
      if (event.type === 'result' && event.response) {
        result = event.response;
      }
    }
    if (!result) {
      throw new Error('模型流结束，但没有返回实施方案。');
    }
    return result;
  },
};

function expertStreamURL() {
  const base = env.NEXT_PUBLIC_SPECFORGE_API_URL.replace(/\/$/, '');
  return `${base}/experts/implementation-plan/stream`;
}

function parseStreamEvent(line: string): ExpertPlanStreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as ExpertPlanStreamEvent;
  } catch {
    return {
      type: 'progress',
      message: trimmed,
    };
  }
}

async function readErrorBody(response: Response) {
  try {
    const body = await response.json();
    return body?.error || body?.message || `请求失败：${response.status}`;
  } catch {
    return `请求失败：${response.status}`;
  }
}
