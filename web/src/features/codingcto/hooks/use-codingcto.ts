import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  codingCTOService,
  type CreateCodingCTODirectAgentTaskPayload,
  type ListCodingCTODirectAgentTasksParams,
} from '@/features/codingcto/services/codingcto-service';

export {
  useGitHubRepositories,
  useSpecForgeRuntimes as useCodingCTORuntimes,
  useSpecForgeSkills as useCodingCTOSkills,
  useUpsertSpecForgeSkill as useUpsertCodingCTOSkill,
} from '@/features/specforge/hooks/use-specforge';

const codingCTOKeys = {
  directTasks: ['codingcto', 'direct-agent-tasks'] as const,
  directTasksFiltered: (params: ListCodingCTODirectAgentTasksParams) =>
    ['codingcto', 'direct-agent-tasks', params] as const,
  directTask: (taskId: number) => ['codingcto', 'direct-agent-task', taskId] as const,
  directTaskEvents: (taskId: number) => ['codingcto', 'direct-agent-task-events', taskId] as const,
};

export function useCodingCTODirectAgentTasks(
  paramsOrLimit: ListCodingCTODirectAgentTasksParams | number = 10
) {
  const params =
    typeof paramsOrLimit === 'number' ? { limit: paramsOrLimit } : paramsOrLimit;
  return useQuery({
    queryKey: codingCTOKeys.directTasksFiltered(params),
    queryFn: () => codingCTOService.listDirectAgentTasks(params),
    refetchInterval: 3000,
  });
}

export function useCodingCTODirectAgentTask(taskId?: number) {
  return useQuery({
    queryKey: taskId ? codingCTOKeys.directTask(taskId) : ['codingcto', 'direct-agent-task', 'none'],
    queryFn: () => codingCTOService.getDirectAgentTask(taskId ?? 0),
    enabled: Boolean(taskId),
    refetchInterval: query => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'failed' || status === 'cancelled' ? false : 2000;
    },
  });
}

export function useCodingCTODirectTaskEvents(taskId?: number) {
  return useQuery({
    queryKey: taskId
      ? codingCTOKeys.directTaskEvents(taskId)
      : ['codingcto', 'direct-agent-task-events', 'none'],
    queryFn: () => codingCTOService.listDirectTaskEvents(taskId ?? 0),
    enabled: Boolean(taskId),
    refetchInterval: 2000,
  });
}

export function useCreateCodingCTODirectAgentTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCodingCTODirectAgentTaskPayload) =>
      codingCTOService.createDirectAgentTask(payload),
    onSuccess: task => {
      queryClient.invalidateQueries({ queryKey: codingCTOKeys.directTasks });
      queryClient.setQueryData(codingCTOKeys.directTask(task.id), task);
    },
  });
}
