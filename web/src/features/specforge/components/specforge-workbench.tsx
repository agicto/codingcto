'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  CircleX,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Info,
  ListChecks,
  ScrollText,
  Play,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  SquarePen,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/utils';
import { useT } from '@/i18n';
import { localizeProjectContextText } from '@/features/project/project-context';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  executionRunFromDTO,
  planBundleFromDTO,
  prNodeFromDTO,
} from '@/features/specforge/plan-adapter';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';
import {
  demoPlan,
  demoRuntimes,
  demoRuntimeNow,
} from '@/features/specforge/mock-data';
import {
  deriveRuntimeHealth,
  runtimeFromDTO,
  summarizeRuntimeHealth,
} from '@/features/specforge/runtime-health';
import {
  profileListValue,
  repoProfileFromDTO,
  repoProfilePayloadFromForm,
} from '@/features/specforge/repo-profile-form';
import { githubTreeProfileInferencePayload } from '@/features/specforge/repo-profile-inference';
import {
  useApproveSpecForgePlan,
  useCancelExecutionRun,
  useCompileSpecForgePrompt,
  useCreateSpecForgeIdea,
  useCreateSpecForgeProjectIdea,
  useDeliverSpecForgePRNode,
  useDispatchExecutionRun,
  useExecutionRun,
  useGitHubRepositories,
  useGitHubWebhookEvents,
  useLatestPlanRun,
  useLatestProjectPlan,
  useInferRepoProfile,
  usePrepareSpecForgePRNodeBranch,
  useRepoProfile,
  useRepoArchitectureStatus,
  useReindexRepoArchitecture,
  useRefreshSpecForgePRNodeCI,
  useCompleteExecutionTask,
  useCreateReviewPatchTask,
  useReadSpecForgePRNodeFailureLog,
  useRetryExecutionTask,
  useSpecForgeEscalationSummary,
  useSpecForgeFixAttempts,
  useSpecForgePlanSkillRuns,
  useSpecForgeProjectSkills,
  useSpecForgeSkills,
  useSpecForgeTaskEvents,
  useSpecForgeRuntimes,
  useSweepSpecForgeRuntimes,
  useSweepSpecForgeTasks,
  useStartExecutionRun,
  useUpsertRepoProfile,
  useUpsertSpecForgeProjectSkill,
  useUpsertSpecForgeSkill,
  useVerifySpecForgePRNodeCI,
} from '@/features/specforge/hooks/use-specforge';
import { hasActiveFixAttempt } from '@/features/specforge/fix-attempts';
import { planApprovalReadiness } from '@/features/specforge/plan-approval';
import {
  decisionFieldsForPlan,
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import {
  canStartExecutionRange,
  executionRangeReview,
  selectExecutionNode,
} from '@/features/specforge/execution-range';
import {
  executionReadinessForExecutor,
  type ExecutionReadiness,
} from '@/features/specforge/execution-readiness';
import type {
  CompilePromptPayload,
  SpecForgeFixAttemptDTO,
  SpecForgeEscalationSummaryDTO,
  SpecForgeExecutionBundleDTO,
  GitHubWebhookEventDTO,
  SpecForgePRNodeFailureLogDTO,
  SpecForgeRepoArchitectureStatusDTO,
  GitHubRepositoryDTO,
  SpecForgeRepoProfileDTO,
  SpecForgeSkillDTO,
  SpecForgeSkillRunDTO,
  SpecForgeTaskEventDTO,
} from '@/features/specforge/services/specforge-service';
import {
  sortWebhookEvents,
  webhookEventDetails,
  webhookEventLabel,
  webhookEventRepo,
  webhookEventRisk,
} from '@/features/specforge/webhook-events';
import { isPRNodeActive, isPRNodeDelivered } from '@/features/specforge/status';
import {
  nextBlockedNode,
  nextReviewableNode,
  summarizeDeliveryRun,
} from '@/features/specforge/delivery-status';
import {
  specForgeSkillTemplates,
  type SpecForgeSkillTemplate,
} from '@/features/specforge/skill-templates';
import type {
  ExecutionRun,
  ExecutorRuntime,
  PlanBundle,
  PRNode,
  RepoProfile,
} from '@/features/specforge/types';

const statusLabel: Record<PRNode['status'], string> = {
  planned: '已计划',
  queued: '排队中',
  running: '执行中',
  waiting_on_dependencies: '等待依赖',
  pr_opened: 'PR 已创建',
  ci_running: 'CI 运行中',
  ready_for_review: '可评审',
  blocked: '已阻塞',
  merged: '已合并',
  closed: '已关闭',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
const maxFixAttemptsPerNode = 3;
type PromptMode = NonNullable<CompilePromptPayload['type']>;
const promptModes: PromptMode[] = ['implementation', 'fix', 'review_patch'];
const promptModeLabel: Record<PromptMode, string> = {
  implementation: '实现',
  fix: '修复',
  review_patch: '评审修订',
};
type DashboardTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

interface ExecutionAgentOption {
  executor: string;
  label: string;
  description: string;
  commandLabels: string[];
  runtimeCount: number;
  canDispatch: boolean;
}

function statusClassName(status: PRNode['status'] | string) {
  const nodeStatus = status as PRNode['status'];
  if (isPRNodeDelivered(nodeStatus)) {
    return 'border-success/30 bg-success-subtle text-success';
  }
  if (isPRNodeActive(nodeStatus)) {
    return 'border-info/30 bg-info-subtle text-info';
  }
  if (status === 'waiting_on_dependencies' || status === 'pr_opened') {
    return 'border-warning/30 bg-warning-subtle text-warning';
  }
  if (
    status === 'failed' ||
    status === 'cancelled' ||
    status === 'blocked' ||
    status === 'closed'
  ) {
    return 'border-error/30 bg-error-subtle text-error';
  }
  return 'border-border bg-bg-surface text-text-subtle';
}

function repoProfileSourceLabel(source: string) {
  switch (source) {
    case 'github_tree':
      return 'GitHub 目录';
    case 'request_hints':
      return '需求提示';
    case 'manual':
      return '手动画像';
    case 'demo':
      return '演示画像';
    default:
      return '未知来源';
  }
}

function executionRunStatusLabel(status: ExecutionRun['status']) {
  switch (status) {
    case 'idle':
      return '尚未启动运行';
    case 'queued':
      return '排队中';
    case 'running':
      return '执行中';
    case 'completed':
      return '已完成';
    case 'blocked':
      return '已阻塞';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function formatTimestamp(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleString();
}

function latestPRNodeTasks(tasks: PRNode[]) {
  const latestByNode = new Map<string, PRNode>();
  for (const task of tasks) {
    const current = latestByNode.get(task.id);
    if (!current || taskSortValue(task) >= taskSortValue(current)) {
      latestByNode.set(task.id, task);
    }
  }
  return [...latestByNode.values()].sort((a, b) => a.order - b.order);
}

function taskSortValue(task: PRNode) {
  return task.taskId ?? task.attemptNumber ?? task.order;
}

function riskClassName(risk: PRNode['estimatedRisk']) {
  if (risk === 'high') {
    return 'border-error/30 bg-error-subtle text-error';
  }
  if (risk === 'medium') {
    return 'border-warning/30 bg-warning-subtle text-warning';
  }
  return 'border-success/30 bg-success-subtle text-success';
}

function riskLabel(risk: PRNode['estimatedRisk']) {
  switch (risk) {
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
      return '低';
    default:
      return risk;
  }
}

function demoPlanForInput(idea: string, repositoryId: string): PlanBundle {
  return {
    ...demoPlan,
    idea,
    repoProfile: {
      ...demoPlan.repoProfile,
      repositoryId,
    },
  };
}

interface SpecForgeWorkbenchProps {
  projectId?: number;
  initialRepositoryId?: string;
  projectLabel?: string;
  repositoryLocked?: boolean;
  pageScroll?: boolean;
}

export function SpecForgeWorkbench({
  projectId,
  initialRepositoryId,
  projectLabel,
  repositoryLocked = false,
  pageScroll = false,
}: SpecForgeWorkbenchProps = {}) {
  const t = useT('dashboard.specForge');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const repoIdFromURL = searchParams.get('repo_id')?.trim();
  const requirementDialogOpen =
    searchParams.get('new') === 'requirement' || searchParams.get('create') === 'requirement';
  const initialRepoId =
    initialRepositoryId?.trim() || repoIdFromURL || demoPlan.repoProfile.repositoryId;
  const initialIdea = projectId ? '' : t('demoIdea');
  const [idea, setIdea] = useState(initialIdea);
  const [repoId, setRepoId] = useState(initialRepoId);
  const [activePlan, setActivePlan] = useState<PlanBundle>(() =>
    demoPlanForInput(initialIdea || t('demoIdea'), initialRepoId)
  );
  const activePlanRef = useRef(activePlan);
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, string>>(() =>
    defaultDecisionOverrides(demoPlan)
  );
  const [selectedExecutionNodeIds, setSelectedExecutionNodeIds] = useState<string[]>(() =>
    demoPlan.prNodes.map(node => node.id)
  );
  const [planSource, setPlanSource] = useState<'api' | 'demo' | 'empty'>(
    projectId ? 'empty' : 'demo'
  );
  const [hasPlan, setHasPlan] = useState(!projectId);
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<ExecutionRun>({
    status: 'idle',
    selectedPRNodeIds: [],
    tasks: demoPlan.prNodes,
  });
  const [selectedExecutor, setSelectedExecutor] = useState('codex_cli');
  const [selectedWorkItem, setSelectedWorkItem] = useState<
    'intake' | 'plan' | 'dag' | 'run' | 'context'
  >('plan');
  const [currentRuntimeNow] = useState(() => Date.now());
  const { selectedWorkspaceId } = useSelectedWorkspace();
  const connectedRepositoriesQuery = useGitHubRepositories(
    selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : undefined
  );
  const connectedRepositories = useMemo(
    () => connectedRepositoriesQuery.data?.repositories ?? [],
    [connectedRepositoriesQuery.data?.repositories]
  );
  const defaultConnectedRepository = connectedRepositories[0];
  const effectiveRepoId =
    !initialRepositoryId?.trim() &&
    !repoIdFromURL &&
    !repositoryLocked &&
    repoId === demoPlan.repoProfile.repositoryId &&
    defaultConnectedRepository
      ? defaultConnectedRepository.repository_id
      : repoId;
  const selectedGitHubRepository = connectedRepositories.find(
    repository => repository.repository_id === effectiveRepoId.trim()
  );
  const requiresVerifiedRepository = Boolean(selectedWorkspaceId && !repositoryLocked);
  const repositoryReady = !requiresVerifiedRepository || Boolean(selectedGitHubRepository);

  const createIdea = useCreateSpecForgeIdea(effectiveRepoId.trim());
  const createProjectIdea = useCreateSpecForgeProjectIdea(projectId);
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const cancelRun = useCancelExecutionRun();
  const compilePrompt = useCompileSpecForgePrompt();
  const isStartingRun = approvePlan.isPending || startRun.isPending || dispatchRun.isPending;
  const runQuery = useExecutionRun(run.runId, {
    enabled: Boolean(run.runId),
    refetchInterval: run.status === 'queued' || run.status === 'running' ? 5000 : false,
  });
  const latestProjectPlanQuery = useLatestProjectPlan(projectId);
  const latestPlanRunQuery = useLatestPlanRun(activePlan.planId, {
    enabled: Boolean(projectId && activePlan.planId && planSource === 'api' && !run.runId),
    refetchInterval: false,
  });
  const latestRunTasks = useMemo(() => latestPRNodeTasks(run.tasks), [run.tasks]);
  const readyCount = latestRunTasks.filter(task => isPRNodeDelivered(task.status)).length;
  const runningCount = latestRunTasks.filter(task => isPRNodeActive(task.status)).length;
  const runtimesQuery = useSpecForgeRuntimes({ limit: 20 });
  const runtimeDTOs = runtimesQuery.data?.runtimes;
  const useRuntimeFallback = !projectId && Boolean(runtimesQuery.isError || !runtimeDTOs?.length);
  const runtimes = useMemo(() => {
    if (runtimeDTOs?.length) {
      return runtimeDTOs.map(runtimeFromDTO);
    }
    return useRuntimeFallback ? demoRuntimes : [];
  }, [runtimeDTOs, useRuntimeFallback]);
  const runtimeNow = runtimeDTOs?.length
    ? currentRuntimeNow
    : useRuntimeFallback
      ? demoRuntimeNow
      : currentRuntimeNow;
  const runtimeSummary = useMemo(
    () => summarizeRuntimeHealth(runtimes, runtimeNow),
    [runtimes, runtimeNow]
  );
  const executionAgentOptions = useMemo(
    () => executionAgentOptionsFromRuntimes(runtimes, runtimeNow, useRuntimeFallback),
    [runtimeNow, runtimes, useRuntimeFallback]
  );
  const defaultExecutionAgent =
    executionAgentOptions.find(option => option.canDispatch) ?? executionAgentOptions[0];
  const selectedExecutionAgent = executionAgentOptions.find(
    option => option.executor === selectedExecutor
  );
  const effectiveSelectedExecutor =
    selectedExecutionAgent?.canDispatch || !defaultExecutionAgent
      ? selectedExecutor
      : defaultExecutionAgent.executor;
  const executionReadiness = useMemo(
    () =>
      executionReadinessForExecutor({
        runtimes,
        executor: effectiveSelectedExecutor,
        now: runtimeNow,
        allowFallback: useRuntimeFallback,
      }),
    [effectiveSelectedExecutor, runtimeNow, runtimes, useRuntimeFallback]
  );
  const readinessReason = useMemo(() => {
    if (executionReadiness.healthyRuntimeCount > 0) {
      return t('readiness.online');
    }
    if (useRuntimeFallback) {
      return t('readiness.demo');
    }
    return t('readiness.startRuntime');
  }, [executionReadiness.healthyRuntimeCount, t, useRuntimeFallback]);

  const progressText = useMemo(() => {
    if (run.status === 'idle') {
      return t('progress.awaiting', { reason: readinessReason });
    }
    return t('progress.ready', { ready: readyCount, total: latestRunTasks.length });
  }, [latestRunTasks.length, readinessReason, readyCount, run.status, t]);
  const deliveryStageItems = useMemo(
    () =>
      latestRunTasks
        .filter(
          task =>
            Boolean(task.githubPrUrl) ||
            ['pr_opened', 'ci_running', 'ready_for_review', 'merged', 'completed'].includes(
              task.status
            )
        )
        .map(task => ({
          id: 'run' as const,
          key: task.nodeKey,
          title: task.githubPrNumber ? `PR #${task.githubPrNumber}: ${task.title}` : task.title,
          description: task.githubPrUrl || task.branchName || task.goal,
          status: statusLabel[task.status],
          icon: GitPullRequest,
        })),
    [latestRunTasks]
  );
  const blockedStageItems = useMemo(
    () =>
      latestRunTasks
        .filter(task => ['blocked', 'failed', 'cancelled', 'closed'].includes(task.status))
        .map(task => ({
          id: 'run' as const,
          key: task.nodeKey,
          title: task.title,
          description: task.failureReason || task.errorLog || task.goal,
          status: statusLabel[task.status],
          icon: CircleX,
        })),
    [latestRunTasks]
  );

  function setRequirementDialogOpen(open: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (open) {
      params.set('new', 'requirement');
    } else {
      params.delete('new');
      params.delete('create');
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  useEffect(() => {
    activePlanRef.current = activePlan;
  }, [activePlan]);

  useEffect(() => {
    if (!runQuery.data) {
      return;
    }

    const next = executionRunFromDTO(runQuery.data, activePlanRef.current);
    if (next.plan) {
      setActivePlan(next.plan);
    }
    setRun(next.run);
    setApproved(true);
  }, [runQuery.data]);

  useEffect(() => {
    if (!projectId || !latestProjectPlanQuery.data) {
      return;
    }

    startTransition(() => {
      const nextPlan = planBundleFromDTO(latestProjectPlanQuery.data);
      setActivePlan(nextPlan);
      setDecisionOverrides(defaultDecisionOverrides(nextPlan));
      setSelectedExecutionNodeIds(nextPlan.prNodes.map(node => node.id));
      setIdea(nextPlan.idea);
      setRepoId(nextPlan.repoProfile.repositoryId);
      setPlanSource('api');
      setHasPlan(true);
      setApproved(nextPlan.implementationPlan.status === 'approved');
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: nextPlan.prNodes });
    });
  }, [latestProjectPlanQuery.data, projectId]);

  useEffect(() => {
    if (!projectId || !latestPlanRunQuery.data) {
      return;
    }

    startTransition(() => {
      const next = executionRunFromDTO(latestPlanRunQuery.data, activePlanRef.current);
      if (next.plan) {
        setActivePlan(next.plan);
      }
      setRun(next.run);
      setApproved(true);
    });
  }, [latestPlanRunQuery.data, projectId]);

  async function generatePlan() {
    const trimmedIdea = idea.trim();
    const trimmedRepoId = effectiveRepoId.trim();
    if (!trimmedIdea || !trimmedRepoId || !repositoryReady) {
      return false;
    }

    setApproved(false);
    try {
      const payload = {
        input: trimmedIdea,
        type: 'feature',
      } as const;
      const bundle = projectId
        ? await createProjectIdea.mutateAsync(payload)
        : await createIdea.mutateAsync(payload);
      const nextPlan = planBundleFromDTO(bundle);
      setActivePlan(nextPlan);
      setDecisionOverrides(defaultDecisionOverrides(nextPlan));
      setSelectedExecutionNodeIds(nextPlan.prNodes.map(node => node.id));
      setIdea(nextPlan.idea);
      setPlanSource('api');
      setHasPlan(true);
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: nextPlan.prNodes });
      return true;
    } catch {
      if (projectId) {
        setPlanSource('empty');
        setHasPlan(false);
        setRun({ status: 'idle', selectedPRNodeIds: [], tasks: [] });
        return false;
      }
      const fallbackPlan = demoPlanForInput(trimmedIdea, trimmedRepoId);
      setActivePlan(fallbackPlan);
      setDecisionOverrides(defaultDecisionOverrides(fallbackPlan));
      setSelectedExecutionNodeIds(fallbackPlan.prNodes.map(node => node.id));
      setPlanSource('demo');
      setHasPlan(true);
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: fallbackPlan.prNodes });
      return true;
    }
  }

  async function generatePlanFromRequirementDialog() {
    const created = await generatePlan();
    if (created) {
      setSelectedWorkItem('plan');
      setRequirementDialogOpen(false);
    }
  }

  function resetIdea() {
    const defaultRepository = connectedRepositories[0];
    const resetRepoId =
      initialRepositoryId?.trim() ||
      repoIdFromURL ||
      defaultRepository?.repository_id ||
      demoPlan.repoProfile.repositoryId;
    const resetInput = projectId ? '' : t('demoIdea');
    setIdea(resetInput);
    setRepoId(resetRepoId);
    const resetPlan = demoPlanForInput(resetInput || t('demoIdea'), resetRepoId);
    resetPlan.repoProfile.defaultBranch =
      defaultRepository?.default_branch ?? resetPlan.repoProfile.defaultBranch;
    setActivePlan(resetPlan);
    setDecisionOverrides(defaultDecisionOverrides(resetPlan));
    setSelectedExecutionNodeIds(projectId ? [] : resetPlan.prNodes.map(node => node.id));
    setPlanSource(projectId ? 'empty' : 'demo');
    setHasPlan(!projectId);
    setApproved(false);
    setRun({ status: 'idle', selectedPRNodeIds: [], tasks: projectId ? [] : resetPlan.prNodes });
  }

  async function approveAndStart() {
    if (selectedExecutionNodeIds.length === 0) {
      return;
    }

    if (activePlan.planId) {
      try {
        const selectedPRNodeIDs = selectedExecutionNodeIds
          .map(id => Number(id))
          .filter(id => Number.isFinite(id) && id > 0);
        const approvedPlan =
          activePlan.implementationPlan.status === 'approved'
            ? activePlan
            : planBundleFromDTO(
                await approvePlan.mutateAsync({
                  planId: activePlan.planId,
                  payload: {
                    approved: true,
                    decision_overrides: normalizeDecisionOverrides(decisionOverrides),
                  },
                })
              );
        setActivePlan(approvedPlan);

        const started = await startRun.mutateAsync({
          planId: approvedPlan.planId ?? activePlan.planId,
          payload: {
            executor: effectiveSelectedExecutor,
            pr_node_ids: selectedPRNodeIDs,
          },
        });
        const dispatched = await dispatchRun.mutateAsync({
          runId: started.run.id,
          payload: {
            require_runtime_ready: true,
          },
        });
        const next = executionRunFromDTO(dispatched, approvedPlan);
        if (next.plan) {
          setActivePlan(next.plan);
        }
        setApproved(true);
        setRun(next.run);
        return;
      } catch {
        // Keep the workbench usable when the API is unavailable in local web-only dev.
      }
    }

    if (projectId) {
      return;
    }

    const startedAt = new Date().toISOString();
    setApproved(true);
    const selectedNodeIDs = new Set(selectedExecutionNodeIds);
    setRun({
      status: 'running',
      startedAt,
      selectedPRNodeIds: activePlan.prNodes
        .filter(node => selectedNodeIDs.has(node.id))
        .map(node => node.id),
      tasks: activePlan.prNodes
        .filter(node => selectedNodeIDs.has(node.id))
        .map(node => ({
          ...node,
          status: node.dependsOn.length === 0 ? 'running' : 'waiting_on_dependencies',
        })),
    });
  }

  function advanceRun() {
    setRun(current => {
      const nextTasks = current.tasks.map(task => ({ ...task }));
      const runningIndex = nextTasks.findIndex(task => task.status === 'running');

      if (runningIndex >= 0) {
        nextTasks[runningIndex].status = 'completed';
        const completedKeys = new Set(
          nextTasks.filter(task => task.status === 'completed').map(task => task.nodeKey)
        );
        const nextWaiting = nextTasks.find(task => {
          return (
            task.status === 'waiting_on_dependencies' &&
            task.dependsOn.every(dependency => completedKeys.has(dependency))
          );
        });
        if (nextWaiting) {
          nextWaiting.status = 'running';
        }
      }

      const isDone = nextTasks.every(task => task.status === 'completed');
      return {
        ...current,
        status: isDone ? 'completed' : 'running',
        tasks: nextTasks,
      };
    });
  }

  async function cancelActiveRun() {
    if (run.runId) {
      try {
        const bundle = await cancelRun.mutateAsync(run.runId);
        const next = executionRunFromDTO(bundle, activePlan);
        if (next.plan) {
          setActivePlan(next.plan);
        }
        setRun(next.run);
        return;
      } catch {
        // Keep local demo controls usable when the API is unavailable.
      }
    }

    setRun(current => ({
      ...current,
      status: 'cancelled',
      tasks: current.tasks.map(task => ({
        ...task,
        status: task.status === 'completed' ? task.status : 'cancelled',
      })),
    }));
  }

  function applyExecutionBundle(bundle: SpecForgeExecutionBundleDTO) {
    const next = executionRunFromDTO(bundle, activePlanRef.current);
    if (next.plan) {
      setActivePlan(next.plan);
    }
    setRun(next.run);
  }

  async function compileNodePrompt(node: PRNode, mode: PromptMode) {
    const prNodeId = Number(node.id);
    if (Number.isFinite(prNodeId) && prNodeId > 0) {
      try {
        const response = await compilePrompt.mutateAsync({
          prNodeId,
          payload: { type: mode },
        });
        return response.prompt.prompt_text;
      } catch {
        // Keep prompt review available for demo plans and offline backend development.
      }
    }
    return `提示词类型：${promptModeLabel[mode]}\n\n${buildPromptPreview(activePlan, node)}`;
  }

  const deliveryStages = [
    {
      id: 'intake',
      title: t('stages.intake.title'),
      tone: 'bg-bg-surface',
      emptyLabel: t('stages.intake.empty'),
      items: [
        {
          id: 'intake' as const,
          key: 'IDEA',
          title: t('stages.intake.itemTitle'),
          description: t('stages.intake.itemDescription'),
          status: idea.trim() ? t('status.readyForPlanning') : t('status.needsInput'),
          icon: Sparkles,
        },
      ],
    },
    {
      id: 'context',
      title: t('stages.context.title'),
      tone: 'bg-bg-subtle/70',
      emptyLabel: t('stages.context.empty'),
      items: [
        {
          id: 'context' as const,
          key: 'CTX',
          title: t('stages.context.itemTitle'),
          description: `${activePlan.repoProfile.stack.slice(0, 3).join(', ')} · ${effectiveRepoId}`,
          status:
            planSource === 'api'
              ? t('status.apiContext')
              : planSource === 'empty'
                ? t('status.awaitingPlan')
                : t('status.demoFallback'),
          icon: GitBranch,
        },
      ],
    },
    {
      id: 'planning',
      title: t('stages.planning.title'),
      tone: 'bg-warning-subtle',
      emptyLabel: t('stages.planning.empty'),
      items: [
        {
          id: 'plan' as const,
          key: 'PLAN',
          title: t('stages.planning.planTitle'),
          description: hasPlan
            ? t('stages.planning.planDescription', { count: activePlan.prNodes.length })
            : t('stages.planning.noPlanDescription'),
          status: hasPlan
            ? approved
              ? t('status.approved')
              : t('status.needsReview')
            : t('status.noPlan'),
          icon: ScrollText,
        },
        {
          id: 'dag' as const,
          key: 'PROMPT',
          title: t('stages.planning.dagTitle'),
          description: t('stages.planning.dagDescription'),
          status: hasPlan
            ? t('stages.planning.nodeCount', { count: activePlan.prNodes.length })
            : t('status.noPlan'),
          icon: GitMerge,
        },
      ],
    },
    {
      id: 'execution',
      title: t('stages.execution.title'),
      tone: 'bg-success-subtle',
      emptyLabel: t('stages.execution.empty'),
      items: [
        {
          id: 'run' as const,
          key: 'RUN',
          title: t('stages.execution.itemTitle'),
          description: progressText,
          status: hasPlan
            ? run.status === 'idle'
              ? t('status.notStarted')
              : run.status
            : t('status.noPlan'),
          icon: Play,
        },
      ],
    },
    {
      id: 'delivery',
      title: t('stages.delivery.title'),
      tone: 'bg-info-subtle',
      emptyLabel: t('stages.delivery.empty'),
      items: deliveryStageItems,
    },
    {
      id: 'blocked',
      title: t('stages.blocked.title'),
      tone: 'bg-error-subtle',
      emptyLabel: t('stages.blocked.empty'),
      items: blockedStageItems,
    },
  ];

  return (
    <div className={cn('flex min-h-0 flex-col bg-bg-surface', pageScroll ? 'h-auto' : 'h-full')}>
      <CreateRequirementDialog
        open={requirementDialogOpen}
        t={t}
        projectLabel={projectLabel}
        idea={idea}
        effectiveRepoId={effectiveRepoId}
        repositoryLocked={repositoryLocked}
        connectedRepositories={connectedRepositories}
        selectedGitHubRepository={selectedGitHubRepository}
        connectedRepositoriesLoading={connectedRepositoriesQuery.isLoading}
        repositoryReady={repositoryReady}
        isCreating={createIdea.isPending || createProjectIdea.isPending}
        agentOptions={executionAgentOptions}
        selectedExecutor={effectiveSelectedExecutor}
        onOpenChange={setRequirementDialogOpen}
        onIdeaChange={setIdea}
        onRepoIdChange={setRepoId}
        onExecutorChange={setSelectedExecutor}
        onCreate={generatePlanFromRequirementDialog}
        onReset={resetIdea}
      />
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-base font-semibold">{t('header.title')}</h1>
            <p className="text-xs text-text-muted">
              {projectLabel ? `${projectLabel} · ` : ''}
              {t('header.description')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t('header.activeRuns', { count: runningCount })}</Badge>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('context')}>
            {t('header.analyzeRepo')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('plan')}>
            {t('header.manualPlan')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('dag')}>
            {t('header.pipeline')}
          </Button>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
        <Button
          variant={
            selectedWorkItem === 'intake' || selectedWorkItem === 'context'
              ? 'secondary'
              : 'outline'
          }
          size="sm"
          onClick={() => setSelectedWorkItem('intake')}
        >
          {t('tabs.allWork')}
        </Button>
        <Button
          variant={
            selectedWorkItem === 'plan' || selectedWorkItem === 'dag' ? 'secondary' : 'outline'
          }
          size="sm"
          onClick={() => setSelectedWorkItem('plan')}
        >
          {t('tabs.plans')}
        </Button>
        <Button
          variant={selectedWorkItem === 'run' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setSelectedWorkItem('run')}
        >
          {t('tabs.runs')}
        </Button>
      </div>

      <section
        className={cn(
          'grid min-h-0 flex-1',
          pageScroll
            ? 'gap-3 p-3 2xl:grid-cols-[minmax(0,1fr)_560px]'
            : 'grid-rows-[minmax(280px,1fr)_minmax(300px,40vh)] overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_560px] 2xl:grid-rows-1'
        )}
      >
        <div
          className={cn(
            'min-w-0 overflow-x-hidden p-3',
            pageScroll ? 'overflow-visible pb-0' : 'overflow-y-auto pb-28'
          )}
        >
          <div className="grid min-h-full grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3 2xl:grid-cols-6">
            {deliveryStages.map(column => (
              <div
                key={column.id}
                className={cn('flex min-h-[220px] flex-col rounded-xl p-3', column.tone)}
              >
                <div className="flex h-8 items-center justify-between text-sm">
                  <div className="flex items-center gap-2 font-medium">
                    <CircleDot className="h-3.5 w-3.5 text-text-muted" />
                    {column.title}
                    <span className="text-xs text-text-muted">{column.items.length}</span>
                  </div>
                  <span className="text-text-muted">+</span>
                </div>
                <div className="mt-3 space-y-2">
                  {column.items.length === 0 ? (
                    <div className="flex h-40 items-center justify-center px-3 text-center text-sm text-text-muted">
                      {column.emptyLabel}
                    </div>
                  ) : (
                    column.items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedWorkItem(item.id)}
                          className={cn(
                            'w-full rounded-lg border bg-bg-surface p-3 text-left shadow-sm transition hover:border-primary/40',
                            selectedWorkItem === item.id
                              ? 'border-primary ring-1 ring-primary'
                              : 'border-border-subtle'
                          )}
                        >
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            {item.key}
                          </div>
                          <div className="mt-2 text-sm font-semibold leading-5 break-words">
                            {item.title}
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                            {item.description}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="rounded-full bg-muted px-2 py-1 text-text-subtle">
                              {item.status}
                            </span>
                            <span className="text-text-muted">{t('status.current')}</span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside
          className={cn(
            'min-h-0 overflow-x-hidden border-t border-border-subtle bg-bg-subtle/60 p-4 2xl:border-l 2xl:border-t-0',
            pageScroll ? 'overflow-visible pb-4' : 'overflow-y-auto pb-28'
          )}
        >
          {selectedWorkItem === 'intake' && (
            <DetailPanel title="IDEA" heading={t('detail.idea.heading')}>
              <RequirementSummaryPanel
                t={t}
                idea={idea}
                effectiveRepoId={effectiveRepoId}
                selectedGitHubRepository={selectedGitHubRepository}
                hasPlan={hasPlan}
                onCreate={() => setRequirementDialogOpen(true)}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'context' && (
            <DetailPanel title="CTX" heading="仓库理解和技能">
              <div className="space-y-4">
                <RepoProfileSummary
                  repoId={effectiveRepoId.trim()}
                  repoProfile={activePlan.repoProfile}
                  planSource={planSource}
                  onProfileSaved={profile => {
                    setActivePlan(current => ({
                      ...current,
                      repoProfile: profile,
                    }));
                  }}
                />
                <RepoSkillsPanel repoId={effectiveRepoId.trim()} projectId={projectId} />
                <GitHubWebhookEventsPanel />
              </div>
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && hasPlan && (
            <DetailPanel title="PLAN" heading="评审并审批计划">
              <PlanReview
                plan={activePlan}
                decisionOverrides={decisionOverrides}
                selectedExecutionNodeIds={selectedExecutionNodeIds}
                approved={approved}
                isStarting={isStartingRun}
                executionReadiness={executionReadiness}
                agentOptions={executionAgentOptions}
                selectedExecutor={effectiveSelectedExecutor}
                onDecisionOverrideChange={(key, value) =>
                  setDecisionOverrides(current => ({ ...current, [key]: value }))
                }
                onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
                onExecutorChange={setSelectedExecutor}
                onApprove={approveAndStart}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && !hasPlan && (
            <DetailPanel title="PLAN" heading="暂无项目计划">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                onCreate={() => setSelectedWorkItem('intake')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && hasPlan && (
            <DetailPanel title="PROMPT" heading="PR DAG 和提示词契约">
              <PRDag
                nodes={activePlan.prNodes}
                repositoryId={activePlan.repoProfile.repositoryId}
                isCompilingPrompt={compilePrompt.isPending}
                onCompilePrompt={compileNodePrompt}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && !hasPlan && (
            <DetailPanel title="PROMPT" heading="暂无提示词契约">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                onCreate={() => setSelectedWorkItem('intake')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'run' && (
            <DetailPanel title="RUN" heading="执行和 PR 交付">
              <div className="space-y-4">
                <RunSummary progressText={progressText} approved={approved} run={run} />
                <RuntimeReadiness
                  onlineCount={runtimeSummary.online}
                  recentlyLostCount={runtimeSummary.recently_lost}
                  runtimes={runtimes}
                  isLoading={runtimesQuery.isLoading}
                  isFallback={useRuntimeFallback}
                  readinessReason={readinessReason}
                />
                <ExecutionStatus
                  run={run}
                  isCancelling={cancelRun.isPending}
                  onAdvance={advanceRun}
                  onCancel={cancelActiveRun}
                  onExecutionBundle={applyExecutionBundle}
                />
              </div>
            </DetailPanel>
          )}
        </aside>
      </section>
    </div>
  );
}

function DetailPanel({
  title,
  heading,
  children,
}: {
  title: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium text-text-muted">{title}</div>
        <h2 className="mt-1 text-lg font-semibold leading-6">{heading}</h2>
      </div>
      {children}
    </div>
  );
}

function CreateRequirementDialog({
  open,
  t,
  projectLabel,
  idea,
  effectiveRepoId,
  repositoryLocked,
  connectedRepositories,
  selectedGitHubRepository,
  connectedRepositoriesLoading,
  repositoryReady,
  isCreating,
  agentOptions,
  selectedExecutor,
  onOpenChange,
  onIdeaChange,
  onRepoIdChange,
  onExecutorChange,
  onCreate,
  onReset,
}: {
  open: boolean;
  t: DashboardTranslator;
  projectLabel?: string;
  idea: string;
  effectiveRepoId: string;
  repositoryLocked: boolean;
  connectedRepositories: GitHubRepositoryDTO[];
  selectedGitHubRepository?: GitHubRepositoryDTO;
  connectedRepositoriesLoading: boolean;
  repositoryReady: boolean;
  isCreating: boolean;
  agentOptions: ExecutionAgentOption[];
  selectedExecutor: string;
  onOpenChange: (open: boolean) => void;
  onIdeaChange: (value: string) => void;
  onRepoIdChange: (value: string) => void;
  onExecutorChange: (value: string) => void;
  onCreate: () => Promise<void>;
  onReset: () => void;
}) {
  async function submitRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{projectLabel || 'CodingCTO'}</span>
            <span>/</span>
            <span className="font-medium text-text-main">{t('createDialog.viaAgent')}</span>
          </div>
          <DialogTitle className="sr-only">{t('createDialog.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('detail.idea.inputLabel')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submitRequirement}>
          <DialogBody className="mx-0 max-h-[58vh] space-y-4 px-5 py-4">
            <Textarea
              value={idea}
              onChange={event => onIdeaChange(event.target.value)}
              className="min-h-48 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
              aria-label={t('detail.idea.inputLabel')}
              placeholder={t('createDialog.placeholder')}
              autoFocus
            />

            <div className="space-y-2">
              <Label htmlFor="specforge-create-repository">{t('detail.idea.targetRepo')}</Label>

              {connectedRepositories.length > 0 && !repositoryLocked ? (
                <select
                  id="specforge-create-repository"
                  value={effectiveRepoId}
                  onChange={event => onRepoIdChange(event.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm text-text-main outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                >
                  {connectedRepositories.map(repository => (
                    <option key={repository.repository_id} value={repository.repository_id}>
                      {repository.github_owner}/{repository.github_repo} ·{' '}
                      {repository.default_branch}
                    </option>
                  ))}
                  {!selectedGitHubRepository && effectiveRepoId.trim() ? (
                    <option value={effectiveRepoId.trim()}>
                      {effectiveRepoId.trim()} · {t('detail.idea.manualEntry')}
                    </option>
                  ) : null}
                </select>
              ) : (
                <Input
                  id="specforge-create-repository"
                  value={effectiveRepoId}
                  onChange={event => onRepoIdChange(event.target.value)}
                  aria-label={t('detail.idea.repositoryId')}
                  placeholder={t('detail.idea.repositoryId')}
                  disabled={repositoryLocked}
                  className="bg-bg-surface"
                />
              )}

              {connectedRepositoriesLoading && (
                <p className="text-xs leading-5 text-text-muted">{t('detail.idea.loadingRepos')}</p>
              )}
            </div>

            <ExecutionAgentSelect
              id="specforge-create-agent"
              label={t('createDialog.agentLabel')}
              emptyLabel={t('createDialog.noAgent')}
              options={agentOptions}
              value={selectedExecutor}
              disabled={isCreating}
              onChange={onExecutorChange}
            />
          </DialogBody>

          <DialogFooter className="border-t border-border-subtle px-5 py-3">
            <Button type="button" variant="outline" onClick={onReset}>
              {t('detail.idea.reset')}
            </Button>
            <Button
              type="submit"
              disabled={!idea.trim() || !effectiveRepoId.trim() || !repositoryReady || isCreating}
            >
              {isCreating ? t('detail.idea.generating') : t('createDialog.create')}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExecutionAgentSelect({
  id,
  label,
  emptyLabel,
  options,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  emptyLabel: string;
  options: ExecutionAgentOption[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find(option => option.executor === value);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={selectedOption ? value : ''}
        onChange={event => onChange(event.target.value)}
        disabled={disabled || options.length === 0}
        className="h-10 w-full min-w-0 rounded-md border border-border bg-bg-surface px-3 text-sm text-text-main outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.length === 0 ? (
          <option value="">{emptyLabel}</option>
        ) : (
          options.map(option => (
            <option
              key={option.executor}
              value={option.executor}
              disabled={!option.canDispatch}
            >
              {option.label} · {option.description}
            </option>
          ))
        )}
      </select>
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedOption?.commandLabels.slice(0, 3).map(command => (
          <Badge key={command} variant="outline" className="max-w-full text-[11px]">
            <span className="truncate">{command}</span>
          </Badge>
        ))}
        {selectedOption ? (
          <Badge
            variant="outline"
            className={selectedOption.canDispatch ? statusClassName('completed') : ''}
          >
            {selectedOption.canDispatch ? '可用' : '未就绪'}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function RequirementSummaryPanel({
  t,
  idea,
  effectiveRepoId,
  selectedGitHubRepository,
  hasPlan,
  onCreate,
}: {
  t: DashboardTranslator;
  idea: string;
  effectiveRepoId: string;
  selectedGitHubRepository?: GitHubRepositoryDTO;
  hasPlan: boolean;
  onCreate: () => void;
}) {
  const repoLabel = selectedGitHubRepository
    ? `${selectedGitHubRepository.github_owner}/${selectedGitHubRepository.github_repo}`
    : effectiveRepoId;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-main">
              {hasPlan ? t('detail.idea.summaryTitle') : t('detail.idea.emptySummaryTitle')}
            </div>
            <p className="mt-2 line-clamp-6 text-sm leading-6 text-text-muted">
              {idea.trim() || t('detail.idea.emptySummary')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-xs font-medium uppercase text-text-muted">
          {t('detail.idea.targetRepo')}
        </div>
        <div className="mt-2 truncate text-sm font-medium text-text-main">
          {repoLabel || t('detail.idea.repositoryId')}
        </div>
      </div>

      <Button className="w-full md:hidden" onClick={onCreate}>
        {t('createDialog.title')}
        <SquarePen className="ml-1.5 h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyProjectPlanPanel({
  isLoading,
  onCreate,
}: {
  isLoading: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-medium">
            {isLoading ? '正在检查已有项目计划' : '创建真实项目计划'}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            项目级 CodingCTO 不再回退到演示任务。请先录入一个需求，由后端生成这个项目的计划、提示词契约和执行运行。
          </p>
          <Button className="mt-3" size="sm" onClick={onCreate}>
            打开需求录入
          </Button>
        </div>
      </div>
    </div>
  );
}

function RuntimeReadiness({
  onlineCount,
  recentlyLostCount,
  runtimes,
  isLoading,
  isFallback,
  readinessReason,
}: {
  onlineCount: number;
  recentlyLostCount: number;
  runtimes: ExecutorRuntime[];
  isLoading: boolean;
  isFallback: boolean;
  readinessReason: string;
}) {
  const sweepRuntimes = useSweepSpecForgeRuntimes();
  const sweepTasks = useSweepSpecForgeTasks();
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  async function sweepRuntimeHeartbeats() {
    setMaintenanceMessage('');
    try {
      const result = await sweepRuntimes.mutateAsync({ stale_seconds: 300 });
      setMaintenanceMessage(
        `已将 ${result.offline_runtimes.length} 个运行时标记为离线，并将 ${result.failed_tasks.length} 个任务标记为失败。`
      );
    } catch {
      setMaintenanceMessage('运行时清理需要 CodingCTO 后端可用。');
    }
  }

  async function sweepStaleExecutionTasks() {
    setMaintenanceMessage('');
    try {
      const result = await sweepTasks.mutateAsync({
        dispatch_timeout_seconds: 900,
        running_timeout_seconds: 3600,
      });
      setMaintenanceMessage(`已将 ${result.failed_tasks.length} 个过期任务标记为失败。`);
    } catch {
      setMaintenanceMessage('任务清理需要 CodingCTO 后端可用。');
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="text-sm font-medium">执行器就绪状态</div>
            <div className="mt-1 text-sm text-text-muted">
              {isLoading ? '正在检查执行运行时心跳。' : readinessReason}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={onlineCount > 0 ? statusClassName('completed') : ''}>
            {onlineCount} 个在线
          </Badge>
          <Badge
            variant="outline"
            className={recentlyLostCount > 0 ? statusClassName('waiting_on_dependencies') : ''}
          >
            {recentlyLostCount} 个不稳定
          </Badge>
          {isFallback && (
            <Badge variant="outline" className="border-border bg-bg-surface text-text-subtle">
              演示回退
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          {runtimes.slice(0, 3).map(runtime => (
            <div
              key={runtime.runtimeId}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{runtime.runtimeId}</div>
                <div className="text-xs text-text-muted">
                  {runtime.executor}
                  {runtime.hostname ? ` · ${runtime.hostname}` : ''}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {runtime.availableClis
                    .filter(cli => cli.available)
                    .slice(0, 3)
                    .map(cli => (
                      <Badge key={`${cli.command}-${cli.path ?? 'path'}`} variant="outline">
                        {runtimeCLILabel(cli.name, cli.version)}
                      </Badge>
                    ))}
                  {runtime.sandbox?.mode ? (
                    <Badge variant="outline">沙箱：{runtime.sandbox.mode}</Badge>
                  ) : null}
                  <Badge variant="outline">{runtime.localSkillCount} 个技能</Badge>
                </div>
              </div>
              <Badge variant="outline">{runtime.status}</Badge>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={sweepRuntimeHeartbeats}
            disabled={sweepRuntimes.isPending || sweepTasks.isPending}
          >
            {sweepRuntimes.isPending ? '清理中' : '清理运行时'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sweepStaleExecutionTasks}
            disabled={sweepRuntimes.isPending || sweepTasks.isPending}
          >
            {sweepTasks.isPending ? '清理中' : '清理任务'}
          </Button>
        </div>
      </div>
      {maintenanceMessage && (
        <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
          {maintenanceMessage}
        </div>
      )}
    </div>
  );
}

function runtimeCLILabel(name: string, version?: string): string {
  const cleanName = name.trim() || 'CLI';
  const cleanVersion = version?.trim();
  if (!cleanVersion) {
    return cleanName;
  }
  return `${cleanName}: ${cleanVersion.replace(cleanName, '').trim() || cleanVersion}`;
}

function executionAgentOptionsFromRuntimes(
  runtimes: readonly ExecutorRuntime[],
  now: number,
  allowFallback: boolean
): ExecutionAgentOption[] {
  const grouped = new Map<
    string,
    {
      executor: string;
      hostnames: Set<string>;
      commandLabels: Set<string>;
      runtimeCount: number;
    }
  >();

  for (const runtime of runtimes) {
    const executor = runtime.executor.trim();
    if (!executor || deriveRuntimeHealth(runtime, now) !== 'online') {
      continue;
    }
    const existing =
      grouped.get(executor) ??
      {
        executor,
        hostnames: new Set<string>(),
        commandLabels: new Set<string>(),
        runtimeCount: 0,
      };
    existing.runtimeCount += 1;
    existing.hostnames.add(runtime.hostname || runtime.runtimeId);
    for (const cli of runtime.availableClis.filter(cli => cli.available)) {
      existing.commandLabels.add(runtimeCLILabel(cli.name || cli.command, cli.version));
    }
    grouped.set(executor, existing);
  }

  if (grouped.size === 0 && allowFallback) {
    return [
      {
        executor: 'codex_cli',
        label: executorDisplayName('codex_cli'),
        description: '演示运行时',
        commandLabels: ['Codex CLI'],
        runtimeCount: 0,
        canDispatch: true,
      },
    ];
  }

  return [...grouped.values()]
    .map(group => {
      const canDispatch = executionReadinessForExecutor({
        runtimes,
        executor: group.executor,
        now,
        allowFallback,
      }).canDispatch;
      const hostnames = [...group.hostnames].slice(0, 2);
      const extraHostCount = group.hostnames.size - hostnames.length;
      const description =
        hostnames.join(' / ') + (extraHostCount > 0 ? ` +${extraHostCount}` : '');

      return {
        executor: group.executor,
        label: executorDisplayName(group.executor),
        description,
        commandLabels: [...group.commandLabels],
        runtimeCount: group.runtimeCount,
        canDispatch,
      };
    })
    .sort((a, b) => {
      if (a.canDispatch !== b.canDispatch) {
        return a.canDispatch ? -1 : 1;
      }
      return a.label.localeCompare(b.label);
    });
}

function executorDisplayName(executor: string) {
  switch (executor) {
    case 'codex_cli':
      return 'Codex CLI';
    case 'claude_cli':
      return 'Claude Code';
    default:
      return executor
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
        .trim();
  }
}

function RepoProfileSummary({
  repoId,
  repoProfile,
  planSource,
  onProfileSaved,
}: {
  repoId: string;
  repoProfile: RepoProfile;
  planSource: 'api' | 'demo' | 'empty';
  onProfileSaved: (profile: RepoProfile) => void;
}) {
  const profileQuery = useRepoProfile(repoId);
  const architectureQuery = useRepoArchitectureStatus(repoId);
  const [savedProfile, setSavedProfile] = useState<SpecForgeRepoProfileDTO>();
  const effectiveProfile = savedProfile
    ? repoProfileFromDTO(savedProfile)
    : profileQuery.data
      ? repoProfileFromDTO(profileQuery.data)
      : repoProfile;
  const editorKey = [
    effectiveProfile.repositoryId,
    effectiveProfile.defaultBranch,
    effectiveProfile.stack.join('|'),
    effectiveProfile.testCommands.join('|'),
    effectiveProfile.ciProvider,
  ].join(':');

  return (
    <div className="rounded-lg border border-border-subtle bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-primary" />
          仓库画像
        </div>
        <Badge
          variant="outline"
          className={planSource === 'api' ? statusClassName('completed') : ''}
        >
          {planSource === 'api'
            ? '真实计划'
            : planSource === 'empty'
              ? '等待计划'
              : '演示回退'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Badge variant="outline">{repoProfileSourceLabel(effectiveProfile.source)}</Badge>
        {effectiveProfile.lastIndexedAt ? (
          <span>已索引 {formatTimestamp(effectiveProfile.lastIndexedAt)}</span>
        ) : (
          <span>尚未索引</span>
        )}
      </div>
      {effectiveProfile.warnings.length > 0 ? (
        <div className="mt-3 space-y-2">
          {effectiveProfile.warnings.map(warning => (
            <div
              key={warning}
              className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900"
            >
              <Info className="mt-0.5 h-3.5 w-3.5 flex-none" />
              <span>{localizeProjectContextText(warning)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-text-muted">{effectiveProfile.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {effectiveProfile.stack.map(item => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
      </div>
      <RepoProfileEditor
        key={editorKey}
        repoId={repoId}
        initialProfile={effectiveProfile}
        architectureStatus={architectureQuery.data}
        isOffline={profileQuery.isError}
        onSaved={profile => {
          setSavedProfile(profile);
          onProfileSaved(repoProfileFromDTO(profile));
        }}
      />
    </div>
  );
}

function RepoProfileEditor({
  repoId,
  initialProfile,
  architectureStatus,
  isOffline,
  onSaved,
}: {
  repoId: string;
  initialProfile: RepoProfile;
  architectureStatus?: SpecForgeRepoArchitectureStatusDTO;
  isOffline: boolean;
  onSaved: (profile: SpecForgeRepoProfileDTO) => void;
}) {
  const upsertProfile = useUpsertRepoProfile(repoId);
  const inferProfile = useInferRepoProfile(repoId);
  const reindexArchitecture = useReindexRepoArchitecture(repoId);
  const [defaultBranch, setDefaultBranch] = useState(initialProfile.defaultBranch);
  const [stack, setStack] = useState(profileListValue(initialProfile.stack));
  const [testCommands, setTestCommands] = useState(profileListValue(initialProfile.testCommands));
  const [ciProvider, setCIProvider] = useState(initialProfile.ciProvider);
  const [codingConventions, setCodingConventions] = useState(
    profileListValue(initialProfile.codingConventions)
  );
  const [riskAreas, setRiskAreas] = useState(profileListValue(initialProfile.riskAreas));
  const [summary, setSummary] = useState(initialProfile.summary);

  async function saveProfile() {
    if (!repoId) {
      return;
    }

    const payload = repoProfilePayloadFromForm({
      defaultBranch,
      stack,
      testCommands,
      ciProvider,
      codingConventions,
      riskAreas,
      summary,
    });
    const saved = await upsertProfile.mutateAsync(payload);
    onSaved(saved);
  }

  async function inferFromRepositoryHints() {
    if (!repoId) {
      return;
    }

    const inferred = await inferProfile.mutateAsync(
      githubTreeProfileInferencePayload(defaultBranch)
    );
    onSaved(inferred);
  }

  async function reindexRepositoryArchitecture() {
    if (!repoId) {
      return;
    }

    await reindexArchitecture.mutateAsync({ default_branch: defaultBranch.trim() || undefined });
  }

  return (
    <div className="mt-4 space-y-3">
      <RepoArchitectureStatus
        status={architectureStatus}
        isOffline={isOffline}
        isReindexing={reindexArchitecture.isPending}
        onReindex={reindexRepositoryArchitecture}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          value={defaultBranch}
          onChange={event => setDefaultBranch(event.target.value)}
          aria-label="默认分支"
          placeholder="默认分支"
        />
        <Input
          value={ciProvider}
          onChange={event => setCIProvider(event.target.value)}
          aria-label="CI 提供方"
          placeholder="CI 提供方"
        />
      </div>
      <Input
        value={stack}
        onChange={event => setStack(event.target.value)}
        aria-label="仓库技术栈"
        placeholder="技术栈：Go, Next.js, TypeScript"
      />
      <Input
        value={testCommands}
        onChange={event => setTestCommands(event.target.value)}
        aria-label="测试命令"
        placeholder="测试命令：go test ./..., pnpm lint"
      />
      <Input
        value={codingConventions}
        onChange={event => setCodingConventions(event.target.value)}
        aria-label="编码约定"
        placeholder="编码约定"
      />
      <Input
        value={riskAreas}
        onChange={event => setRiskAreas(event.target.value)}
        aria-label="风险区域"
        placeholder="风险区域：认证、迁移"
      />
      <Textarea
        value={summary}
        onChange={event => setSummary(event.target.value)}
        className="min-h-24"
        aria-label="仓库画像摘要"
        placeholder="总结仓库结构和实现约定。"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-text-muted">
          {isOffline
            ? '启动 CodingCTO 后端后才能保存画像变更。'
            : '仓库画像会用于计划、PR DAG 和提示词编译。'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={inferFromRepositoryHints}
            disabled={!repoId || isOffline || inferProfile.isPending}
          >
            {inferProfile.isPending ? '推断中' : '推断画像'}
          </Button>
          <Button onClick={saveProfile} disabled={!repoId || isOffline || upsertProfile.isPending}>
            {upsertProfile.isPending ? '保存中' : '保存画像'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RepoArchitectureStatus({
  status,
  isOffline,
  isReindexing,
  onReindex,
}: {
  status?: SpecForgeRepoArchitectureStatusDTO;
  isOffline: boolean;
  isReindexing: boolean;
  onReindex: () => void;
}) {
  const snapshot = status?.snapshot;
  const staleReasons = status?.stale_reasons ?? [];
  const badgeLabel = isOffline
    ? '离线'
    : status?.stale
      ? '需要重新索引'
      : snapshot
        ? '架构最新'
        : '暂无快照';

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          架构快照
        </div>
        <Badge
          variant="outline"
          className={!status?.stale && snapshot ? statusClassName('completed') : ''}
        >
          {badgeLabel}
        </Badge>
      </div>
      <div className="mt-2 text-xs leading-5 text-text-muted">
        {snapshot ? (
          <>
            <span>{snapshot.commit_sha || '未知引用'}</span>
            <span className="mx-2">·</span>
            <span>{snapshot.modules.length} 个模块</span>
            <span className="mx-2">·</span>
            <span>{snapshot.ci_workflows.length} 个 CI 工作流</span>
          </>
        ) : (
          <span>先生成架构快照，让计划前的仓库分析可追踪。</span>
        )}
      </div>
      {staleReasons.length > 0 ? (
        <div className="mt-2 space-y-1">
          {staleReasons.map(reason => (
            <div key={reason} className="text-xs leading-5 text-warning">
              {reason}
            </div>
          ))}
        </div>
      ) : null}
      {snapshot?.modules.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {snapshot.modules.slice(0, 6).map(moduleName => (
            <Badge key={moduleName} variant="outline" className="text-text-muted">
              {moduleName}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onReindex}
          disabled={isOffline || isReindexing}
        >
          {isReindexing ? '重新索引中' : '重新索引'}
        </Button>
      </div>
    </div>
  );
}

function RepoSkillsPanel({ repoId, projectId }: { repoId: string; projectId?: number }) {
  const [name, setName] = useState('仓库编码规范');
  const [description, setDescription] = useState('注入 CodingCTO 提示词的仓库指令。');
  const [content, setContent] = useState('');
  const [active, setActive] = useState(true);
  const [savedSkill, setSavedSkill] = useState<SpecForgeSkillDTO>();

  const skillsQuery = useSpecForgeSkills(repoId);
  const projectSkillsQuery = useSpecForgeProjectSkills(projectId);
  const upsertSkill = useUpsertSpecForgeSkill(repoId);
  const upsertProjectSkill = useUpsertSpecForgeProjectSkill(projectId);
  const skills = skillsQuery.data?.skills ?? [];
  const projectSkills = projectSkillsQuery.data?.project_skills ?? [];
  const latestProjectSkill = projectSkills[0]?.skill;
  const latestSkill = savedSkill ?? latestProjectSkill ?? skills[0];
  const savedCount = projectId ? projectSkills.length : skills.length;
  const isSaving = upsertSkill.isPending || upsertProjectSkill.isPending;

  async function saveSkill() {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!repoId || !trimmedName || !trimmedContent) {
      return;
    }

    if (projectId) {
      const response = await upsertProjectSkill.mutateAsync({
        repository_id: repoId,
        name: trimmedName,
        description: description.trim(),
        content: trimmedContent,
        active,
      });
      if (response.project_skill.skill) {
        setSavedSkill(response.project_skill.skill);
      }
      return;
    }

    const response = await upsertSkill.mutateAsync({
      name: trimmedName,
      description: description.trim(),
      content: trimmedContent,
      active,
    });
    setSavedSkill(response.skill);
  }

  function applySkillTemplate(template: SpecForgeSkillTemplate) {
    setName(template.name);
    setDescription(template.description);
    setContent(template.content);
    setActive(true);
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            仓库技能
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            保存用于计划、提示词编译和项目技能运行的仓库指令。
          </p>
        </div>
        <Badge
          variant="outline"
          className={savedCount > 0 || savedSkill ? statusClassName('completed') : ''}
        >
          {skillsQuery.isLoading || projectSkillsQuery.isLoading
            ? '检查中'
            : savedCount > 0
              ? `已保存 ${savedCount} 个`
              : savedSkill
                ? '已保存'
                : '暂无技能'}
        </Badge>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {specForgeSkillTemplates.map(template => (
            <Button
              key={template.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applySkillTemplate(template)}
            >
              {template.name}
            </Button>
          ))}
        </div>
        <Input
          value={name}
          onChange={event => setName(event.target.value)}
          aria-label="技能名称"
          placeholder="技能名称"
        />
        <Input
          value={description}
          onChange={event => setDescription(event.target.value)}
          aria-label="技能描述"
          placeholder="技能描述"
        />
        <Textarea
          value={content}
          onChange={event => setContent(event.target.value)}
          className="min-h-24"
          aria-label="技能内容"
          placeholder="数据访问使用 service 层，API route 保持轻薄；UI PR 前运行 pnpm type-check。"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            启用
          </Label>
          <Button
            onClick={saveSkill}
            disabled={!repoId || !name.trim() || !content.trim() || isSaving}
          >
            {isSaving ? '保存中' : projectId ? '保存项目技能' : '保存技能'}
          </Button>
        </div>
        {(skillsQuery.isError || projectSkillsQuery.isError) && (
          <p className="text-xs leading-5 text-text-muted">
            CodingCTO 后端可用后才能保存技能。
          </p>
        )}
        {latestSkill && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
            最新：{latestSkill.name}
          </div>
        )}
      </div>
    </div>
  );
}

function GitHubWebhookEventsPanel() {
  const eventsQuery = useGitHubWebhookEvents({ limit: 5 });
  const events = sortWebhookEvents(eventsQuery.data?.events ?? []).slice(0, 5);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="h-4 w-4 text-primary" />
          GitHub Webhook
        </div>
        <Badge variant="outline">最近 {events.length} 条</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {eventsQuery.isLoading && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            正在加载 Webhook 事件。
          </div>
        )}
        {eventsQuery.isError && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            CodingCTO 后端可用后会加载 Webhook 事件。
          </div>
        )}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            暂无 Webhook 事件记录。
          </div>
        )}
        {events.map(event => (
          <GitHubWebhookEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function GitHubWebhookEventRow({ event }: { event: GitHubWebhookEventDTO }) {
  const details = webhookEventDetails(event);
  const risk = webhookEventRisk(event);
  const sourceUrl = details.reviewUrl ?? details.pullRequestUrl ?? details.workflowUrl;

  return (
    <div
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-subtle p-3',
        risk === 'blocked' && 'border-warning/30 bg-warning-subtle',
        risk === 'failed' && 'border-error/30 bg-error-subtle'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{webhookEventLabel(event)}</div>
        <div className="flex flex-wrap items-center gap-2">
          {details.reviewState && <Badge variant="outline">{details.reviewState}</Badge>}
          {details.workflowConclusion && (
            <Badge variant="outline">{details.workflowConclusion}</Badge>
          )}
          <Badge
            variant="outline"
            className={
              risk === 'blocked'
                ? statusClassName('blocked')
                : risk === 'failed'
                  ? statusClassName('failed')
                  : ''
            }
          >
            {event.status}
          </Badge>
        </div>
      </div>
      <div className="mt-1 text-xs text-text-muted">{webhookEventRepo(event)}</div>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <span>{event.delivery_id}</span>
        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-primary">
            打开来源
          </a>
        )}
      </div>
    </div>
  );
}

function RunSummary({
  progressText,
  approved,
  run,
}: {
  progressText: string;
  approved: boolean;
  run: ExecutionRun;
}) {
  const summary = summarizeDeliveryRun(run);
  const blockedNode = nextBlockedNode(run.tasks);
  const reviewableNode = nextReviewableNode(run.tasks);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">PR 交付</div>
          <div className="mt-1 text-sm text-text-muted">{summary.headline}</div>
          <div className="mt-1 text-xs text-text-muted">{progressText}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={approved ? statusClassName('completed') : ''}>
            {approved ? '计划已审批' : '需要审批计划'}
          </Badge>
          <Badge
            variant="outline"
            className={
              run.status === 'running' || run.status === 'blocked'
                ? statusClassName(run.status)
                : ''
            }
          >
            {executionRunStatusLabel(run.status)}
          </Badge>
          {run.status !== 'idle' && (
            <Badge variant="outline">已选择 {run.selectedPRNodeIds.length} 个 PR 节点</Badge>
          )}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-subtle">
        <div className="h-full bg-primary" style={{ width: `${summary.progressPercent}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <DeliveryMetric label="可评审" value={summary.ready} status="ready_for_review" />
        <DeliveryMetric label="执行中" value={summary.active} status="ci_running" />
        <DeliveryMetric label="等待中" value={summary.waiting} status="waiting_on_dependencies" />
        <DeliveryMetric label="阻塞" value={summary.blocked} status="blocked" />
        <DeliveryMetric label="失败" value={summary.failed} status="failed" />
        <DeliveryMetric label="已合并" value={summary.merged} status="merged" />
      </div>
      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">下一步</div>
          <div className="mt-1 text-text-muted">{summary.nextAction}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockedNode && (
            <Badge variant="outline" className={statusClassName('blocked')}>
              {blockedNode.nodeKey} 已阻塞
            </Badge>
          )}
          {reviewableNode && (
            <Badge variant="outline" className={statusClassName('ready_for_review')}>
              {reviewableNode.nodeKey} 待评审
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: PRNode['status'];
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{label}</span>
        <Badge variant="outline" className={value > 0 ? statusClassName(status) : ''}>
          {value}
        </Badge>
      </div>
    </div>
  );
}

function PlanReview({
  plan,
  decisionOverrides,
  selectedExecutionNodeIds,
  approved,
  isStarting,
  executionReadiness,
  agentOptions,
  selectedExecutor,
  onDecisionOverrideChange,
  onExecutionNodeSelectionChange,
  onExecutorChange,
  onApprove,
}: {
  plan: PlanBundle;
  decisionOverrides: Record<string, string>;
  selectedExecutionNodeIds: string[];
  approved: boolean;
  isStarting: boolean;
  executionReadiness: ExecutionReadiness;
  agentOptions: ExecutionAgentOption[];
  selectedExecutor: string;
  onDecisionOverrideChange: (key: string, value: string) => void;
  onExecutionNodeSelectionChange: (nodeIds: string[]) => void;
  onExecutorChange: (value: string) => void;
  onApprove: () => void;
}) {
  const { productSpec, implementationPlan } = plan;
  const approvalReadiness = planApprovalReadiness(plan);
  const executionRangeNotes = executionRangeReview(plan.prNodes, selectedExecutionNodeIds);
  const canStartSelectedRange = canStartExecutionRange(plan.prNodes, selectedExecutionNodeIds);
  const decisionFields = decisionFieldsForPlan(plan);
  const planAssumptions = productSpec.assumptions.filter(
    item => !item.startsWith('PR DAG review:')
  );
  const skillRunsQuery = useSpecForgePlanSkillRuns(plan.planId);
  const skillRuns = skillRunsQuery.data?.skill_runs ?? [];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">产品理解</CardTitle>
          <CardDescription>执行前确认默认决策和验收标准。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="目标" items={productSpec.goals} />
          <ListBlock title="业务规则" items={productSpec.businessRules} />
          <DecisionOverrideFields
            fields={decisionFields}
            values={decisionOverrides}
            disabled={approved || isStarting}
            onChange={onDecisionOverrideChange}
          />
          <ListBlock title="验收标准" items={productSpec.acceptanceCriteria} />
          <ListBlock title="计划假设" items={planAssumptions} />
          <SkillPipelinePanel
            skillRuns={skillRuns}
            isLoading={skillRunsQuery.isLoading}
            isOffline={skillRunsQuery.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">技术计划</CardTitle>
          <CardDescription>{implementationPlan.technicalSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="影响范围" items={implementationPlan.affectedAreas} />
          <ListBlock title="PR DAG 审核" items={plan.prDagReview} />
          <ExecutionAgentSelect
            id="specforge-plan-agent"
            label="执行智能体"
            emptyLabel="未检测到可执行的本地智能体"
            options={agentOptions}
            value={selectedExecutor}
            disabled={approved || isStarting}
            onChange={onExecutorChange}
          />
          <ExecutionRangeSelector
            nodes={plan.prNodes}
            selectedNodeIds={selectedExecutionNodeIds}
            disabled={approved || isStarting}
            onChange={onExecutionNodeSelectionChange}
          />
          <ListBlock title="执行范围审核" items={executionRangeNotes} />
          <ListBlock title="安全风险" items={implementationPlan.securityRisks} icon="risk" />
          <ListBlock title="迁移风险" items={implementationPlan.migrationRisks} />
          {!approvalReadiness.canApprove && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              {approvalReadiness.reason}
            </p>
          )}
          {!canStartSelectedRange && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              开始执行前请至少选择一个 PR 节点。
            </p>
          )}
          {!executionReadiness.canDispatch && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              {executionReadiness.reason}
            </p>
          )}
          <Button
            onClick={onApprove}
            disabled={
              approved ||
              isStarting ||
              !approvalReadiness.canApprove ||
              !canStartSelectedRange ||
              !executionReadiness.canDispatch
            }
            className="w-full justify-center"
          >
            {approved ? '已审批' : isStarting ? '正在启动执行' : '审批并启动'}
            {approved ? (
              <CheckCircle2 className="ml-1.5 h-4 w-4" />
            ) : (
              <Play className="ml-1.5 h-4 w-4" />
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillPipelinePanel({
  skillRuns,
  isLoading,
  isOffline,
}: {
  skillRuns: SpecForgeSkillRunDTO[];
  isLoading: boolean;
  isOffline: boolean;
}) {
  const stages = skillRuns.length
    ? skillRuns
    : [
        {
          id: 0,
          stage: 'product_plan',
          status: 'pending',
          input_summary: '',
          output_summary: 'API 生成计划后，这里会记录产品理解。',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 1,
          stage: 'technical_plan',
          status: 'pending',
          input_summary: '',
          output_summary: 'API 生成计划后，这里会展示技术规划历史。',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          stage: 'pr_dag',
          status: 'pending',
          input_summary: '',
          output_summary: 'PR DAG 生成过程会作为技能运行记录追踪。',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
      ];

  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="h-4 w-4 text-primary" />
          技能流水线
        </div>
        <Badge
          variant="outline"
          className={skillRuns.length > 0 ? statusClassName('completed') : ''}
        >
          {isLoading ? '检查中' : skillRuns.length > 0 ? `${skillRuns.length} 次运行` : '等待中'}
        </Badge>
      </div>
      {isOffline ? (
        <p className="mt-2 text-xs leading-5 text-text-muted">
          CodingCTO 后端可用后会加载技能运行历史。
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        {stages.map(run => (
          <div
            key={`${run.stage}-${run.id}`}
            className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase text-text-subtle">
                {skillRunStageLabel(run.stage)}
              </span>
              <Badge variant="outline" className={statusClassName(run.status)}>
                {run.status}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
              {run.output_summary || '暂无输出记录。'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function skillRunStageLabel(stage: string) {
  const labels: Record<string, string> = {
    product_plan: '产品计划',
    technical_plan: '技术计划',
    pr_dag: 'PR DAG',
    self_review: '自检',
  };
  return labels[stage] ?? stage.replaceAll('_', ' ');
}

function ExecutionRangeSelector({
  nodes,
  selectedNodeIds,
  disabled,
  onChange,
}: {
  nodes: PRNode[];
  selectedNodeIds: string[];
  disabled: boolean;
  onChange: (nodeIds: string[]) => void;
}) {
  const selected = new Set(selectedNodeIds);

  function toggleNode(nodeId: string, checked: boolean) {
    onChange(selectExecutionNode(nodes, selectedNodeIds, nodeId, checked));
  }

  return (
    <div>
      <h3 className="text-sm font-medium">执行范围</h3>
      <div className="mt-3 space-y-3">
        {nodes.map(node => (
          <div
            key={node.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border-subtle px-3 py-2"
          >
            <div className="min-w-0">
              <div className="break-words text-sm font-medium">
                {node.nodeKey}: {node.title}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                依赖 {node.dependsOn.length > 0 ? node.dependsOn.join(', ') : '无'}
              </div>
            </div>
            <Switch
              checked={selected.has(node.id)}
              disabled={disabled}
              onCheckedChange={checked => toggleNode(node.id, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionOverrideFields({
  fields,
  values,
  disabled,
  onChange,
}: {
  fields: ReturnType<typeof decisionFieldsForPlan>;
  values: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">关键决策</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`decision-${field.key}`}>{field.label}</Label>
            <Input
              id={`decision-${field.key}`}
              value={values[field.key] ?? ''}
              disabled={disabled}
              onChange={event => onChange(field.key, event.target.value)}
            />
            <p className="text-xs leading-5 text-text-muted">{field.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon?: 'risk' }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {icon === 'risk' && <ShieldAlert className="h-4 w-4 text-warning" />}
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
        {items.length === 0 && (
          <li className="flex gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-text-muted" />
            <span>暂无记录。</span>
          </li>
        )}
        {items.map(item => (
          <li key={item} className="flex min-w-0 gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-primary" />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PRDag({
  nodes,
  repositoryId,
  isCompilingPrompt,
  onCompilePrompt,
}: {
  nodes: PRNode[];
  repositoryId: string;
  isCompilingPrompt: boolean;
  onCompilePrompt: (node: PRNode, mode: PromptMode) => Promise<string>;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string>();
  const [promptMode, setPromptMode] = useState<PromptMode>('implementation');
  const [selectedFixNode, setSelectedFixNode] = useState<PRNode>();
  const [localFixAttempts, setLocalFixAttempts] = useState<SpecForgeFixAttemptDTO[]>([]);
  const [failureLog, setFailureLog] = useState<SpecForgePRNodeFailureLogDTO>();
  const [failureLogError, setFailureLogError] = useState('');
  const [promptText, setPromptText] = useState('');
  const [deliveryNodes, setDeliveryNodes] = useState<Record<string, PRNode>>({});
  const [deliveryActionNodeId, setDeliveryActionNodeId] = useState<string>();
  const [deliveryError, setDeliveryError] = useState('');
  const prepareBranch = usePrepareSpecForgePRNodeBranch();
  const deliverPR = useDeliverSpecForgePRNode();
  const refreshCI = useRefreshSpecForgePRNodeCI();
  const verifyCI = useVerifySpecForgePRNodeCI();
  const selectedFixNodeId = selectedFixNode ? Number(selectedFixNode.id) : undefined;
  const canReadFixAttempts =
    selectedFixNodeId !== undefined && Number.isFinite(selectedFixNodeId) && selectedFixNodeId > 0;
  const fixAttemptsQuery = useSpecForgeFixAttempts(
    canReadFixAttempts ? selectedFixNodeId : undefined
  );
  const readFailureLog = useReadSpecForgePRNodeFailureLog();
  const fixAttempts = canReadFixAttempts
    ? (fixAttemptsQuery.data ?? localFixAttempts)
    : localFixAttempts;
  const hasLiveFixAttempt = hasActiveFixAttempt(fixAttempts);
  const escalationSummaryQuery = useSpecForgeEscalationSummary(
    canReadFixAttempts ? selectedFixNodeId : undefined,
    hasLiveFixAttempt
  );
  const highestFixAttempt = Math.max(0, ...fixAttempts.map(attempt => attempt.attempt_number));
  const remainingFixAttempts = Math.max(0, maxFixAttemptsPerNode - highestFixAttempt);
  const fixBudgetExhausted = highestFixAttempt >= maxFixAttemptsPerNode;
  const effectiveNodes = nodes.map(node => deliveryNodes[node.id] ?? node);
  const isDeliveryActionPending =
    prepareBranch.isPending || deliverPR.isPending || refreshCI.isPending;

  function rememberDeliveredNode(node: PRNode) {
    setDeliveryNodes(current => ({
      ...current,
      [node.id]: node,
    }));
  }

  async function runDeliveryAction(node: PRNode, action: 'prepare' | 'deliver' | 'refresh') {
    const prNodeId = Number(node.id);
    if (!repositoryId || !Number.isFinite(prNodeId) || prNodeId <= 0) {
      setDeliveryError('真实 GitHub 交付需要已持久化的仓库和 PR 节点。');
      return;
    }

    setDeliveryError('');
    setDeliveryActionNodeId(node.id);
    try {
      const payload = { repository_id: repositoryId, pr_node_id: prNodeId };
      const updated =
        action === 'prepare'
          ? await prepareBranch.mutateAsync(payload)
          : action === 'deliver'
            ? await deliverPR.mutateAsync({ ...payload, draft: true })
            : await refreshCI.mutateAsync(payload);
      rememberDeliveredNode(prNodeFromDTO(updated));
    } catch {
      setDeliveryError(
        'GitHub 交付控制需要 CodingCTO 后端和 GitHub App 配置可用。'
      );
    } finally {
      setDeliveryActionNodeId(undefined);
    }
  }

  async function handleCompilePrompt(node: PRNode) {
    setSelectedNodeId(node.id);
    const compiled = await onCompilePrompt(node, promptMode);
    setPromptText(compiled);
  }

  async function inspectFailure(node: PRNode) {
    setSelectedFixNode(node);
    setFailureLog(undefined);
    setFailureLogError('');
    const prNodeId = Number(node.id);
    if (Number.isFinite(prNodeId) && prNodeId > 0) {
      try {
        const result = await verifyCI.mutateAsync({
          prNodeId,
          payload: { repository_id: repositoryId },
        });
        rememberDeliveredNode(prNodeFromDTO(result.pr_node));
        setLocalFixAttempts(result.fix_attempt ? [result.fix_attempt] : []);
        return;
      } catch {
        // Keep failure review available for demo plans and offline backend development.
      }
    }

    setLocalFixAttempts([
      {
        id: 0,
        pr_node_id: Number.isFinite(prNodeId) ? prNodeId : 0,
        failure_type: 'ci_failure',
        ci_log_excerpt: '演示模式下没有实时 CI 日志。',
        attempt_number: 1,
        status: 'queued',
        confidence: 0.7,
        risk_level: 'low',
        action_kind: 'user_decision',
        likely_cause: 'CI 诊断需要这个 PR 节点对应的 GitHub workflow 运行记录。',
        recommended_action: '先为分支运行 CI，再查看失败任务日志。',
        can_auto_fix: false,
        created_by: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  async function readSelectedFailureLog() {
    if (!selectedFixNode || !repositoryId) {
      setFailureLogError('失败日志需要先选择 PR 节点和仓库。');
      return;
    }

    const prNodeId = Number(selectedFixNode.id);
    if (!Number.isFinite(prNodeId) || prNodeId <= 0) {
      setFailureLogError('失败日志需要已持久化的 PR 节点。');
      return;
    }

    setFailureLogError('');
    try {
      const log = await readFailureLog.mutateAsync({
        repository_id: repositoryId,
        pr_node_id: prNodeId,
      });
      setFailureLog(log);
    } catch {
      setFailureLogError(
        '失败日志需要失败的 GitHub workflow 运行记录，以及 GitHub App 访问权限。'
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">提示词模式</div>
          <div className="mt-1 text-text-muted">
            为选中的 PR 节点编译实现、CI 修复或评审修订提示词。
          </div>
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={promptMode}
          onValueChange={value => {
            if (promptModes.includes(value as PromptMode)) {
              setPromptMode(value as PromptMode);
            }
          }}
          className="w-full md:w-auto"
        >
          {promptModes.map(mode => (
            <ToggleGroupItem key={mode} value={mode} aria-label={`${promptModeLabel[mode]}提示词`}>
              {promptModeLabel[mode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">自动修复护栏</div>
          <div className="mt-1 text-text-muted">
            每个 PR 节点最多可自动修复 {maxFixAttemptsPerNode} 次，超过后 CodingCTO 会汇总决策信息并升级处理。
          </div>
        </div>
        <Badge variant="outline">最多 3 次</Badge>
      </div>
      {deliveryError && (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
          {deliveryError}
        </div>
      )}
      {effectiveNodes.map((node, index) => (
        <div key={node.id} className="grid gap-3 md:grid-cols-[32px_minmax(0,1fr)]">
          <div className="hidden flex-col items-center md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-bg-surface text-xs font-semibold">
              {node.order}
            </div>
            {index < nodes.length - 1 && <div className="h-full w-px bg-border-subtle" />}
          </div>
          <Card className="transition-colors hover:border-primary/40">
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{node.title}</CardTitle>
                  <CardDescription className="mt-1">{node.goal}</CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{node.nodeKey}</Badge>
                  <Badge variant="outline" className={riskClassName(node.estimatedRisk)}>
                    {riskLabel(node.estimatedRisk)}风险
                  </Badge>
                  {node.githubPrUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={node.githubPrUrl} target="_blank" rel="noreferrer">
                        PR #{node.githubPrNumber ?? '已打开'}
                        <GitPullRequest className="ml-1.5 h-4 w-4" />
                      </a>
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runDeliveryAction(node, 'prepare')}
                    disabled={isDeliveryActionPending && deliveryActionNodeId === node.id}
                  >
                    分支
                    <GitBranch className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runDeliveryAction(node, 'deliver')}
                    disabled={isDeliveryActionPending && deliveryActionNodeId === node.id}
                  >
                    PR
                    <GitPullRequest className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runDeliveryAction(node, 'refresh')}
                    disabled={isDeliveryActionPending && deliveryActionNodeId === node.id}
                  >
                    CI
                    <CheckCircle2 className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCompilePrompt(node)}
                    disabled={isCompilingPrompt && selectedNodeId === node.id}
                  >
                    {isCompilingPrompt && selectedNodeId === node.id
                      ? '编译中'
                      : promptModeLabel[promptMode]}
                    <ScrollText className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inspectFailure(node)}
                    disabled={verifyCI.isPending && selectedFixNode?.id === node.id}
                  >
                    {verifyCI.isPending && selectedFixNode?.id === node.id ? '检查中' : '修复'}
                    <ShieldAlert className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <CompactList
                title="依赖"
                items={node.dependsOn.length ? node.dependsOn : ['无']}
              />
              <CompactList title="预期文件" items={node.expectedFiles} />
              <CompactList title="测试" items={node.testCommands} />
            </CardContent>
          </Card>
        </div>
      ))}
      {selectedFixNode && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">修复尝试</CardTitle>
                <CardDescription>{selectedFixNode.title}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={readSelectedFailureLog}
                disabled={readFailureLog.isPending}
              >
                {readFailureLog.isPending ? '读取中' : '读取失败日志'}
                <ScrollText className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {failureLogError && (
              <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
                {failureLogError}
              </div>
            )}
            {escalationSummaryQuery.data && (
              <EscalationSummary summary={escalationSummaryQuery.data} />
            )}
            <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
              <div>
                <div className="font-medium text-text-main">自动修复重试额度</div>
                <div className="mt-1 text-text-muted">
                  已使用 {highestFixAttempt} / {maxFixAttemptsPerNode} 次
                  {fixBudgetExhausted
                    ? '；继续重试前需要先升级并确认决策摘要。'
                    : `；还剩 ${remainingFixAttempts} 次自动重试。`}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  fixBudgetExhausted ? statusClassName('blocked') : statusClassName('running')
                }
              >
                {fixBudgetExhausted ? '需要升级处理' : '可自动修复'}
              </Badge>
            </div>
            {failureLog && <FailureLogSummary failureLog={failureLog} />}
            {fixAttempts.length === 0 && (
              <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
                {fixAttemptsQuery.isLoading ? '正在检查 CI 诊断。' : '暂无修复尝试。'}
              </div>
            )}
            {fixAttempts.map(attempt => (
              <div
                key={`${attempt.id}-${attempt.attempt_number}`}
                className="rounded-lg border border-border-subtle bg-bg-subtle p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    第 {attempt.attempt_number} 次：{attempt.failure_type}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {attempt.workflow_run_url ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={attempt.workflow_run_url} target="_blank" rel="noreferrer">
                          运行 {attempt.workflow_run_id || 'CI'}
                          <ExternalLink className="ml-1.5 h-4 w-4" />
                        </a>
                      </Button>
                    ) : attempt.workflow_run_id ? (
                      <Badge variant="outline">运行 {attempt.workflow_run_id}</Badge>
                    ) : null}
                    {attempt.conclusion && <Badge variant="outline">{attempt.conclusion}</Badge>}
                    <Badge variant="outline">{attempt.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-text-muted">{attempt.likely_cause}</p>
                <p className="mt-2 text-sm leading-6 text-text-main">
                  {attempt.recommended_action}
                </p>
              </div>
            ))}
            {fixAttemptsQuery.isError && (
              <p className="text-xs leading-5 text-text-muted">
                CodingCTO 后端可用后会加载真实修复尝试。
              </p>
            )}
            {escalationSummaryQuery.isError && (
              <p className="text-xs leading-5 text-text-muted">
                升级摘要需要 CodingCTO 后端可用。
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {promptText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">已编译提示词</CardTitle>
            <CardDescription>选中 PR 节点的实现提示词。</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-lg border border-border-subtle bg-bg-subtle p-4 text-xs leading-5 text-text-main">
              {promptText}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EscalationSummary({ summary }: { summary: SpecForgeEscalationSummaryDTO }) {
  const needsDecision = summary.status === 'needs_user_decision';

  return (
    <div
      className={cn(
        'rounded-lg border p-4 text-sm',
        needsDecision
          ? 'border-warning/30 bg-warning-subtle text-warning'
          : 'border-border-subtle bg-bg-subtle text-text-muted'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-text-main">升级摘要</div>
        <Badge
          variant="outline"
          className={needsDecision ? statusClassName('blocked') : statusClassName('running')}
        >
          {needsDecision ? '需要决策' : '可继续自动修复'}
        </Badge>
      </div>
      <p className="mt-2 leading-6">{summary.reason}</p>
      <p className="mt-2 leading-6 text-text-main">{summary.recommended_option}</p>
      {summary.latest_likely_cause && (
        <p className="mt-2 leading-6">最新原因：{summary.latest_likely_cause}</p>
      )}
      {summary.decision_options.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.decision_options.map(option => (
            <Badge key={option} variant="outline">
              {option}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ExecutionStatus({
  run,
  isCancelling,
  onAdvance,
  onCancel,
  onExecutionBundle,
}: {
  run: ExecutionRun;
  isCancelling: boolean;
  onAdvance: () => void;
  onCancel: () => void;
  onExecutionBundle: (bundle: SpecForgeExecutionBundleDTO) => void;
}) {
  const canAdvance = run.status === 'running';
  const canCancel = run.status === 'queued' || run.status === 'running' || run.status === 'blocked';
  const [selectedTask, setSelectedTask] = useState<PRNode>();
  const [taskActionError, setTaskActionError] = useState('');
  const [taskActionId, setTaskActionId] = useState<number>();
  const retryTask = useRetryExecutionTask();
  const completeTask = useCompleteExecutionTask();
  const createReviewPatchTask = useCreateReviewPatchTask();
  const selectedTaskId = selectedTask?.taskId;
  const taskEventsQuery = useSpecForgeTaskEvents(selectedTaskId);
  const taskEvents = taskEventsQuery.data?.events ?? [];
  const isTaskActionPending =
    retryTask.isPending || completeTask.isPending || createReviewPatchTask.isPending;
  const blockedRecoverableTasks = run.tasks.filter(
    task => task.status === 'failed' || task.status === 'cancelled'
  );

  async function retryExecutionTask(task: PRNode) {
    if (!task.taskId) {
      setTaskActionError('重试需要已持久化的后端任务。');
      return;
    }

    setTaskActionError('');
    setTaskActionId(task.taskId);
    try {
      const bundle = await retryTask.mutateAsync({
        taskId: task.taskId,
        payload: { force_fresh_session: true },
      });
      onExecutionBundle(bundle);
    } catch {
      setTaskActionError(
        '只有失败或取消的任务可以重试。因依赖关闭的任务需要先调整计划。'
      );
    } finally {
      setTaskActionId(undefined);
    }
  }

  async function completeExecutionTask(task: PRNode) {
    if (!task.taskId) {
      setTaskActionError('标记完成需要已持久化的后端任务。');
      return;
    }

    setTaskActionError('');
    setTaskActionId(task.taskId);
    try {
      const bundle = await completeTask.mutateAsync(task.taskId);
      onExecutionBundle(bundle);
    } catch {
      setTaskActionError(
        '标记完成需要任务处于已派发或执行中，并且 CodingCTO 后端可用。'
      );
    } finally {
      setTaskActionId(undefined);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">执行运行</CardTitle>
          <CardDescription>
            交付状态按 PR 节点组织，而不是按单个智能体 worker 展示。
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCancel} disabled={!canCancel || isCancelling} variant="outline">
            {isCancelling ? '取消中' : '取消运行'}
            <CircleX className="ml-1.5 h-4 w-4" />
          </Button>
          <Button onClick={onAdvance} disabled={!canAdvance} variant="outline">
            推进演示运行
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <PRDeliveryOverview tasks={run.tasks} />
        {run.status === 'blocked' && (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm leading-6 text-warning">
            当前运行正在等待决策。可以用新会话重试失败或取消的任务；如果 PR DAG 需要重新规划，请取消运行。
            {blockedRecoverableTasks.length > 0 && (
              <span className="ml-1 font-medium text-text-main">
                {blockedRecoverableTasks.length} 个任务可重试。
              </span>
            )}
          </div>
        )}
        {taskActionError && (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm text-warning">
            {taskActionError}
          </div>
        )}
        {run.tasks.map(task => (
          <div
            key={`${task.id}-${task.taskId ?? 'planned'}`}
            className={cn(
              'flex flex-col gap-3 rounded-lg border border-border-subtle p-4',
              task.status === 'running' && 'border-info/40 bg-info-subtle'
            )}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <GitPullRequest className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate text-sm font-medium">{task.title}</span>
                </div>
                <div className="mt-1 text-xs text-text-muted">{task.branchName}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {task.executor && (
                    <Badge variant="outline">{executorDisplayName(task.executor)}</Badge>
                  )}
                  {task.runtimeId && (
                    <Badge variant="outline" className="max-w-full">
                      <span className="truncate">Runtime: {task.runtimeId}</span>
                    </Badge>
                  )}
                  {task.attemptNumber && (
                    <Badge variant="outline">第 {task.attemptNumber} 次</Badge>
                  )}
                  {task.taskId && <Badge variant="outline">任务 #{task.taskId}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusClassName(task.status)}>
                  {statusLabel[task.status]}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setSelectedTask(task)}>
                  事件
                  <Terminal className="ml-1.5 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryExecutionTask(task)}
                  disabled={
                    isTaskActionPending ||
                    !(task.status === 'failed' || task.status === 'cancelled')
                  }
                >
                  {retryTask.isPending && taskActionId === task.taskId ? '重试中' : '重试'}
                  <RotateCcw className="ml-1.5 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => completeExecutionTask(task)}
                  disabled={isTaskActionPending || task.status !== 'running'}
                >
                  {completeTask.isPending && taskActionId === task.taskId
                    ? '完成中'
                    : '标记完成'}
                  <CheckCircle2 className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
            {(task.fixAttemptId ||
              task.failureReason ||
              task.errorLog ||
              task.outputLog ||
              task.logsUrl) && <TaskDiagnostics task={task} />}
          </div>
        ))}
        {selectedTask && (
          <TaskEventPanel
            task={selectedTask}
            events={taskEvents}
            isLoading={taskEventsQuery.isLoading}
            isError={taskEventsQuery.isError}
            isSubmittingReviewPatch={
              createReviewPatchTask.isPending && taskActionId === selectedTask.taskId
            }
            onCreateReviewPatch={async feedback => {
              if (!selectedTask.taskId) {
                setTaskActionError('评审修订任务需要已持久化的后端任务。');
                return;
              }
              setTaskActionError('');
              setTaskActionId(selectedTask.taskId);
              try {
                const bundle = await createReviewPatchTask.mutateAsync({
                  taskId: selectedTask.taskId,
                  payload: { feedback, force_fresh_session: true },
                });
                onExecutionBundle(bundle);
              } catch {
                setTaskActionError(
                  '评审修订任务需要原任务已完成、失败或取消，并且 CodingCTO 后端可用。'
                );
              } finally {
                setTaskActionId(undefined);
              }
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PRDeliveryOverview({ tasks }: { tasks: PRNode[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
        尚未选择要执行的 PR 节点。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-main">
        <GitMerge className="h-4 w-4 text-primary" />
        交付图
      </div>
      <div className="mt-3 grid gap-2">
        {tasks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(task => (
            <div
              key={`${task.id}-${task.taskId ?? 'overview'}`}
              className="rounded-lg border border-border-subtle bg-bg-surface p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{task.nodeKey}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                    {task.title}
                  </div>
                </div>
                <Badge variant="outline" className={statusClassName(task.status)}>
                  {statusLabel[task.status]}
                </Badge>
              </div>
              {task.dependsOn.length > 0 && (
                <div className="mt-2 text-xs text-text-muted">
                  依赖 {task.dependsOn.join(', ')}
                </div>
              )}
              {task.githubPrUrl && (
                <a
                  href={task.githubPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center text-xs text-primary"
                >
                  打开 GitHub PR
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function TaskDiagnostics({ task }: { task: PRNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
      {task.fixAttemptId && <div>修复尝试：#{task.fixAttemptId}</div>}
      {task.failureReason && <div>失败原因：{task.failureReason}</div>}
      {task.outputLog && (
        <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words">
          输出：{task.outputLog}
        </div>
      )}
      {task.errorLog && (
        <div className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words">
          错误：{task.errorLog}
        </div>
      )}
      {task.logsUrl && (
        <a
          href={task.logsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-primary hover:underline"
        >
          打开日志
        </a>
      )}
    </div>
  );
}

function FailureLogSummary({ failureLog }: { failureLog: SpecForgePRNodeFailureLogDTO }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{failureLog.job_name}</div>
        <Badge variant="outline">运行 {failureLog.workflow_run_id}</Badge>
      </div>
      {failureLog.failed_steps.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {failureLog.failed_steps.map(step => (
            <Badge key={step} variant="outline" className={statusClassName('failed')}>
              {step}
            </Badge>
          ))}
        </div>
      )}
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-surface p-3 font-mono text-xs leading-5 text-text-main">
        {failureLog.log_excerpt || '没有返回日志片段。'}
      </pre>
    </div>
  );
}

function TaskEventPanel({
  task,
  events,
  isLoading,
  isError,
  isSubmittingReviewPatch,
  onCreateReviewPatch,
}: {
  task: PRNode;
  events: SpecForgeTaskEventDTO[];
  isLoading: boolean;
  isError: boolean;
  isSubmittingReviewPatch: boolean;
  onCreateReviewPatch: (feedback: string) => Promise<void>;
}) {
  const [reviewFeedback, setReviewFeedback] = useState('');
  const canSubmitReviewPatch =
    Boolean(task.taskId) &&
    reviewFeedback.trim().length > 0 &&
    ['completed', 'failed', 'cancelled'].includes(task.status);

  async function submitReviewPatch() {
    const feedback = reviewFeedback.trim();
    if (!feedback) {
      return;
    }
    await onCreateReviewPatch(feedback);
    setReviewFeedback('');
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Terminal className="h-4 w-4 text-primary" />
            任务事件
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {task.title} {task.taskId ? `#${task.taskId}` : ''}
          </div>
        </div>
        <Badge variant="outline">{events.length} 条事件</Badge>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-lg border border-border-subtle bg-bg-subtle p-3">
        {isLoading && <div className="text-sm text-text-muted">正在加载任务事件。</div>}
        {isError && (
          <div className="text-sm text-text-muted">
            CodingCTO 后端可用后会加载真实任务事件。
          </div>
        )}
        {!task.taskId && (
          <div className="text-sm text-text-muted">
            真实任务事件需要已派发的后端任务。
          </div>
        )}
        {task.taskId && !isLoading && !isError && events.length === 0 && (
          <div className="text-sm text-text-muted">暂无任务事件记录。</div>
        )}
        {events.map(event => (
          <TaskEventRow key={event.id} event={event} />
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3">
        <div className="text-sm font-medium text-text-main">评审反馈修订</div>
        <div className="mt-1 text-xs leading-5 text-text-muted">
          当任务进入最终状态后，可以根据人工 PR 评审反馈创建一个限定范围的修订任务。
        </div>
        <Textarea
          value={reviewFeedback}
          onChange={event => setReviewFeedback(event.target.value)}
          className="mt-3 min-h-24 bg-bg-surface"
          aria-label="人工评审反馈"
          placeholder="粘贴这项任务需要处理的 PR 评审反馈..."
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">
            {task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
              ? '可创建修订'
              : '等待任务结束'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={submitReviewPatch}
            disabled={!canSubmitReviewPatch || isSubmittingReviewPatch}
          >
            {isSubmittingReviewPatch ? '排队中' : '创建评审修订'}
            <ScrollText className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function TaskEventRow({ event }: { event: SpecForgeTaskEventDTO }) {
  const eventText = event.content ?? event.output ?? event.input ?? '';

  return (
    <div className="grid gap-2 rounded-md border border-border-subtle bg-bg-surface p-3 text-xs md:grid-cols-[120px_minmax(0,1fr)]">
      <div className="space-y-1 text-text-muted">
        <div>#{event.seq}</div>
        <div>{event.type}</div>
        {event.tool && <div>{event.tool}</div>}
      </div>
      <pre className="whitespace-pre-wrap break-words font-mono text-text-main">
        {eventText || '暂无事件内容。'}
      </pre>
    </div>
  );
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-text-main">
        {items.map(item => (
          <li key={item} className="truncate">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
