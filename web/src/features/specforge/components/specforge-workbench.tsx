'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
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
  githubReadinessRecoveryDiagnostics,
  githubReadinessRecoveryActions,
  githubReadinessRecoveryTargetFromRepositoryId,
  type GitHubReadinessRecoveryDiagnostic,
  type GitHubReadinessRecoveryAction,
} from '@/features/project/github-readiness-recovery';
import {
  executionRunFromDTO,
  planBundleFromDTO,
  prNodeFromDTO,
} from '@/features/specforge/plan-adapter';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';
import {
  qualityGatesForPlanDelivery,
  type QualityGateState,
  type QualityGateSummary,
} from '@/features/specforge/quality-gates';
import {
  qualityGateDecisionStorageKey,
  readRiskGateAccepted,
  writeRiskGateAccepted,
} from '@/features/specforge/quality-gate-decisions';
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
import {
  repoWikiPlanningContext,
  type RepoWikiPlanningContextSummary,
} from '@/features/specforge/repo-wiki-planning-context';
import {
  repoWikiExpertContract,
  type RepoWikiExpertContract,
} from '@/features/specforge/repo-wiki-expert-contract';
import { githubTreeProfileInferencePayload } from '@/features/specforge/repo-profile-inference';
import {
  useApproveSpecForgePlan,
  useCancelExecutionRun,
  useCompileSpecForgePrompt,
  useCreateDirectAgentTask,
  useCreateSpecForgeIdea,
  useCreateSpecForgeProjectIdea,
  useDeliverSpecForgePRNode,
  useDispatchExecutionRun,
  useDirectAgentTasks,
  useDirectTaskEvents,
  useExecutionRun,
  useGitHubRepositories,
  useGitHubRepositoryReadiness,
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
  useSpecForgeRuntimePendingTasks,
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
import {
  executionLifecycleSteps,
  type ExecutionLifecycleState,
} from '@/features/specforge/execution-lifecycle';
import {
  executionHandoffSummary,
  type ExecutionHandoffState,
} from '@/features/specforge/execution-handoff';
import { summarizeTaskEvents } from '@/features/specforge/task-event-summary';
import type {
  CompilePromptPayload,
  SpecForgeFixAttemptDTO,
  SpecForgeEscalationSummaryDTO,
  SpecForgeExecutionBundleDTO,
  GitHubWebhookEventDTO,
  SpecForgePRNodeFailureLogDTO,
  SpecForgeRepoArchitectureStatusDTO,
  GitHubRepositoryDTO,
  CodingCTODirectAgentTaskDTO,
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
import {
  boardParamFromWorkItem,
  workItemFromBoardParam,
  type WorkItemID,
} from '@/features/specforge/board-routing';
import { isPRNodeActive, isPRNodeDelivered } from '@/features/specforge/status';
import {
  nextBlockedNode,
  nextReviewableNode,
  summarizeDeliveryRun,
} from '@/features/specforge/delivery-status';
import {
  deliveryEvidenceLedger,
  type DeliveryEvidenceState,
} from '@/features/specforge/delivery-evidence';
import { deliveryWorkflowSummary } from '@/features/specforge/delivery-workflow';
import {
  dispatchProofSeparationSummary,
  isCodingCTODispatchProofTaskTitle,
  type DispatchProofState,
} from '@/features/specforge/dispatch-proof';
import {
  specForgeSkillTemplates,
  type SpecForgeSkillTemplate,
} from '@/features/specforge/skill-templates';
import {
  activeSkillEvidenceRefs,
  activeSkillNames,
  skillNamesFromRuns,
  skillPromptContractSummary,
} from '@/features/specforge/skill-pipeline';
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

function processStatusLabel(status?: string) {
  switch (status) {
    case 'pending':
      return '等待进程';
    case 'preparing':
      return '准备中';
    case 'running':
      return '进程运行中';
    case 'completed':
      return '进程已完成';
    case 'failed':
      return '进程失败';
    case 'timed_out':
      return '进程超时';
    case 'cancelled':
      return '进程已取消';
    case 'lost':
      return '进程丢失';
    default:
      return status || '进程未知';
  }
}

function processStatusClassName(status?: string) {
  switch (status) {
    case 'completed':
      return 'border-success/30 bg-success-subtle text-success';
    case 'running':
    case 'preparing':
      return 'border-info/30 bg-info-subtle text-info';
    case 'failed':
    case 'timed_out':
    case 'cancelled':
    case 'lost':
      return 'border-error/30 bg-error-subtle text-error';
    default:
      return 'border-border bg-bg-surface text-text-subtle';
  }
}

function formatTimestamp(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleString();
}

function dispatchFailureMessage(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    const record = error as {
      response?: { data?: { message?: string; error?: string } };
      message?: string;
    };
    const apiMessage = record.response?.data?.message || record.response?.data?.error;
    if (apiMessage) {
      return apiMessage;
    }
    if (record.message) {
      return record.message;
    }
  }
  return '启动执行失败。请检查 API 登录态、计划审批状态、在线 runtime 和仓库权限后重试。';
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
  const ideaDraftFromURL = searchParams.get('idea')?.trim() || searchParams.get('draft')?.trim();
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
  const [planGenerationError, setPlanGenerationError] = useState('');
  const [hasPlan, setHasPlan] = useState(!projectId);
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<ExecutionRun>({
    status: 'idle',
    selectedPRNodeIds: [],
    tasks: demoPlan.prNodes,
  });
  const [riskGateAccepted, setRiskGateAccepted] = useState(false);
  const [dispatchError, setDispatchError] = useState('');
  const [selectedExecutor, setSelectedExecutor] = useState('codex_cli');
  const boardParam = searchParams.get('board');
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkItemID>(() =>
    workItemFromBoardParam(boardParam) ?? 'delivery'
  );
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
  const githubReadinessQuery = useGitHubRepositoryReadiness(
    effectiveRepoId.trim() ? effectiveRepoId.trim() : undefined
  );
  const githubReadiness = githubReadinessQuery.data;
  const githubBlockingChecks =
    githubReadiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const githubBlockingCheckCount = githubBlockingChecks.length;
  const githubRecoveryDiagnostics = useMemo(
    () => githubReadinessRecoveryDiagnostics(githubBlockingChecks),
    [githubBlockingChecks]
  );
  const githubRecoveryActionsByBoard = useMemo(() => {
    const empty = {
      delivery: [],
      wiki: [],
      plan: [],
      run: [],
      review: [],
    } satisfies Record<'delivery' | 'wiki' | 'plan' | 'run' | 'review', GitHubReadinessRecoveryAction[]>;
    if (githubBlockingChecks.length === 0) {
      return empty;
    }
    const trimmedRepoId = effectiveRepoId.trim();
    const parsedTarget = githubReadinessRecoveryTargetFromRepositoryId(trimmedRepoId);
    const target =
      githubReadiness?.github_owner && githubReadiness.github_repo
        ? {
            owner: githubReadiness.github_owner,
            repo: githubReadiness.github_repo,
            repositoryId: trimmedRepoId,
          }
        : parsedTarget;
    const actionsForBoard = (board: 'delivery' | 'wiki' | 'plan' | 'run' | 'review') =>
      githubReadinessRecoveryActions(
        githubBlockingChecks,
        target
          ? {
              ...target,
              returnTo: `${pathname}?board=${board}`,
            }
          : undefined
      );
    return {
      delivery: actionsForBoard('delivery'),
      wiki: actionsForBoard('wiki'),
      plan: actionsForBoard('plan'),
      run: actionsForBoard('run'),
      review: actionsForBoard('review'),
    };
  }, [
    effectiveRepoId,
    githubBlockingChecks,
    githubReadiness?.github_owner,
    githubReadiness?.github_repo,
    pathname,
  ]);
  const githubRecoveryActions = githubRecoveryActionsByBoard.delivery;

  const createIdea = useCreateSpecForgeIdea(effectiveRepoId.trim());
  const createProjectIdea = useCreateSpecForgeProjectIdea(projectId);
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const cancelRun = useCancelExecutionRun();
  const compilePrompt = useCompileSpecForgePrompt();
  const createProjectDispatchProofTask = useCreateDirectAgentTask();
  const [projectDispatchProofError, setProjectDispatchProofError] = useState('');
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
  const orchestrationSkillRunsQuery = useSpecForgePlanSkillRuns(activePlan.planId);
  const orchestrationSkillRuns = orchestrationSkillRunsQuery.data?.skill_runs ?? [];
  const promptRepoSkillsQuery = useSpecForgeSkills(effectiveRepoId.trim());
  const promptProjectSkillsQuery = useSpecForgeProjectSkills(projectId);
  const promptRepoSkills = promptRepoSkillsQuery.data?.skills ?? [];
  const promptProjectSkills =
    promptProjectSkillsQuery.data?.project_skills
      ?.filter(projectSkill => projectSkill.active && projectSkill.skill)
      .map(projectSkill => projectSkill.skill as SpecForgeSkillDTO) ?? [];
  const promptActiveSkills = Array.from(
    new Map([...promptRepoSkills, ...promptProjectSkills].map(skill => [skill.id, skill])).values()
  );
  const riskGateDecisionKey = useMemo(
    () => qualityGateDecisionStorageKey({ projectId, plan: activePlan }),
    [activePlan, projectId]
  );
  const deliveryQualityGates = useMemo(
    () =>
      qualityGatesForPlanDelivery(activePlan, hasPlan, run, {
        riskAccepted: riskGateAccepted,
        githubReady: projectId ? githubReadiness?.ready : true,
        githubChecking: projectId ? githubReadinessQuery.isLoading : false,
        githubBlockingCheckCount,
      }),
    [
      activePlan,
      githubBlockingCheckCount,
      githubReadiness?.ready,
      githubReadinessQuery.isLoading,
      hasPlan,
      projectId,
      riskGateAccepted,
      run,
    ]
  );
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
  const projectDispatchProofRuntime = useMemo(
    () =>
      runtimes.find(runtime => {
        if (
          runtime.executor !== effectiveSelectedExecutor ||
          deriveRuntimeHealth(runtime, runtimeNow) !== 'online' ||
          !runtime.sandbox?.writable
        ) {
          return false;
        }
        if (effectiveSelectedExecutor === 'codex_cli') {
          return runtime.availableClis.some(cli => cli.command === 'codex' && cli.available);
        }
        return true;
      }),
    [effectiveSelectedExecutor, runtimeNow, runtimes]
  );
  const projectDispatchProofTasksQuery = useDirectAgentTasks(
    effectiveRepoId.trim()
      ? {
          repository_id: effectiveRepoId.trim(),
          executor: effectiveSelectedExecutor,
          runtime_id: projectDispatchProofRuntime?.runtimeId,
          limit: 5,
        }
      : undefined,
    {
      enabled: Boolean(effectiveRepoId.trim()),
      refetchInterval: 3000,
    }
  );
  const projectDispatchProofTasks = useMemo(
    () =>
      (projectDispatchProofTasksQuery.data?.tasks ?? []).filter(task =>
        isCodingCTODispatchProofTaskTitle(task.title)
      ),
    [projectDispatchProofTasksQuery.data?.tasks]
  );
  const latestProjectDispatchProofTask = projectDispatchProofTasks[0];
  const projectDispatchProofEventsQuery = useDirectTaskEvents(
    latestProjectDispatchProofTask?.id,
    undefined,
    {
      enabled: Boolean(latestProjectDispatchProofTask?.id),
      refetchInterval:
        latestProjectDispatchProofTask &&
        ['queued', 'dispatched', 'running'].includes(latestProjectDispatchProofTask.status)
          ? 3000
          : false,
    }
  );
  const projectDispatchProofEvents = projectDispatchProofEventsQuery.data?.events ?? [];

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
          id: 'review' as const,
          key: task.nodeKey,
          title: task.title,
          description: task.failureReason || task.errorLog || task.goal,
          status: statusLabel[task.status],
          icon: CircleX,
        })),
    [latestRunTasks]
  );

  function selectWorkItem(item: WorkItemID) {
    setSelectedWorkItem(item);
    const params = new URLSearchParams(searchParams.toString());
    params.set('board', boardParamFromWorkItem(item));
    params.delete('new');
    params.delete('create');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function openRequirementIntake() {
    setSelectedWorkItem('intake');
    const params = new URLSearchParams(searchParams.toString());
    params.set('board', boardParamFromWorkItem('intake'));
    params.set('new', 'requirement');
    params.delete('create');
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function openAgentsForCurrentDelivery() {
    const params = new URLSearchParams({
      return_to: `${pathname}?board=delivery`,
    });
    const trimmedRepoId = effectiveRepoId.trim();
    if (trimmedRepoId) {
      params.set('repository_id', trimmedRepoId);
    }
    router.push(`/console/agents?${params.toString()}`);
  }

  function setRequirementDialogOpen(open: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (open) {
      params.set('new', 'requirement');
    } else {
      params.delete('new');
      params.delete('create');
      params.delete('idea');
      params.delete('draft');
    }
    const nextQuery = params.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (!requirementDialogOpen || idea.trim() || !ideaDraftFromURL) {
      return;
    }
    setIdea(ideaDraftFromURL);
  }, [idea, ideaDraftFromURL, requirementDialogOpen]);

  useEffect(() => {
    const nextWorkItem = workItemFromBoardParam(boardParam) ?? 'delivery';
    if (nextWorkItem !== selectedWorkItem) {
      setSelectedWorkItem(nextWorkItem);
    }
  }, [boardParam, selectedWorkItem]);

  useEffect(() => {
    activePlanRef.current = activePlan;
  }, [activePlan]);

  useEffect(() => {
    setRiskGateAccepted(readRiskGateAccepted(riskGateDecisionKey));
  }, [riskGateDecisionKey]);

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
      setDispatchError('');
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
      setPlanGenerationError('请先填写需求，并确认目标仓库已绑定。');
      return false;
    }

    setApproved(false);
    setPlanGenerationError('');
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
      setDispatchError('');
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: nextPlan.prNodes });
      setPlanGenerationError('');
      return true;
    } catch {
      if (projectId) {
        setPlanGenerationError(
          '真实项目计划生成失败。请确认 API 登录态、目标仓库绑定、GitHub 连接和后端服务均可用。'
        );
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
      setDispatchError('');
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: fallbackPlan.prNodes });
      setPlanGenerationError('');
      return true;
    }
  }

  async function generatePlanFromRequirementDialog() {
    const created = await generatePlan();
    if (created) {
      selectWorkItem('plan');
      setRequirementDialogOpen(false);
    }
  }

  async function runProjectDispatchProof() {
    const trimmedRepoId = effectiveRepoId.trim();
    if (!trimmedRepoId) {
      setProjectDispatchProofError('请先选择目标仓库。');
      return;
    }
    if (!executionReadiness.canDispatch || !projectDispatchProofRuntime) {
      setProjectDispatchProofError(executionReadiness.reason);
      return;
    }

    setProjectDispatchProofError('');
    try {
      await createProjectDispatchProofTask.mutateAsync({
        repository_id: trimmedRepoId,
        executor: effectiveSelectedExecutor,
        runtime_id: projectDispatchProofRuntime.runtimeId,
        title: 'CodingCTO project dispatch proof',
        prompt: [
          'Run a read-only CodingCTO project dispatch proof.',
          'Do not modify files. Do not commit. Do not create a branch. Do not open a PR.',
          `Repository id: ${trimmedRepoId}`,
          `Project: ${projectLabel || 'CodingCTO project workspace'}`,
          `Idea: ${idea.trim() || activePlan.idea || 'No current idea text'}`,
          `Plan nodes: ${hasPlan ? activePlan.prNodes.map(node => `${node.nodeKey}: ${node.title}`).join('; ') : 'No plan yet'}`,
          'Inspect only enough to prove that the platform can dispatch this project to the local Codex runtime.',
          'Return a concise JSON-like report with: status, runtime_check, repository_check, project_context_check, blocker.',
        ].join('\n'),
      });
    } catch {
      setProjectDispatchProofError(
        '创建项目调度验证任务失败。请确认 API 登录态、仓库绑定和 runtime token。'
      );
    }
  }

  function resetIdea() {
    writeRiskGateAccepted(riskGateDecisionKey, false);
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
    setRiskGateAccepted(false);
    setDispatchError('');
    setPlanGenerationError('');
    setRun({ status: 'idle', selectedPRNodeIds: [], tasks: projectId ? [] : resetPlan.prNodes });
  }

  async function approveAndStart() {
    if (selectedExecutionNodeIds.length === 0) {
      return;
    }

    setDispatchError('');
    const blockedQualityGates = deliveryQualityGates.filter(gate => gate.state === 'blocked');
    if (blockedQualityGates.length > 0) {
      setDispatchError(
        `正式调度已被质量门阻塞：${blockedQualityGates
          .map(gate => gate.label)
          .join('、')}。请先处理看板中的阻塞项。`
      );
      selectWorkItem('review');
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
        setDispatchError('');
        selectWorkItem('run');
        return;
      } catch (error) {
        setDispatchError(dispatchFailureMessage(error));
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
    selectWorkItem('run');
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
    return `提示词类型：${promptModeLabel[mode]}\n\n${buildPromptPreview(activePlan, node, {
      activeSkills: promptActiveSkills,
      skillRuns: orchestrationSkillRuns,
      qualityGates: deliveryQualityGates,
      executor: effectiveSelectedExecutor,
      runtimeReady: executionReadiness.canDispatch,
    })}`;
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
      title: 'Wiki',
      tone: 'bg-bg-subtle/70',
      emptyLabel: t('stages.context.empty'),
      items: [
        {
          id: 'wiki' as const,
          key: 'WIKI',
          title: '生成 Repo Wiki',
          description: '从仓库结构生成产品和架构专家可引用的知识库。',
          status:
            planSource === 'api'
              ? '真实仓库'
              : planSource === 'empty'
                ? '等待仓库'
                : '演示数据',
          icon: BookOpen,
        },
        {
          id: 'context' as const,
          key: 'CTX',
          title: '仓库画像和 Skill',
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
        executionReadiness={executionReadiness}
        hasPlan={hasPlan}
        skillRunCount={orchestrationSkillRuns.length}
        generationError={planGenerationError}
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
            <h1 className="text-base font-semibold">
              {selectedWorkItem === 'wiki' ? '仓库 Wiki' : t('header.title')}
            </h1>
            <p className="text-xs text-text-muted">
              {projectLabel ? `${projectLabel} · ` : ''}
              {selectedWorkItem === 'wiki'
                ? '代码结构、入口、测试命令和风险'
                : t('header.description')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {selectedWorkItem === 'wiki' ? null : (
            <Badge variant="outline">{t('header.activeRuns', { count: runningCount })}</Badge>
          )}
          <Button variant="outline" size="sm" onClick={openRequirementIntake}>
            新建需求
            <SquarePen className="ml-1.5 h-4 w-4" />
          </Button>
          {selectedWorkItem === 'wiki' ? null : (
            <>
              <Button variant="outline" size="sm" onClick={openAgentsForCurrentDelivery}>
                打开智能体
                <Terminal className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => selectWorkItem('review')}>
                处理检查项
                <ShieldAlert className="ml-1.5 h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="shrink-0 overflow-x-auto border-b border-border-subtle px-4 py-2">
        <div className="flex min-w-max items-center gap-2">
          <span className="mr-1 text-xs font-medium text-text-muted">阶段</span>
          {[
            {
              id: 'delivery' as const,
              label: '看板',
              active: selectedWorkItem === 'delivery' || selectedWorkItem === 'orchestration',
            },
            {
              id: 'intake' as const,
              label: '需求',
              active: selectedWorkItem === 'intake',
            },
            {
              id: 'wiki' as const,
              label: 'Wiki',
              active: selectedWorkItem === 'wiki' || selectedWorkItem === 'context',
            },
            {
              id: 'plan' as const,
              label: '计划',
              active: selectedWorkItem === 'plan',
            },
            {
              id: 'dag' as const,
              label: '任务',
              active: selectedWorkItem === 'dag',
            },
            {
              id: 'run' as const,
              label: '执行',
              active: selectedWorkItem === 'run',
            },
            {
              id: 'review' as const,
              label: '检查',
              active: selectedWorkItem === 'review',
            },
          ].map(board => (
            <Button
              key={board.id}
              variant={board.active ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => selectWorkItem(board.id)}
              className="h-8 rounded-full px-3"
            >
              {board.label}
            </Button>
          ))}
        </div>
      </div>

      <section
        className={cn(
          'min-h-0 flex-1',
          selectedWorkItem === 'wiki'
            ? 'overflow-y-auto p-4'
            : cn(
                'grid',
                pageScroll
                  ? 'gap-3 p-3 2xl:grid-cols-[minmax(0,1fr)_560px]'
                  : 'grid-rows-[minmax(280px,1fr)_minmax(300px,40vh)] overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_560px] 2xl:grid-rows-1'
              )
        )}
      >
        {selectedWorkItem !== 'wiki' ? (
          <div
            className={cn(
              'row-start-2 min-w-0 overflow-x-hidden p-3 2xl:col-start-1 2xl:row-start-auto',
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
                            onClick={() => selectWorkItem(item.id)}
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
                              <span className="text-text-muted">
                                {selectedWorkItem === item.id ? t('status.current') : '查看'}
                              </span>
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
        ) : null}

        <aside
          className={cn(
            'row-start-1 min-h-0 overflow-x-hidden border-t border-border-subtle bg-bg-subtle/60 p-4 2xl:col-start-2 2xl:row-start-auto 2xl:border-l 2xl:border-t-0',
            pageScroll ? 'overflow-visible pb-4' : 'overflow-y-auto pb-28',
            selectedWorkItem === 'wiki' &&
              'row-auto overflow-visible border-0 bg-transparent p-0 pb-0 2xl:col-auto 2xl:border-0'
          )}
        >
          {selectedWorkItem === 'orchestration' && (
            <DetailPanel title="TEAM" heading="从需求到 PR 的数字研发团队">
              <OrchestrationManualPanel
                plan={activePlan}
                hasPlan={hasPlan}
                approved={approved}
                run={run}
                executionReadiness={executionReadiness}
                runtimeSummary={runtimeSummary}
                skillRuns={orchestrationSkillRuns}
                onCreateRequirement={() => setRequirementDialogOpen(true)}
                onOpenWiki={() => selectWorkItem('wiki')}
                onReviewPlan={() => selectWorkItem('plan')}
                onInspectPrompt={() => selectWorkItem('dag')}
                onRun={() => selectWorkItem('run')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'delivery' && (
            <DetailPanel title="看板" heading="从需求到 PR 的看板">
              <DeliveryBoardOverview
                hasPlan={hasPlan}
                approved={approved}
                run={run}
                plan={activePlan}
                qualityGates={deliveryQualityGates}
                githubRecoveryActions={githubRecoveryActions}
                githubRecoveryDiagnostics={githubRecoveryDiagnostics}
                executionReadiness={executionReadiness}
                selectedExecutor={effectiveSelectedExecutor}
                skillRunCount={orchestrationSkillRuns.length}
                projectProofTaskStatus={latestProjectDispatchProofTask?.status}
                projectProofEvents={projectDispatchProofEvents}
                onCreateRequirement={openRequirementIntake}
                onOpenWiki={() => selectWorkItem('wiki')}
                onReviewPlan={() => selectWorkItem('plan')}
                onInspectPrompt={() => selectWorkItem('dag')}
                onRun={() => selectWorkItem('run')}
                onOpenAgents={openAgentsForCurrentDelivery}
                onReview={() => selectWorkItem('review')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'intake' && (
            <DetailPanel title="IDEA" heading={t('detail.idea.heading')}>
              <RequirementSummaryPanel
                t={t}
                idea={idea}
                effectiveRepoId={effectiveRepoId}
                selectedGitHubRepository={selectedGitHubRepository}
                repositoryReady={repositoryReady}
                selectedAgent={selectedExecutionAgent}
                executionReadiness={executionReadiness}
                hasPlan={hasPlan}
                skillRunCount={orchestrationSkillRuns.length}
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

          {selectedWorkItem === 'wiki' && (
            <DetailPanel title="Wiki" heading="仓库 Wiki">
              <RepoWikiPanel
                repoId={effectiveRepoId.trim()}
                repoProfile={activePlan.repoProfile}
                hasPlan={hasPlan}
                planSource={planSource}
                githubRecoveryActions={githubRecoveryActionsByBoard.wiki}
                onCreateRequirement={openRequirementIntake}
                onReviewPlan={() => selectWorkItem('plan')}
              />
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
                dispatchError={dispatchError}
                executionReadiness={executionReadiness}
                qualityGates={deliveryQualityGates}
                githubRecoveryActions={githubRecoveryActionsByBoard.plan}
                agentOptions={executionAgentOptions}
                selectedExecutor={effectiveSelectedExecutor}
                onDecisionOverrideChange={(key, value) =>
                  setDecisionOverrides(current => ({ ...current, [key]: value }))
                }
                onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
                onExecutorChange={setSelectedExecutor}
                onReviewQualityGates={() => selectWorkItem('review')}
                onInspectPrompt={() => selectWorkItem('dag')}
                onOpenAgents={openAgentsForCurrentDelivery}
                onApprove={approveAndStart}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && !hasPlan && (
            <DetailPanel title="PLAN" heading="暂无项目计划">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                generationError={planGenerationError}
                onCreate={openRequirementIntake}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && hasPlan && (
            <DetailPanel title="PROMPT" heading="PR DAG 和提示词契约">
              <PRDag
                nodes={activePlan.prNodes}
                repositoryId={activePlan.repoProfile.repositoryId}
                repoWikiSummary={activePlan.repoProfile.summary}
                activeSkills={promptActiveSkills}
                skillRuns={orchestrationSkillRuns}
                qualityGates={deliveryQualityGates}
                executionReadiness={executionReadiness}
                selectedExecutor={effectiveSelectedExecutor}
                isCompilingPrompt={compilePrompt.isPending}
                onCompilePrompt={compileNodePrompt}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && !hasPlan && (
            <DetailPanel title="PROMPT" heading="暂无提示词契约">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                generationError={planGenerationError}
                onCreate={openRequirementIntake}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'run' && (
            <DetailPanel title="RUN" heading="执行和 PR 交付">
              <div className="space-y-4">
                <RunSummary progressText={progressText} approved={approved} run={run} />
                {run.status === 'idle' && (
                  <PreDispatchRunGuide
                    plan={activePlan}
                    selectedNodeIds={selectedExecutionNodeIds}
                    executionReadiness={executionReadiness}
                    qualityGates={deliveryQualityGates}
                    githubRecoveryActions={githubRecoveryActionsByBoard.run}
                  />
                )}
                <DispatchProofSeparationPanel
                  run={run}
                  directTaskStatus={latestProjectDispatchProofTask?.status}
                  directTaskEvents={projectDispatchProofEvents}
                  qualityGates={deliveryQualityGates}
                  onRunDirectProof={runProjectDispatchProof}
                  onOpenPlan={() => selectWorkItem('plan')}
                  onOpenReview={() => selectWorkItem('review')}
                  isCreatingDirectProof={createProjectDispatchProofTask.isPending}
                  canRunDirectProof={executionReadiness.canDispatch}
                />
                <ProjectDispatchProofPanel
                  repositoryId={effectiveRepoId.trim()}
                  runtimeId={projectDispatchProofRuntime?.runtimeId}
                  canDispatch={executionReadiness.canDispatch}
                  readinessReason={executionReadiness.reason}
                  task={latestProjectDispatchProofTask}
                  events={projectDispatchProofEvents}
                  isCreating={createProjectDispatchProofTask.isPending}
                  isLoadingEvents={projectDispatchProofEventsQuery.isLoading}
                  error={projectDispatchProofError}
                  onRun={runProjectDispatchProof}
                />
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
                  approved={approved}
                  runtimeId={projectDispatchProofRuntime?.runtimeId}
                  executor={effectiveSelectedExecutor}
                  isCancelling={cancelRun.isPending}
                  onAdvance={advanceRun}
                  onCancel={cancelActiveRun}
                  onExecutionBundle={applyExecutionBundle}
                />
              </div>
            </DetailPanel>
          )}

          {selectedWorkItem === 'review' && (
            <DetailPanel title="REVIEW" heading="评审、失败和人工决策">
              <ReviewBoardPanel
                run={run}
                qualityGates={deliveryQualityGates}
                githubRecoveryActions={githubRecoveryActionsByBoard.review}
                riskAccepted={riskGateAccepted}
                onInspectRun={() => selectWorkItem('run')}
                onInspectPrompt={() => selectWorkItem('dag')}
                onAcceptRisk={() => {
                  setRiskGateAccepted(true);
                  writeRiskGateAccepted(riskGateDecisionKey, true);
                  selectWorkItem('plan');
                }}
              />
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

function OrchestrationManualPanel({
  plan,
  hasPlan,
  approved,
  run,
  executionReadiness,
  runtimeSummary,
  skillRuns,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onInspectPrompt,
  onRun,
}: {
  plan: PlanBundle;
  hasPlan: boolean;
  approved: boolean;
  run: ExecutionRun;
  executionReadiness: ExecutionReadiness;
  runtimeSummary: { online: number; recently_lost: number };
  skillRuns: SpecForgeSkillRunDTO[];
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
}) {
  const deliveredCount = run.tasks.filter(task => isPRNodeDelivered(task.status)).length;
  const activeCount = run.tasks.filter(task => isPRNodeActive(task.status)).length;
  const totalTaskCount = hasPlan ? run.tasks.length || plan.prNodes.length : 0;
  const expertRows = [
    {
      name: '产品专家',
      responsibility: '把 idea 变成 PRD：目标、用户故事、验收标准、非目标。',
      output: hasPlan ? `${plan.productSpec.goals.length} 个目标` : '等待需求输入',
      status: hasPlan ? '已生成' : '待生成',
      icon: Sparkles,
    },
    {
      name: '架构专家',
      responsibility: '结合仓库画像输出技术计划：影响范围、数据/API/UI 变化、风险。',
      output: hasPlan ? `${plan.implementationPlan.affectedAreas.length} 个影响范围` : '等待仓库分析',
      status: hasPlan ? '已生成' : '待生成',
      icon: GitBranch,
    },
    {
      name: 'UI/UX 专家',
      responsibility: '把体验要求压进验收标准和 PR DAG，避免只完成代码不完成产品。',
      output: hasPlan ? '进入每个 PR 节点的 acceptance criteria' : '等待 PRD',
      status: hasPlan ? '已纳入' : '待纳入',
      icon: SquarePen,
    },
    {
      name: 'QA 专家',
      responsibility: '生成测试策略、质量门和失败后的修复/回归要求。',
      output: hasPlan ? `${plan.prNodes.flatMap(node => node.testCommands).length} 条测试命令` : '等待任务拆解',
      status: hasPlan ? '已绑定' : '待绑定',
      icon: ShieldAlert,
    },
  ];
  const flowSteps = [
    {
      label: '1. 需求输入',
      state: plan.idea.trim() ? '有需求' : '待输入',
      detail: plan.idea.trim() || '录入功能需求、问题修复或产品想法。',
      action: onCreateRequirement,
      actionLabel: '录入需求',
    },
    {
      label: '2. Repo Wiki',
      state: plan.repoProfile.source !== 'demo' ? '可引用' : '待确认',
      detail:
        '从仓库生成说明书，提供业务边界、模块入口、测试命令、风险区域和工程约定。',
      action: onOpenWiki,
      actionLabel: '查看 Wiki',
    },
    {
      label: '3. PRD / 计划',
      state: hasPlan ? (approved ? '已审批' : '待评审') : '待生成',
      detail: hasPlan
        ? `${plan.prNodes.length} 个 PR 节点，${plan.prDagReview.length} 条 DAG 审核。`
        : '生成产品计划、技术计划和 PR DAG。',
      action: onReviewPlan,
      actionLabel: '评审计划',
    },
    {
      label: '4. Prompt 契约',
      state: hasPlan ? '可检查' : '无计划',
      detail: '每个任务 prompt 都包含 evidence refs、skill 约束、scope guardrails 和测试契约。',
      action: onInspectPrompt,
      actionLabel: '查看 Prompt',
    },
    {
      label: '5. Coding Agent',
      state: executionReadiness.canDispatch ? 'Codex 可调度' : '等待 runtime',
      detail: executionReadiness.reason,
      action: onRun,
      actionLabel: '查看执行',
    },
    {
      label: '6. 质量与 PR',
      state:
        run.status === 'completed'
          ? '可交付'
          : activeCount > 0
            ? '执行中'
            : deliveredCount > 0
              ? '待评审'
              : '未开始',
      detail: hasPlan
        ? `${deliveredCount}/${totalTaskCount} 个任务已交付，质量门会收集测试、代码审查和风险报告。`
        : '生成计划后，质量门会绑定测试、代码审查、风险报告和 PR 状态。',
      action: onRun,
      actionLabel: '查看交付',
    },
  ];
  const skillStages = skillRuns.length
    ? skillRuns.map(run => ({
        label: skillRunStageLabel(run.stage),
        status: run.status,
        detail: run.output_summary || '已记录一次专家/skill 运行。',
      }))
    : [
        {
          label: '产品计划',
          status: hasPlan ? 'completed' : 'waiting',
          detail: hasPlan ? 'PRD 已生成，等待后台记录 skill run。' : '生成计划后记录产品专家输出。',
        },
        {
          label: '技术计划',
          status: hasPlan ? 'completed' : 'waiting',
          detail: hasPlan ? '技术计划已生成，等待后台记录 skill run。' : '生成计划后记录架构专家输出。',
        },
        {
          label: 'PR DAG',
          status: hasPlan ? 'completed' : 'waiting',
          detail: hasPlan ? '任务拆解已生成，等待后台记录 skill run。' : '拆解任务后记录 DAG 输出。',
        },
      ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">
              CodingCTO = 数字研发团队 + AI 代理 + 自动化质量保障
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              目标是让每个仓库都能从一个想法走到生产级 PR，并且每一步都有证据、范围和质量门。
            </p>
          </div>
          <Badge variant="outline" className={executionReadiness.canDispatch ? 'text-success' : 'text-warning'}>
            {executionReadiness.canDispatch ? 'Codex 可调度' : '等待运行时'}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ManualMetric label="在线 runtime" value={String(runtimeSummary.online)} />
          <ManualMetric label="PR 节点" value={hasPlan ? String(plan.prNodes.length) : '待生成'} />
          <ManualMetric label="运行状态" value={executionRunStatusLabel(run.status)} />
        </div>
      </div>

      <div className="grid gap-3">
        {flowSteps.map((step, index) => (
          <div key={step.label} className="rounded-lg border border-border-subtle bg-bg-surface p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-xs font-medium text-text-main">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium text-text-main">{step.label}</div>
                  <Badge variant="outline" className={manualStatusClassName(step.state)}>
                    {step.state}
                  </Badge>
                </div>
                <p className="mt-1 text-sm leading-6 text-text-muted">{step.detail}</p>
              </div>
              <Button variant="outline" size="sm" onClick={step.action}>
                {step.actionLabel}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <BoardResponsibilityPanel />

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">专家如何协作</div>
        <div className="mt-3 grid gap-2">
          {expertRows.map(row => {
            const Icon = row.icon;
            return (
              <div key={row.name} className="grid gap-3 rounded-md bg-bg-subtle p-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                <div className="flex items-center gap-2 text-sm font-medium text-text-main">
                  <Icon className="h-4 w-4 text-primary" />
                  {row.name}
                </div>
                <div className="min-w-0">
                  <p className="text-sm leading-6 text-text-muted">{row.responsibility}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <Badge variant="outline">{row.status}</Badge>
                    <span className="rounded-full bg-bg-surface px-2 py-1 text-text-muted">
                      {row.output}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <QualityGateManualPanel
        gates={qualityGatesForPlanDelivery(plan, hasPlan, run)}
        onRun={onRun}
      />

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">Skill 到 Prompt 的注入链路</div>
        <div className="mt-3 grid gap-2">
          {[
            ['Skill 管理', '仓库 skill / 项目 skill / runtime skill roots 先成为可追踪约束。'],
            ['专家运行', '产品、架构、UI/UX、QA 阶段把相关 skill 产出记录为 skill run。'],
            ['Prompt 编译', '每个 PR 节点只注入与 executor、仓库和 evidence refs 匹配的约束。'],
            ['Agent 执行', 'Codex 收到的 prompt 包含目标、非目标、预期文件、测试命令和最终报告格式。'],
          ].map(([label, detail]) => (
            <div key={label} className="flex gap-3 rounded-md bg-bg-subtle p-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <div className="text-sm font-medium text-text-main">{label}</div>
                <p className="mt-1 text-sm leading-6 text-text-muted">{detail}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-md border border-border-subtle p-3">
          <div className="text-xs font-medium uppercase text-text-muted">专家 / Skill 运行记录</div>
          <div className="mt-2 space-y-2">
            {skillStages.map(stage => (
              <div key={`${stage.label}-${stage.status}`} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <span className="font-medium text-text-main">{stage.label}</span>
                  <p className="mt-1 leading-5 text-text-muted">{stage.detail}</p>
                </div>
                <Badge variant="outline" className={statusClassName(stage.status)}>
                  {stage.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">Coding Agent Prompt 结构</div>
        <div className="mt-3 space-y-2 text-sm leading-6 text-text-muted">
          <PromptContractLine label="Source of truth" value="idea.raw_input、PRD、技术计划、PR DAG、repo profile、skill refs" />
          <PromptContractLine label="Scope guardrails" value="只允许修改目标仓库和当前 PR 节点范围，不实现 non-goals 或下游节点。" />
          <PromptContractLine label="Quality contract" value="执行测试命令，输出测试结果、风险、证据 refs 和 skills_applied。" />
          <PromptContractLine label="Failure path" value="证据缺失、需求冲突、测试失败时进入 blocked / fix / review_patch，而不是继续猜。" />
        </div>
      </div>
    </div>
  );
}

function ManualMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function GitHubGateRecoveryActions({ actions }: { actions: GitHubReadinessRecoveryAction[] }) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 grid gap-2">
      {actions.map(action => (
        <a
          key={action.id}
          href={action.href}
          className="rounded-md border border-border-subtle bg-bg-surface p-3 text-left transition hover:border-primary/40"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-text-main">{action.label}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
          </span>
          <span className="mt-1 block text-xs leading-5 text-text-muted">
            {action.description}
          </span>
        </a>
      ))}
    </div>
  );
}

function BoardResponsibilityPanel() {
  const boards = [
    {
      name: '看板',
      owner: '需求、计划、Prompt、执行、PR 交付',
      rule: '凡是会改变交付状态、触发 Codex 或影响 PR 的动作，都在这里完成。',
    },
    {
      name: 'Wiki 看板',
      owner: '仓库说明书、专家上下文、Prompt 证据',
      rule: '通过 repo 生成 Wiki，把业务边界、模块入口、测试命令和风险交给产品/架构专家写计划。',
    },
    {
      name: 'Agents 页',
      owner: 'runtime、CLI 能力、健康、Skill 绑定',
      rule: '只回答“能不能被调度”，不承载业务任务输入和队列执行。',
    },
    {
      name: '评审看板',
      owner: 'CI 失败、PR 评审、review_patch、人工决策',
      rule: '凡是执行后需要判断、修复、升级的问题，都进入评审看板。',
    },
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="text-sm font-medium text-text-main">看板分工</div>
      <div className="mt-3 grid gap-2">
        {boards.map(board => (
          <div key={board.name} className="rounded-md bg-bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{board.name}</div>
              <Badge variant="outline">{board.owner}</Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{board.rule}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityGateManualPanel({
  gates,
  githubRecoveryActions = [],
  onRun,
}: {
  gates: QualityGateSummary[];
  githubRecoveryActions?: GitHubReadinessRecoveryAction[];
  onRun: () => void;
}) {
  const readyCount = gates.filter(gate => gate.state === 'ready').length;
  const blockedCount = gates.filter(gate => gate.state === 'blocked').length;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">自动化质量保障</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            每个 PR 节点执行前后都要过这些门：范围、测试、PR、审查、风险和失败恢复。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={readyCount === gates.length ? 'text-success' : 'text-text-muted'}>
            {readyCount}/{gates.length} 就绪
          </Badge>
          {blockedCount > 0 ? (
            <Badge variant="outline" className="text-error">
              {blockedCount} 阻塞
            </Badge>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {gates.map(gate => (
          <div key={gate.id} className="rounded-md bg-bg-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{gate.label}</div>
              <Badge variant="outline" className={qualityGateStateClassName(gate.state)}>
                {qualityGateStateLabel(gate.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{gate.detail}</p>
            {gate.id === 'github' && gate.state === 'blocked' && githubRecoveryActions.length > 0 ? (
              <GitHubGateRecoveryActions actions={githubRecoveryActions} />
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="outline" size="sm" onClick={onRun}>
          查看执行与 PR
        </Button>
      </div>
    </div>
  );
}

function DeliveryBoardOverview({
  hasPlan,
  approved,
  run,
  plan,
  qualityGates,
  githubRecoveryActions,
  githubRecoveryDiagnostics,
  executionReadiness,
  selectedExecutor,
  skillRunCount,
  projectProofTaskStatus,
  projectProofEvents,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onInspectPrompt,
  onRun,
  onOpenAgents,
  onReview,
}: {
  hasPlan: boolean;
  approved: boolean;
  run: ExecutionRun;
  plan: PlanBundle;
  qualityGates: QualityGateSummary[];
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  githubRecoveryDiagnostics: GitHubReadinessRecoveryDiagnostic[];
  executionReadiness: ExecutionReadiness;
  selectedExecutor: string;
  skillRunCount: number;
  projectProofTaskStatus?: string;
  projectProofEvents: Array<{ seq: number; type: string; output?: string }>;
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
  onOpenAgents: () => void;
  onReview: () => void;
}) {
  const summary = summarizeDeliveryRun(run);
  const blockedGates = qualityGates.filter(gate => gate.state === 'blocked');
  const waitingGates = qualityGates.filter(gate => gate.state === 'waiting');
  const nextBlocked = nextBlockedNode(run.tasks);
  const nextReviewable = nextReviewableNode(run.tasks);
  const promptReady = hasPlan && plan.prNodes.length > 0;
  const wikiContext = repoWikiPlanningContext(plan.repoProfile);
  const repoWikiReady = wikiContext.state !== 'blocked';
  const runStarted = run.status !== 'idle' && run.tasks.length > 0;
  const workflow = deliveryWorkflowSummary({
    plan,
    hasPlan,
    approved,
    run,
    executionReadiness,
    qualityGates,
    skillRunCount,
  });
  const evidenceLedger = deliveryEvidenceLedger({
    plan,
    hasPlan,
    approved,
    run,
    wikiScorePercent: wikiContext.scorePercent,
    skillRunCount,
    executionReadiness,
    projectProofTaskStatus,
    projectProofEvents,
  });
  const dispatchBlocked =
    !hasPlan || !approved || !executionReadiness.canDispatch || blockedGates.length > 0;

  const stages = [
    {
      id: 'intake',
      label: '需求',
      state: hasPlan ? 'ready' : 'waiting',
      detail: hasPlan ? '需求已经生成 PRD、技术方案和 PR DAG。' : '先录入 idea，交给专家生成计划。',
      action: hasPlan ? '更新需求' : '新建需求',
      onClick: onCreateRequirement,
    },
    {
      id: 'wiki',
      label: 'Repo Wiki',
      state: repoWikiReady ? wikiContext.state : hasPlan ? 'blocked' : 'waiting',
      detail: repoWikiReady
        ? `仓库说明书完整度 ${wikiContext.scorePercent}%，可作为专家写 PRD、技术计划和 Prompt 的证据来源。`
        : '从 repo 生成 Wiki，让专家先理解现有系统、入口、测试和风险。',
      action: repoWikiReady ? '查看 Wiki' : '生成 Wiki',
      onClick: onOpenWiki,
    },
    {
      id: 'plan',
      label: '计划',
      state: !hasPlan ? 'waiting' : repoWikiReady && approved ? 'ready' : 'blocked',
      detail: !hasPlan
        ? '等待产品、架构、UI/UX 和 QA 专家输出计划。'
        : !repoWikiReady
          ? '计划缺少 Repo Wiki 证据，先生成仓库说明书再确认专家输出。'
        : approved
          ? `${plan.prNodes.length} 个 PR 节点已审批。`
          : '计划需要人工确认范围、任务顺序和执行智能体。',
      action: approved ? '查看计划' : '评审计划',
      onClick: onReviewPlan,
    },
    {
      id: 'prompt',
      label: 'Prompt',
      state: promptReady ? 'ready' : 'waiting',
      detail: promptReady
        ? `${plan.prNodes.length} 个节点具备目标、约束、测试和 Skill 证据。`
        : '生成计划后才会形成 Coding Agent Prompt 契约。',
      action: '检查 Prompt',
      onClick: onInspectPrompt,
    },
    {
      id: 'dispatch',
      label: '调度',
      state: dispatchBlocked ? 'blocked' : runStarted ? 'ready' : 'waiting',
      detail: dispatchBlocked
        ? !executionReadiness.canDispatch
          ? executionReadiness.reason
          : blockedGates.length > 0
            ? `${blockedGates.length} 个质量门需要处理后才能调度。`
            : '审批计划后才能启动本地 Codex。'
        : runStarted
          ? summary.headline
          : '可以从计划页审批并启动 Codex CLI。',
      action: runStarted
        ? '看执行'
        : !executionReadiness.canDispatch
          ? '打开智能体'
          : blockedGates.length > 0
            ? '处理质量'
            : approved
              ? '去启动'
              : '评审计划',
      onClick: runStarted
        ? onRun
        : !executionReadiness.canDispatch
          ? onOpenAgents
          : blockedGates.length > 0
            ? onReview
            : onReviewPlan,
    },
    {
      id: 'review',
      label: '评审',
      state: nextBlocked ? 'blocked' : nextReviewable ? 'ready' : waitingGates.length ? 'waiting' : 'ready',
      detail: nextBlocked
        ? `${nextBlocked.nodeKey} 需要修复或人工决策。`
        : nextReviewable
          ? `${nextReviewable.nodeKey} 可以进入 PR 评审。`
          : waitingGates.length
            ? `${waitingGates.length} 个质量门等待 PR、CI 或审查结果。`
            : '暂无需要人工处理的失败或 PR 评审。',
      action: '去评审',
      onClick: onReview,
    },
  ] satisfies Array<{
    id: string;
    label: string;
    state: QualityGateState;
    detail: string;
    action: string;
    onClick: () => void;
  }>;

  return (
    <div className="space-y-4">
      <DeliveryWorkflowNavigator
        workflow={workflow}
        onCreateRequirement={onCreateRequirement}
        onOpenWiki={onOpenWiki}
        onReviewPlan={onReviewPlan}
        onInspectPrompt={onInspectPrompt}
        onRun={onRun}
        onReview={onReview}
      />

      <DeliveryBoardMap
        hasPlan={hasPlan}
        wikiState={wikiContext.state}
        approved={approved}
        promptReady={promptReady}
        run={run}
        blockedGateCount={blockedGates.length}
        onCreateRequirement={onCreateRequirement}
        onOpenWiki={onOpenWiki}
        onReviewPlan={onReviewPlan}
        onInspectPrompt={onInspectPrompt}
        onRun={onRun}
        onReview={onReview}
      />

      <DeliveryProgressBus
        workflow={workflow}
        onCreateRequirement={onCreateRequirement}
        onOpenWiki={onOpenWiki}
        onReviewPlan={onReviewPlan}
        onInspectPrompt={onInspectPrompt}
        onRun={onRun}
        onReview={onReview}
      />

      <FormalDispatchUnlockChecklist
        hasPlan={hasPlan}
        wikiContext={wikiContext}
        approved={approved}
        executionReadiness={executionReadiness}
        qualityGates={qualityGates}
        githubRecoveryDiagnostics={githubRecoveryDiagnostics}
        runStarted={runStarted}
        onCreateRequirement={onCreateRequirement}
        onOpenWiki={onOpenWiki}
        onReviewPlan={onReviewPlan}
        onOpenAgents={onOpenAgents}
        onReview={onReview}
        onRun={onRun}
      />

      <DeliveryEvidenceLedgerPanel ledger={evidenceLedger} onRun={onRun} onReview={onReview} />

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">当前交付状态</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">{summary.headline}</p>
          </div>
          <Badge
            variant="outline"
            className={
              blockedGates.length || nextBlocked
                ? 'text-warning'
                : runStarted
                  ? 'text-success'
                  : 'text-text-muted'
            }
          >
            {blockedGates.length || nextBlocked ? '需要决策' : runStarted ? '执行中' : '未启动'}
          </Badge>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${summary.progressPercent}%` }}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <ManualMetric label="PR 节点" value={`${summary.ready}/${summary.total}`} />
          <ManualMetric label="执行中" value={String(summary.active)} />
          <ManualMetric label="阻塞" value={String(summary.blocked + summary.failed)} />
          <ManualMetric label="Skill 证据" value={String(skillRunCount)} />
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-md bg-bg-subtle p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-text-main">下一步</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">{summary.nextAction}</p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={nextBlocked || blockedGates.length ? onReview : hasPlan ? onReviewPlan : onCreateRequirement}
          >
            {nextBlocked || blockedGates.length ? '处理阻塞' : hasPlan ? '评审计划' : '新建需求'}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {stages.map(stage => (
          <div key={stage.id} className="rounded-lg border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-text-main">{stage.label}</div>
                <p className="mt-1 text-sm leading-6 text-text-muted">{stage.detail}</p>
              </div>
              <Badge variant="outline" className={qualityGateStateClassName(stage.state)}>
                {qualityGateStateLabel(stage.state)}
              </Badge>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={stage.onClick}>
                {stage.action}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!executionReadiness.canDispatch ? (
        <RuntimeBlockerPanel
          reason={executionReadiness.reason}
          selectedExecutor={selectedExecutor}
          onOpenAgents={onOpenAgents}
        />
      ) : null}

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">检查项</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              看板只允许在证据、Wiki、测试、风险和恢复路径清楚时调度 Codex。Wiki 当前完整度 {wikiContext.scorePercent}%。
            </p>
          </div>
          <Badge variant="outline" className={blockedGates.length ? 'text-error' : 'text-success'}>
            {blockedGates.length ? `${blockedGates.length} 个需处理` : '可继续'}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {qualityGates.map(gate => (
            <div key={gate.id} className="rounded-md bg-bg-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-text-main">{gate.label}</div>
                <Badge variant="outline" className={qualityGateStateClassName(gate.state)}>
                  {qualityGateStateLabel(gate.state)}
                </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{gate.detail}</p>
            {gate.id === 'github' && gate.state === 'blocked' && githubRecoveryActions.length > 0 ? (
              <GitHubGateRecoveryActions actions={githubRecoveryActions} />
            ) : null}
          </div>
        ))}
      </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">页面职责</div>
        <div className="mt-3 grid gap-2">
          <ProcessRouteLine
            label="Agents"
            value="只管理 runtime、CLI 能力、仓库绑定和 Skill 分配。"
            action="看执行"
            onClick={onRun}
          />
          <ProcessRouteLine
            label="Wiki 板"
            value="从 repo 生成仓库说明书，给产品专家、架构专家、QA 和 Coding Agent 提供计划上下文。"
            action="查看 Wiki"
            onClick={onOpenWiki}
          />
          <ProcessRouteLine
            label="看板"
            value="管理需求、计划、Prompt、调度启动、PR 状态和下一步。"
            action="留在看板"
            onClick={() => undefined}
          />
          <ProcessRouteLine
            label="检查"
            value="处理检查项、CI 失败、review patch、失败恢复和人工决策。"
            action="看检查"
            onClick={onReview}
          />
        </div>
      </div>

      <DeliveryKanbanBoard
        plan={plan}
        run={run}
        wikiContext={wikiContext}
        onOpenWiki={onOpenWiki}
        onInspectPrompt={onInspectPrompt}
        onRun={onRun}
        onReview={onReview}
      />
    </div>
  );
}

function DeliveryWorkflowNavigator({
  workflow,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onInspectPrompt,
  onRun,
  onReview,
}: {
  workflow: ReturnType<typeof deliveryWorkflowSummary>;
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
  onReview: () => void;
}) {
  const actionByStep: Record<string, { label: string; onClick: () => void }> = {
    idea: { label: '录入需求', onClick: onCreateRequirement },
    wiki: { label: '查看 Wiki', onClick: onOpenWiki },
    plan: { label: '评审计划', onClick: onReviewPlan },
    prompt: { label: '检查 Prompt', onClick: onInspectPrompt },
    runtime: { label: '看执行器', onClick: onRun },
    quality: { label: '处理检查项', onClick: onReview },
    dispatch: { label: '看执行', onClick: onRun },
    review: { label: '去评审', onClick: onReview },
  };
  const currentAction = actionByStep[workflow.currentStepId] ?? actionByStep.idea;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">交付路径</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {workflow.headline}。{workflow.nextAction}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={workflow.blockedReasons.length ? 'text-warning' : 'text-success'}
          >
            {workflow.readyCount}/{workflow.totalCount} 就绪
          </Badge>
          <Button type="button" size="sm" onClick={currentAction.onClick}>
            {currentAction.label}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
      {workflow.blockedReasons.length ? (
        <div className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
          {workflow.blockedReasons[0]}
        </div>
      ) : null}
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[980px] grid-cols-8 gap-2">
          {workflow.steps.map(step => (
            <button
              key={step.id}
              type="button"
              onClick={(actionByStep[step.id] ?? currentAction).onClick}
              className={cn(
                'rounded-md border px-3 py-2 text-left transition hover:border-primary/40',
                step.state === 'blocked'
                  ? 'border-warning/40 bg-warning-subtle'
                  : step.state === 'active'
                    ? 'border-info/40 bg-info-subtle'
                    : step.state === 'ready'
                      ? 'border-success/30 bg-success-subtle'
                      : 'border-border-subtle bg-bg-subtle'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-text-main">{step.label}</span>
                <span className="text-[11px] text-text-muted">{deliveryWorkflowStateLabel(step.state)}</span>
              </div>
              <div className="mt-1 truncate text-[11px] text-text-muted">{step.evidence}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function deliveryWorkflowStateLabel(state: 'ready' | 'waiting' | 'blocked' | 'active') {
  switch (state) {
    case 'ready':
      return '就绪';
    case 'blocked':
      return '阻塞';
    case 'active':
      return '进行中';
    default:
      return '等待';
  }
}

function deliveryWorkflowStateClassName(state: 'ready' | 'waiting' | 'blocked' | 'active') {
  switch (state) {
    case 'ready':
      return 'border-success/30 bg-success-subtle text-success';
    case 'blocked':
      return 'border-warning/40 bg-warning-subtle text-warning';
    case 'active':
      return 'border-info/40 bg-info-subtle text-info';
    default:
      return 'border-border-subtle bg-bg-subtle text-text-muted';
  }
}

function DeliveryProgressBus({
  workflow,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onInspectPrompt,
  onRun,
  onReview,
}: {
  workflow: ReturnType<typeof deliveryWorkflowSummary>;
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
  onReview: () => void;
}) {
  const actionByStep: Record<string, { label: string; onClick: () => void }> = {
    idea: { label: '补需求', onClick: onCreateRequirement },
    wiki: { label: '看 Wiki', onClick: onOpenWiki },
    plan: { label: '审计划', onClick: onReviewPlan },
    prompt: { label: '查 Prompt', onClick: onInspectPrompt },
    runtime: { label: '看 Agent', onClick: onRun },
    quality: { label: '处理质量', onClick: onReview },
    dispatch: { label: '看执行', onClick: onRun },
    review: { label: '去评审', onClick: onReview },
  };
  const currentAction = actionByStep[workflow.currentStepId] ?? actionByStep.idea;
  const counts = workflow.steps.reduce(
    (next, step) => ({ ...next, [step.state]: next[step.state] + 1 }),
    { active: 0, blocked: 0, ready: 0, waiting: 0 }
  );
  const progressPercent = Math.round((workflow.readyCount / workflow.totalCount) * 100);

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">任务进度总线</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            用同一套状态读所有看板：就绪代表证据充分，进行中代表 Codex 或交付动作正在发生，阻塞代表必须先决策。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={workflow.blockedReasons.length ? 'text-warning' : 'text-success'}>
            {workflow.readyCount}/{workflow.totalCount} 就绪
          </Badge>
          <Button type="button" size="sm" onClick={currentAction.onClick}>
            {currentAction.label}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualMetric label="就绪" value={String(counts.ready)} />
        <ManualMetric label="进行中" value={String(counts.active)} />
        <ManualMetric label="阻塞" value={String(counts.blocked)} />
        <ManualMetric label="等待" value={String(counts.waiting)} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 text-xs text-text-muted">
          <span>Idea</span>
          <span>{workflow.currentStepLabel}</span>
          <span>PR</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              workflow.blockedReasons.length ? 'bg-warning' : 'bg-primary'
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[1080px] grid-cols-8 gap-2">
          {workflow.steps.map((step, index) => {
            const action = actionByStep[step.id] ?? currentAction;
            const active = step.id === workflow.currentStepId;
            return (
              <button
                key={step.id}
                type="button"
                onClick={action.onClick}
                className={cn(
                  'rounded-md border p-3 text-left transition hover:border-primary/50',
                  deliveryWorkflowStateClassName(step.state),
                  active ? 'ring-2 ring-primary/30' : ''
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <Badge variant="outline" className="bg-bg-surface/60">
                    {deliveryWorkflowStateLabel(step.state)}
                  </Badge>
                </div>
                <div className="mt-2 text-sm font-medium text-text-main">{step.label}</div>
                <div className="mt-1 truncate text-xs text-text-muted">{step.owner}</div>
                <div className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">
                  {step.evidence}
                </div>
                <div className="mt-3 text-xs font-medium text-primary">{action.label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {workflow.blockedReasons.length ? (
        <div className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
          {workflow.blockedReasons[0]}
        </div>
      ) : (
        <div className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
          {workflow.nextAction}
        </div>
      )}
    </section>
  );
}

function FormalDispatchUnlockChecklist({
  hasPlan,
  wikiContext,
  approved,
  executionReadiness,
  qualityGates,
  githubRecoveryDiagnostics,
  runStarted,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onOpenAgents,
  onReview,
  onRun,
}: {
  hasPlan: boolean;
  wikiContext: RepoWikiPlanningContextSummary;
  approved: boolean;
  executionReadiness: ExecutionReadiness;
  qualityGates: QualityGateSummary[];
  githubRecoveryDiagnostics: GitHubReadinessRecoveryDiagnostic[];
  runStarted: boolean;
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onOpenAgents: () => void;
  onReview: () => void;
  onRun: () => void;
}) {
  const blockedQualityGates = qualityGates.filter(gate => gate.state === 'blocked');
  const waitingQualityGates = qualityGates.filter(gate => gate.state === 'waiting');
  const githubDiagnosticText = githubRecoveryDiagnostics
    .map(diagnostic => `${diagnostic.setupStep}: ${diagnostic.detail}`)
    .join(' ');
  const wikiUsable = wikiContext.state !== 'blocked';
  const items = [
    {
      id: 'plan',
      label: '需求和 PRD',
      state: hasPlan ? 'ready' : 'waiting',
      detail: hasPlan ? '需求已生成计划和 PR DAG。' : '先录入需求，让专家生成 PRD、技术计划和 PR DAG。',
      action: hasPlan ? '更新需求' : '新建需求',
      onClick: onCreateRequirement,
    },
    {
      id: 'wiki',
      label: 'Repo Wiki 证据',
      state: wikiUsable ? wikiContext.state : 'blocked',
      detail: `${wikiContext.readyCount}/${wikiContext.totalCount} 项可用，完整度 ${wikiContext.scorePercent}%。${wikiContext.nextAction}`,
      action: '查看 Wiki',
      onClick: onOpenWiki,
    },
    {
      id: 'approval',
      label: '专家计划审批',
      state: !hasPlan ? 'waiting' : approved ? 'ready' : 'blocked',
      detail: approved ? 'PR DAG、范围、风险和任务顺序已确认。' : '需要人工确认专家输出，再允许正式启动 Codex。',
      action: approved ? '查看计划' : '评审计划',
      onClick: onReviewPlan,
    },
    {
      id: 'runtime',
      label: 'Codex CLI 运行器',
      state: executionReadiness.canDispatch ? 'ready' : 'blocked',
      detail: executionReadiness.canDispatch
        ? `${executionReadiness.healthyRuntimeCount} 个可写 runtime 可领取任务。`
        : executionReadiness.reason,
      action: executionReadiness.canDispatch ? '看执行' : '打开智能体',
      onClick: executionReadiness.canDispatch ? onRun : onOpenAgents,
    },
    {
      id: 'quality',
      label: '质量门',
      state: blockedQualityGates.length > 0 ? 'blocked' : 'ready',
      detail:
        blockedQualityGates.length > 0
          ? `阻塞：${blockedQualityGates.map(gate => gate.label).join('、')}。${githubDiagnosticText}`
          : waitingQualityGates.length > 0
            ? `可启动；${waitingQualityGates.length} 个门会在 PR/CI 后继续跟踪。`
            : '范围、Wiki、测试、GitHub、风险和恢复门已可继续。',
      action: blockedQualityGates.length > 0 ? '处理质量门' : '查看质量',
      onClick: onReview,
    },
  ] satisfies Array<{
    id: string;
    label: string;
    state: QualityGateState;
    detail: string;
    action: string;
    onClick: () => void;
  }>;
  const firstBlocked = items.find(item => item.state === 'blocked');
  const firstWaiting = items.find(item => item.state === 'waiting');
  const nextItem = firstBlocked ?? firstWaiting;
  const canDispatch = !nextItem;
  const primaryAction = runStarted
    ? { label: '查看执行进度', onClick: onRun }
    : canDispatch
      ? { label: '审批并启动', onClick: onReviewPlan }
      : { label: nextItem.action, onClick: nextItem.onClick };

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">正式派发解锁清单</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            只有这些条件都通过，平台才应该把 PR 节点正式交给本地 Codex CLI 执行并回收 PR 证据。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={canDispatch ? 'text-success' : firstBlocked ? 'text-warning' : 'text-info'}
          >
            {canDispatch ? '可正式派发' : firstBlocked ? '需要处理' : '等待补齐'}
          </Badge>
          <Button type="button" size="sm" onClick={primaryAction.onClick}>
            {primaryAction.label}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-left transition hover:border-primary/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{item.label}</div>
              <Badge variant="outline" className={qualityGateStateClassName(item.state)}>
                {qualityGateStateLabel(item.state)}
              </Badge>
            </div>
            <p className="mt-2 line-clamp-4 text-xs leading-5 text-text-muted">{item.detail}</p>
            <div className="mt-3 text-xs font-medium text-primary">{item.action}</div>
          </button>
        ))}
      </div>
    </section>
  );
}

function DeliveryBoardMap({
  hasPlan,
  wikiState,
  approved,
  promptReady,
  run,
  blockedGateCount,
  onCreateRequirement,
  onOpenWiki,
  onReviewPlan,
  onInspectPrompt,
  onRun,
  onReview,
}: {
  hasPlan: boolean;
  wikiState: QualityGateState;
  approved: boolean;
  promptReady: boolean;
  run: ExecutionRun;
  blockedGateCount: number;
  onCreateRequirement: () => void;
  onOpenWiki: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
  onReview: () => void;
}) {
  const runStarted = run.status !== 'idle' && run.tasks.length > 0;
  const boards = [
    {
      id: 'intake',
      title: '需求看板',
      detail: '收集 idea、问题修复或产品想法，生成 PRD 和计划输入。',
      state: hasPlan ? 'ready' : 'waiting',
      action: hasPlan ? '更新需求' : '新建需求',
      onClick: onCreateRequirement,
    },
    {
      id: 'wiki',
      title: 'Wiki 看板',
      detail: '从 repo 生成仓库知识库，给产品、架构、QA 和 Codex Prompt 使用。',
      state: wikiState,
      action: '查看 Wiki',
      onClick: onOpenWiki,
    },
    {
      id: 'plan',
      title: '计划看板',
      detail: '评审专家输出、PR DAG、任务范围、依赖顺序和审批状态。',
      state: !hasPlan ? 'waiting' : approved ? 'ready' : 'blocked',
      action: approved ? '查看计划' : '评审计划',
      onClick: onReviewPlan,
    },
    {
      id: 'prompt',
      title: 'Prompt 看板',
      detail: '检查 Repo Wiki、Skill、专家记录、质量门是否进入每个 PR 节点 Prompt。',
      state: promptReady ? 'ready' : 'waiting',
      action: '检查 Prompt',
      onClick: onInspectPrompt,
    },
    {
      id: 'run',
      title: '执行看板',
      detail: '观看 Codex 任务从待派发、runtime claim、执行中到 PR/CI 的流转。',
      state: runStarted ? 'ready' : hasPlan ? 'waiting' : 'blocked',
      action: '看执行',
      onClick: onRun,
    },
    {
      id: 'quality',
      title: '质量看板',
      detail: '集中处理 GitHub 门、CI 失败、自动修复、review patch 和人工决策。',
      state: blockedGateCount > 0 ? 'blocked' : 'ready',
      action: '处理质量',
      onClick: onReview,
    },
  ] satisfies Array<{
    id: string;
    title: string;
    detail: string;
    state: QualityGateState;
    action: string;
    onClick: () => void;
  }>;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">看板地图</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            每个看板只负责一个决策面：先补上下文，再审计划，再检查 Prompt，最后看执行和质量。
          </p>
        </div>
        <Badge variant="outline">Idea → PR</Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {boards.map(board => (
          <button
            key={board.id}
            type="button"
            onClick={board.onClick}
            className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-left transition-colors hover:border-primary/50"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{board.title}</div>
              <Badge variant="outline" className={qualityGateStateClassName(board.state)}>
                {qualityGateStateLabel(board.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{board.detail}</p>
            <div className="mt-3 text-xs font-medium text-primary">{board.action}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function DeliveryEvidenceLedgerPanel({
  ledger,
  onRun,
  onReview,
}: {
  ledger: ReturnType<typeof deliveryEvidenceLedger>;
  onRun: () => void;
  onReview: () => void;
}) {
  const needsPRDelivery = ledger.items.some(item => item.id === 'pr-delivery' && item.state !== 'proven');

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">端到端证据账本</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {ledger.headline} {ledger.nextGap}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={ledger.completionAudit.complete ? 'text-success' : 'text-info'}
          >
            {ledger.provenCount}/{ledger.totalCount} 已证明
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={needsPRDelivery ? onRun : onReview}>
            {needsPRDelivery ? '看执行证据' : '去评审'}
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-text-main">完成审计</div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {ledger.completionAudit.summary}
            </p>
          </div>
          <Badge
            variant="outline"
            className={ledger.completionAudit.complete ? 'text-success' : 'text-warning'}
          >
            {ledger.completionAudit.complete ? '可声明完成' : '不能声明完成'}
          </Badge>
        </div>
        {!ledger.completionAudit.complete ? (
          <div className="mt-2 grid gap-2 sm:grid-cols-[120px_120px_minmax(0,1fr)]">
            <ManualMetric label="缺失证据" value={String(ledger.completionAudit.missingProofCount)} />
            <ManualMetric label="部分证据" value={String(ledger.completionAudit.partialProofCount)} />
            <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2">
              <div className="text-xs text-text-muted">下一条证明</div>
              <div className="mt-1 text-sm font-medium leading-5 text-text-main">
                {ledger.completionAudit.nextRequiredProof}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {ledger.items.map(item => (
          <div key={item.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-text-main">{item.label}</div>
                <p className="mt-1 text-xs leading-5 text-text-muted">{item.evidence}</p>
              </div>
              <Badge variant="outline" className={deliveryEvidenceStateClassName(item.state)}>
                {deliveryEvidenceStateLabel(item.state)}
              </Badge>
            </div>
            {item.state !== 'proven' ? (
              <div className="mt-2 text-xs leading-5 text-text-muted">{item.nextAction}</div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function deliveryEvidenceStateLabel(state: DeliveryEvidenceState) {
  switch (state) {
    case 'proven':
      return '已证明';
    case 'partial':
      return '部分';
    default:
      return '缺失';
  }
}

function deliveryEvidenceStateClassName(state: DeliveryEvidenceState) {
  switch (state) {
    case 'proven':
      return 'text-success';
    case 'partial':
      return 'text-info';
    default:
      return 'text-text-muted';
  }
}

function DeliveryKanbanBoard({
  plan,
  run,
  wikiContext,
  onOpenWiki,
  onInspectPrompt,
  onRun,
  onReview,
}: {
  plan: PlanBundle;
  run: ExecutionRun;
  wikiContext: RepoWikiPlanningContextSummary;
  onOpenWiki: () => void;
  onInspectPrompt: () => void;
  onRun: () => void;
  onReview: () => void;
}) {
  const nodes = run.tasks.length ? run.tasks : plan.prNodes;
  const lanes = [
    {
      id: 'planned',
      title: '待计划确认',
      description: '需要 Wiki、专家计划和 Prompt 契约确认。',
      empty: '没有等待计划确认的节点。',
      tasks: nodes.filter(node =>
        ['planned', 'waiting_on_dependencies', 'queued'].includes(node.status)
      ),
      action: '检查 Prompt',
      onAction: onInspectPrompt,
    },
    {
      id: 'executing',
      title: 'Codex 执行中',
      description: '已派发给 runtime，关注日志、事件和失败恢复。',
      empty: '没有正在执行的节点。',
      tasks: nodes.filter(node => ['running'].includes(node.status)),
      action: '看执行',
      onAction: onRun,
    },
    {
      id: 'review',
      title: 'PR / CI 评审',
      description: 'PR 已创建或 CI 运行中，进入评审与修复循环。',
      empty: '没有待评审的 PR 节点。',
      tasks: nodes.filter(node =>
        ['pr_opened', 'ci_running', 'ready_for_review'].includes(node.status)
      ),
      action: '去评审',
      onAction: onReview,
    },
    {
      id: 'blocked',
      title: '阻塞 / 失败',
      description: '需要人工决策、fix attempt 或重新调度。',
      empty: '没有阻塞节点。',
      tasks: nodes.filter(node =>
        ['blocked', 'failed', 'cancelled', 'closed'].includes(node.status)
      ),
      action: '处理',
      onAction: onReview,
    },
    {
      id: 'done',
      title: '已交付',
      description: '已完成、已合并或进入可交付状态。',
      empty: '还没有完成的节点。',
      tasks: nodes.filter(node => ['completed', 'merged'].includes(node.status)),
      action: '看执行',
      onAction: onRun,
    },
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">PR 节点 Kanban</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            看板按 PR 节点流转，不按专家或 CLI 分组。Wiki 负责给每张卡提供仓库事实，Prompt 负责把计划、Skill 和质量门交给 Codex。
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onOpenWiki}>
          查看 Wiki 证据
          <BookOpen className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <ManualMetric label="Wiki 完整度" value={`${wikiContext.scorePercent}%`} />
        <ManualMetric label="PR 节点" value={String(nodes.length)} />
        <ManualMetric
          label="测试命令"
          value={String(nodes.reduce((count, node) => count + node.testCommands.length, 0))}
        />
        <ManualMetric
          label="预期文件"
          value={String(nodes.reduce((count, node) => count + node.expectedFiles.length, 0))}
        />
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="grid min-w-[1180px] grid-cols-5 gap-3">
          {lanes.map(lane => (
            <div key={lane.id} className="rounded-lg bg-bg-subtle p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-text-main">{lane.title}</div>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{lane.description}</p>
                </div>
                <Badge variant="outline">{lane.tasks.length}</Badge>
              </div>
              <div className="mt-3 space-y-2">
                {lane.tasks.length ? (
                  lane.tasks.map(node => (
                    <DeliveryKanbanCard
                      key={node.id}
                      node={node}
                      wikiContext={wikiContext}
                      action={lane.action}
                      onAction={lane.onAction}
                    />
                  ))
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border-subtle px-3 text-center text-xs leading-5 text-text-muted">
                    {lane.empty}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DeliveryKanbanCard({
  node,
  wikiContext,
  action,
  onAction,
}: {
  node: PRNode;
  wikiContext: RepoWikiPlanningContextSummary;
  action: string;
  onAction: () => void;
}) {
  const evidence = [
    node.expectedFiles.length ? `${node.expectedFiles.length} 文件` : '待定文件',
    node.testCommands.length ? `${node.testCommands.length} 测试` : '待补测试',
    node.acceptanceCriteria.length ? `${node.acceptanceCriteria.length} 验收` : '待补验收',
  ];

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs text-text-muted">{node.nodeKey}</div>
          <div className="mt-1 text-sm font-medium leading-5 text-text-main break-words">
            {node.title}
          </div>
        </div>
        <Badge variant="outline" className={statusClassName(node.status)}>
          {statusLabel[node.status]}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-3 text-xs leading-5 text-text-muted">{node.goal}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-text-subtle">
          Wiki {wikiContext.scorePercent}%
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-text-subtle">
          {node.executor || 'Codex'}
        </span>
        <span className="rounded-full bg-muted px-2 py-1 text-xs text-text-subtle">
          风险 {node.estimatedRisk}
        </span>
      </div>
      <div className="mt-3 space-y-1 text-xs leading-5 text-text-muted">
        {evidence.map(item => (
          <div key={item}>{item}</div>
        ))}
      </div>
      {node.failureReason ? (
        <div className="mt-2 rounded bg-error-subtle px-2 py-1 text-xs leading-5 text-error">
          {node.failureReason}
        </div>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onAction}>
          {action}
        </Button>
      </div>
    </div>
  );
}

function RepoWikiPanel({
  repoId,
  repoProfile,
  hasPlan,
  planSource,
  githubRecoveryActions,
  onCreateRequirement,
  onReviewPlan,
}: {
  repoId: string;
  repoProfile: RepoProfile;
  hasPlan: boolean;
  planSource: 'api' | 'demo' | 'empty';
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  onCreateRequirement: () => void;
  onReviewPlan: () => void;
}) {
  const architectureQuery = useRepoArchitectureStatus(repoId);
  const reindexArchitecture = useReindexRepoArchitecture(repoId);
  const [wikiGenerationError, setWikiGenerationError] = useState('');
  const snapshot = architectureQuery.data?.snapshot;
  const staleReasons = architectureQuery.data?.stale_reasons ?? [];
  const isOffline = architectureQuery.isError;
  const wikiReady = Boolean(snapshot) || repoProfile.source !== 'demo';
  const modules = snapshot?.modules.length ? snapshot.modules : repoProfile.stack;
  const testCommands = snapshot?.test_commands.length
    ? snapshot.test_commands
    : repoProfile.testCommands;
  const riskAreas = snapshot?.risk_areas.length ? snapshot.risk_areas : repoProfile.riskAreas;
  const entrypoints = snapshot?.entrypoints ?? [];
  const ciWorkflows = snapshot?.ci_workflows ?? [];
  const planningContext = repoWikiPlanningContext(repoProfile, snapshot);
  const wikiNextAction = wikiReady
    ? riskAreas.length
      ? 'Wiki 已可用，可以继续写需求或查看计划。'
      : 'Wiki 已可用，建议补充风险区域。'
    : '先生成 Wiki，再继续写需求或计划。';

  async function generateWiki() {
    if (!repoId) {
      setWikiGenerationError('请先选择目标仓库。');
      return;
    }
    setWikiGenerationError('');
    try {
      await reindexArchitecture.mutateAsync({
        default_branch: repoProfile.defaultBranch.trim() || undefined,
      });
    } catch (error) {
      setWikiGenerationError(
        `${dispatchFailureMessage(error)}。生成 Repo Wiki 需要后端能读取仓库文件树；如果是 GitHub 仓库，请先完成 GitHub 连接、仓库授权和同步。`
      );
    }
  }

  const wikiSections = [
    {
      title: '仓库总览',
      detail: snapshot?.summary || repoProfile.summary || '等待生成仓库总览。',
      status: wikiReady ? '可用' : '待生成',
    },
    {
      title: '结构与模块',
      detail: modules.length
        ? `${modules.slice(0, 6).join('、')}${modules.length > 6 ? ` 等 ${modules.length} 项` : ''}`
        : '生成后会展示核心模块、入口和目录结构。',
      status: modules.length ? '已提取' : '缺少证据',
    },
    {
      title: '测试命令',
      detail: testCommands.length
        ? testCommands.join('；')
        : '生成后会展示可运行的测试命令。',
      status: testCommands.length || ciWorkflows.length ? '可用' : '待补充',
    },
    {
      title: '风险区域',
      detail: riskAreas.length
        ? riskAreas.join('；')
        : '生成后会展示迁移、安全、权限和数据风险。',
      status: riskAreas.length ? '已识别' : '待识别',
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">仓库 Wiki</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              用仓库内容生成一份简单说明，帮助团队快速了解结构、入口、测试和风险。
            </p>
          </div>
          <Badge variant="outline" className={qualityGateStateClassName(planningContext.state)}>
            {isOffline ? '后端不可用' : planningContextStateLabel(planningContext.state)}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <ManualMetric label="目标仓库" value={repoId || '未选择'} />
          <ManualMetric label="默认分支" value={repoProfile.defaultBranch || 'main'} />
          <ManualMetric label="模块" value={String(modules.length)} />
          <ManualMetric label="来源" value={planSource === 'api' ? '真实仓库' : planSource === 'empty' ? '待生成' : '演示'} />
        </div>
        <div className="mt-4 flex flex-col gap-3 rounded-md bg-bg-subtle p-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-text-main">下一步</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {wikiNextAction}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={generateWiki}
              disabled={!repoId || isOffline || reindexArchitecture.isPending}
            >
              {reindexArchitecture.isPending ? '生成中' : '生成 Wiki'}
            </Button>
            <Button type="button" onClick={hasPlan ? onReviewPlan : onCreateRequirement}>
              {hasPlan ? '查看计划' : '新建需求'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
        {wikiGenerationError ? (
          <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm leading-6 text-warning">
            <div>{wikiGenerationError}</div>
            <GitHubGateRecoveryActions actions={githubRecoveryActions} />
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {wikiSections.map(section => (
          <div key={section.title} className="rounded-lg border border-border-subtle bg-bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{section.title}</div>
              <Badge variant="outline">{section.status}</Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">{section.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div className="text-sm font-medium text-text-main">证据索引</div>
          <div className="mt-3 space-y-3">
            <CompactList title="入口文件" items={entrypoints.length ? entrypoints : ['等待架构快照']} />
            <CompactList title="CI 工作流" items={ciWorkflows.length ? ciWorkflows : ['等待架构快照']} />
          </div>
        </div>
        <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div className="text-sm font-medium text-text-main">索引状态</div>
          <div className="mt-2 text-sm leading-6 text-text-muted">
            {snapshot ? (
              <>
                <span>Commit: {snapshot.commit_sha || '未知'}</span>
                <span className="mx-2">·</span>
                <span>生成于 {formatTimestamp(snapshot.created_at)}</span>
              </>
            ) : (
              '暂无架构快照。生成 Wiki 后，这里会记录 commit、模块、入口、CI 和风险。'
            )}
          </div>
          {staleReasons.length > 0 ? (
            <div className="mt-3 space-y-1">
              {staleReasons.map(reason => (
                <div key={reason} className="text-xs leading-5 text-warning">
                  {localizeProjectContextText(reason)}
                </div>
              ))}
            </div>
          ) : null}
          {snapshot?.warnings.length ? (
            <div className="mt-3 space-y-1">
              {snapshot.warnings.map(warning => (
                <div key={warning} className="text-xs leading-5 text-warning">
                  {localizeProjectContextText(warning)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RepoWikiPlanningContextPanel({
  summary,
}: {
  summary: RepoWikiPlanningContextSummary;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">计划上下文完整度</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Wiki 不是静态文档；它决定产品、架构、QA 和 Coding Agent 能否基于仓库事实写计划。
          </p>
        </div>
        <Badge variant="outline" className={qualityGateStateClassName(summary.state)}>
          {summary.readyCount}/{summary.totalCount} 项 · {planningContextStateLabel(summary.state)}
        </Badge>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-subtle">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${summary.scorePercent}%` }}
        />
      </div>
      <div className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
        {summary.nextAction}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {summary.sections.map(section => (
          <div key={section.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{section.label}</div>
              <Badge variant="outline" className={qualityGateStateClassName(section.state)}>
                {planningContextStateLabel(section.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{section.detail}</p>
            <div className="mt-2 text-xs text-text-muted">证据 {section.evidenceCount} 项</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepoWikiExpertPlanningBoard({
  summary,
  contract,
  hasPlan,
  onCreateRequirement,
  onReviewPlan,
  onInspectPrompt,
}: {
  summary: RepoWikiPlanningContextSummary;
  contract: RepoWikiExpertContract;
  hasPlan: boolean;
  onCreateRequirement: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
}) {
  const actions = {
    product: {
      label: hasPlan ? '看计划' : '写需求',
      onClick: hasPlan ? onReviewPlan : onCreateRequirement,
    },
    architecture: { label: '评审计划', onClick: onReviewPlan },
    qa: { label: '看质量门', onClick: onReviewPlan },
    'coding-agent': {
      label: hasPlan ? '检查 Prompt' : '等待计划',
      onClick: hasPlan ? onInspectPrompt : onCreateRequirement,
    },
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">专家计划看板</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Wiki 生成后先进入专家链路，再变成 PR DAG 和 Coding Agent Prompt。这里按专家职责展示输入、输出和下一步。
          </p>
        </div>
        <Badge variant="outline" className={qualityGateStateClassName(summary.state)}>
          Wiki {summary.scorePercent}%
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {contract.stages.map(stage => (
          <div key={stage.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{stage.label}</div>
              <Badge variant="outline" className={qualityGateStateClassName(stage.state)}>
                {planningContextStateLabel(stage.state)}
              </Badge>
            </div>
            <div className="mt-3 space-y-2 text-xs leading-5 text-text-muted">
              <div>
                <span className="font-medium text-text-main">输入：</span>
                {stage.input}
              </div>
              <div>
                <span className="font-medium text-text-main">输出：</span>
                {stage.output}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" onClick={actions[stage.id].onClick}>
                {actions[stage.id].label}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RepoWikiExpertContractPanel({
  contract,
  onCreateRequirement,
  onReviewPlan,
  onInspectPrompt,
}: {
  contract: RepoWikiExpertContract;
  onCreateRequirement: () => void;
  onReviewPlan: () => void;
  onInspectPrompt: () => void;
}) {
  const primaryAction = contract.canCompilePrompt
    ? { label: '检查 Prompt', onClick: onInspectPrompt }
    : contract.canWritePlan
      ? { label: '继续写计划', onClick: onReviewPlan }
      : { label: '补充需求', onClick: onCreateRequirement };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">Wiki 到 Prompt 的合同</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{contract.headline}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={primaryAction.onClick}>
          {primaryAction.label}
        </Button>
      </div>
      <div className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
        {contract.nextAction}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {contract.stages.map(stage => (
          <div key={stage.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{stage.label}</div>
              <Badge variant="outline" className={qualityGateStateClassName(stage.state)}>
                {planningContextStateLabel(stage.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{stage.nextAction}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stage.promptRefs.map(ref => (
                <span key={ref} className="rounded-full bg-bg-surface px-2 py-1 text-[11px] text-text-muted">
                  {ref}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBoardPanel({
  run,
  qualityGates,
  githubRecoveryActions,
  riskAccepted,
  onInspectRun,
  onInspectPrompt,
  onAcceptRisk,
}: {
  run: ExecutionRun;
  qualityGates: QualityGateSummary[];
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  riskAccepted: boolean;
  onInspectRun: () => void;
  onInspectPrompt: () => void;
  onAcceptRisk: () => void;
}) {
  const reviewableTasks = run.tasks.filter(task =>
    ['ready_for_review', 'pr_opened', 'ci_running'].includes(task.status)
  );
  const blockedTasks = run.tasks.filter(task =>
    ['blocked', 'failed', 'cancelled', 'closed'].includes(task.status)
  );
  const blockedGates = qualityGates.filter(gate => gate.state === 'blocked');
  const waitingGates = qualityGates.filter(gate => gate.state === 'waiting');
  const readyGates = qualityGates.filter(gate => gate.state === 'ready');
  const ciTasks = run.tasks.filter(task => task.status === 'ci_running');
  const completedTasks = run.tasks.filter(task => ['completed', 'merged'].includes(task.status));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">评审看板职责</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              这里只处理交付后的质量判断：PR 是否可评审、CI 是否失败、是否需要 fix / review_patch 或人工决策。
            </p>
          </div>
          <Badge
            variant="outline"
            className={blockedTasks.length || blockedGates.length ? 'text-warning' : 'text-success'}
          >
            {blockedTasks.length || blockedGates.length ? '需要处理' : '暂无阻塞'}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <ManualMetric label="可评审 PR" value={String(reviewableTasks.length)} />
          <ManualMetric label="阻塞任务" value={String(blockedTasks.length)} />
          <ManualMetric label="阻塞质量门" value={String(blockedGates.length)} />
          <ManualMetric label="等待质量门" value={String(waitingGates.length)} />
        </div>
      </div>

      <QualityGateKanban
        blockedGates={blockedGates}
        waitingGates={waitingGates}
        readyGates={readyGates}
        reviewableTasks={reviewableTasks}
        blockedTasks={blockedTasks}
        ciTasks={ciTasks}
        completedTasks={completedTasks}
        githubRecoveryActions={githubRecoveryActions}
        riskAccepted={riskAccepted}
        onAcceptRisk={onAcceptRisk}
        onInspectRun={onInspectRun}
        onInspectPrompt={onInspectPrompt}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <ReviewBoardLane
          title="可评审"
          empty="暂无进入评审的 PR 节点。"
          tasks={reviewableTasks}
          tone="ready"
        />
        <ReviewBoardLane
          title="需处理"
          empty="暂无失败、阻塞或取消的 PR 节点。"
          tasks={blockedTasks}
          tone="blocked"
        />
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">质量门决策</div>
        <div className="mt-3 grid gap-2">
          {qualityGates.map(gate => (
            <div key={gate.id} className="rounded-md bg-bg-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-text-main">{gate.label}</div>
                <Badge variant="outline" className={qualityGateStateClassName(gate.state)}>
                  {qualityGateStateLabel(gate.state)}
                </Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-text-muted">{gate.detail}</p>
              {gate.id === 'github' && gate.state === 'blocked' ? (
                <GitHubGateRecoveryActions actions={githubRecoveryActions} />
              ) : null}
              {gate.id === 'risk' ? (
                <div className="mt-3 flex flex-col gap-2 rounded-md border border-border-subtle bg-bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-medium text-text-main">
                      {riskAccepted ? '风险已确认' : '需要人工确认'}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-muted">
                      确认后不会删除风险约束；它会继续进入 Prompt、测试和 PR 摘要。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={riskAccepted ? 'outline' : 'default'}
                    size="sm"
                    disabled={riskAccepted}
                    onClick={onAcceptRisk}
                  >
                    {riskAccepted ? '已确认' : '确认风险并回到计划'}
                    {!riskAccepted ? <ArrowRight className="ml-1.5 h-4 w-4" /> : null}
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="text-sm font-medium text-text-main">处理路径</div>
        <div className="mt-3 grid gap-2">
          <ProcessRouteLine
            label="查看执行事件"
            value="定位 runtime 输出、测试结果、失败日志和重试状态。"
            action="去执行"
            onClick={onInspectRun}
          />
          <ProcessRouteLine
            label="检查 Prompt 契约"
            value="确认失败是否来自范围、证据、Skill 或质量门约束。"
            action="去 Prompt"
            onClick={onInspectPrompt}
          />
          <ProcessRouteLine
            label="创建修订任务"
            value="在执行任务事件面板中粘贴 PR 评审反馈，生成 review_patch。"
            action="去执行"
            onClick={onInspectRun}
          />
        </div>
      </div>
    </div>
  );
}

function ReviewBoardLane({
  title,
  empty,
  tasks,
  tone,
}: {
  title: string;
  empty: string;
  tasks: PRNode[];
  tone: 'ready' | 'blocked';
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-main">{title}</div>
        <Badge variant="outline" className={tone === 'blocked' ? 'text-warning' : 'text-success'}>
          {tasks.length}
        </Badge>
      </div>
      <div className="mt-3 space-y-2">
        {tasks.length === 0 ? (
          <div className="rounded-md bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {empty}
          </div>
        ) : (
          tasks.map(task => (
            <div key={`${task.id}-${task.status}`} className="rounded-md bg-bg-subtle p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium text-text-main">
                  {task.nodeKey}: {task.title}
                </div>
                <Badge variant="outline" className={statusClassName(task.status)}>
                  {statusLabel[task.status]}
                </Badge>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">
                {task.failureReason || task.errorLog || task.githubPrUrl || task.goal}
              </p>
              {task.githubPrUrl ? (
                <a
                  href={task.githubPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center text-xs text-primary"
                >
                  打开 PR
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function QualityGateKanban({
  blockedGates,
  waitingGates,
  readyGates,
  reviewableTasks,
  blockedTasks,
  ciTasks,
  completedTasks,
  githubRecoveryActions,
  riskAccepted,
  onAcceptRisk,
  onInspectRun,
  onInspectPrompt,
}: {
  blockedGates: QualityGateSummary[];
  waitingGates: QualityGateSummary[];
  readyGates: QualityGateSummary[];
  reviewableTasks: PRNode[];
  blockedTasks: PRNode[];
  ciTasks: PRNode[];
  completedTasks: PRNode[];
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  riskAccepted: boolean;
  onAcceptRisk: () => void;
  onInspectRun: () => void;
  onInspectPrompt: () => void;
}) {
  const columns = [
    {
      id: 'blocked',
      title: '阻塞门',
      detail: '必须先处理的 GitHub、风险、测试或恢复阻塞。',
      count: blockedGates.length,
      tone: 'blocked' as const,
      content:
        blockedGates.length > 0 ? (
          blockedGates.map(gate => (
            <QualityGateKanbanGate
              key={gate.id}
              gate={gate}
              githubRecoveryActions={githubRecoveryActions}
              riskAccepted={riskAccepted}
              onAcceptRisk={onAcceptRisk}
            />
          ))
        ) : (
          <QualityKanbanEmpty text="暂无阻塞质量门。" />
        ),
    },
    {
      id: 'waiting',
      title: '等待 CI / PR',
      detail: '等待执行、PR 创建、CI 或审查结果回流。',
      count: waitingGates.length + ciTasks.length,
      tone: 'waiting' as const,
      content:
        waitingGates.length + ciTasks.length > 0 ? (
          <>
            {waitingGates.map(gate => (
              <QualityGateKanbanGate
                key={gate.id}
                gate={gate}
                githubRecoveryActions={githubRecoveryActions}
                riskAccepted={riskAccepted}
                onAcceptRisk={onAcceptRisk}
              />
            ))}
            {ciTasks.map(task => (
              <QualityGateKanbanTask key={`${task.id}-${task.status}`} task={task} />
            ))}
          </>
        ) : (
          <QualityKanbanEmpty text="暂无等待中的 CI 或 PR。" />
        ),
    },
    {
      id: 'review',
      title: '可评审',
      detail: 'PR 已打开或已进入 ready for review。',
      count: reviewableTasks.length,
      tone: 'ready' as const,
      content:
        reviewableTasks.length > 0 ? (
          reviewableTasks.map(task => (
            <QualityGateKanbanTask key={`${task.id}-${task.status}`} task={task} />
          ))
        ) : (
          <QualityKanbanEmpty text="暂无可评审 PR。" />
        ),
    },
    {
      id: 'fix',
      title: '修复决策',
      detail: '失败任务在这里决定重试、review patch 或人工升级。',
      count: blockedTasks.length,
      tone: 'blocked' as const,
      content:
        blockedTasks.length > 0 ? (
          blockedTasks.map(task => (
            <QualityGateKanbanTask key={`${task.id}-${task.status}`} task={task} />
          ))
        ) : (
          <QualityKanbanEmpty text="暂无失败或取消任务。" />
        ),
    },
    {
      id: 'passed',
      title: '已通过',
      detail: '质量门就绪，任务已完成或已合并。',
      count: readyGates.length + completedTasks.length,
      tone: 'ready' as const,
      content:
        readyGates.length + completedTasks.length > 0 ? (
          <>
            {readyGates.map(gate => (
              <QualityGateKanbanGate
                key={gate.id}
                gate={gate}
                githubRecoveryActions={githubRecoveryActions}
                riskAccepted={riskAccepted}
                onAcceptRisk={onAcceptRisk}
              />
            ))}
            {completedTasks.map(task => (
              <QualityGateKanbanTask key={`${task.id}-${task.status}`} task={task} />
            ))}
          </>
        ) : (
          <QualityKanbanEmpty text="暂无已通过项。" />
        ),
    },
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">质量门 Kanban</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            按质量状态观看从阻塞、等待 CI、PR 评审、修复决策到通过的流转。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onInspectRun}>
            查看执行事件
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onInspectPrompt}>
            检查 Prompt
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        {columns.map(column => (
          <div key={column.id} className="min-h-44 rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-text-main">{column.title}</div>
                <div className="mt-1 text-xs leading-5 text-text-muted">{column.detail}</div>
              </div>
              <Badge
                variant="outline"
                className={
                  column.count > 0
                    ? column.tone === 'blocked'
                      ? 'text-warning'
                      : 'text-success'
                    : ''
                }
              >
                {column.count}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">{column.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityGateKanbanGate({
  gate,
  githubRecoveryActions,
  riskAccepted,
  onAcceptRisk,
}: {
  gate: QualityGateSummary;
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  riskAccepted: boolean;
  onAcceptRisk: () => void;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-text-main">{gate.label}</div>
        <Badge variant="outline" className={qualityGateStateClassName(gate.state)}>
          {qualityGateStateLabel(gate.state)}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-text-muted">{gate.detail}</p>
      {gate.id === 'github' && gate.state === 'blocked' ? (
        <GitHubGateRecoveryActions actions={githubRecoveryActions} />
      ) : null}
      {gate.id === 'risk' && gate.state === 'blocked' ? (
        <Button
          type="button"
          className="mt-3"
          size="sm"
          disabled={riskAccepted}
          onClick={onAcceptRisk}
        >
          {riskAccepted ? '已确认' : '确认风险'}
        </Button>
      ) : null}
    </div>
  );
}

function QualityGateKanbanTask({ task }: { task: PRNode }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-primary">{task.nodeKey}</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-text-main">
            {task.title}
          </div>
        </div>
        <Badge variant="outline" className={statusClassName(task.status)}>
          {statusLabel[task.status]}
        </Badge>
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-text-muted">
        {task.failureReason || task.errorLog || task.githubPrUrl || task.goal}
      </p>
      {task.githubPrUrl ? (
        <a
          href={task.githubPrUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center text-xs text-primary"
        >
          打开 PR
          <ExternalLink className="ml-1 h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}

function QualityKanbanEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-4 text-xs leading-5 text-text-muted">
      {text}
    </div>
  );
}

function ProcessRouteLine({
  label,
  value,
  action,
  onClick,
}: {
  label: string;
  value: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-text-main">{label}</div>
        <p className="mt-1 text-xs leading-5 text-text-muted">{value}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}

function qualityGateStateLabel(state: QualityGateState) {
  switch (state) {
    case 'ready':
      return '就绪';
    case 'blocked':
      return '需处理';
    default:
      return '等待';
  }
}

function planningContextStateLabel(state: QualityGateState) {
  switch (state) {
    case 'ready':
      return '可用于计划';
    case 'blocked':
      return '需补齐';
    default:
      return '可继续';
  }
}

function qualityGateStateClassName(state: QualityGateState) {
  switch (state) {
    case 'ready':
      return 'text-success';
    case 'blocked':
      return 'text-error';
    default:
      return 'text-text-muted';
  }
}

function PromptContractLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-bg-subtle px-3 py-2 sm:grid-cols-[140px_minmax(0,1fr)]">
      <span className="font-medium text-text-main">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function manualStatusClassName(status: string) {
  if (status.includes('可') || status.includes('已') || status.includes('有')) {
    return 'text-success';
  }
  if (status.includes('执行') || status.includes('评审')) {
    return 'text-info';
  }
  return 'text-text-muted';
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
  executionReadiness,
  hasPlan,
  skillRunCount,
  generationError,
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
  executionReadiness: ExecutionReadiness;
  hasPlan: boolean;
  skillRunCount: number;
  generationError: string;
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
  const selectedAgent = agentOptions.find(option => option.executor === selectedExecutor);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 overflow-hidden p-0 sm:max-w-[980px]">
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
          <DialogBody className="mx-0 grid max-h-[68vh] gap-5 overflow-y-auto px-5 py-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="rounded-lg border border-border-subtle bg-bg-surface p-3">
                <div className="text-xs font-medium uppercase text-text-muted">Idea</div>
                <Textarea
                  value={idea}
                  onChange={event => onIdeaChange(event.target.value)}
                  className="mt-2 min-h-48 resize-none border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                  aria-label={t('detail.idea.inputLabel')}
                  placeholder={t('createDialog.placeholder')}
                  autoFocus
                />
              </div>
              {generationError ? (
                <div className="rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm leading-6 text-warning">
                  {generationError}
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </div>

            <IntakePipelinePreview
              hasIdea={Boolean(idea.trim())}
              repositoryReady={repositoryReady}
              repositoryLabel={
                selectedGitHubRepository
                  ? `${selectedGitHubRepository.github_owner}/${selectedGitHubRepository.github_repo}`
                  : effectiveRepoId.trim()
              }
              selectedAgent={selectedAgent}
              executionReadiness={executionReadiness}
              hasPlan={hasPlan}
              skillRunCount={skillRunCount}
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

function IntakePipelinePreview({
  hasIdea,
  repositoryReady,
  repositoryLabel,
  selectedAgent,
  executionReadiness,
  hasPlan,
  skillRunCount,
}: {
  hasIdea: boolean;
  repositoryReady: boolean;
  repositoryLabel: string;
  selectedAgent?: ExecutionAgentOption;
  executionReadiness: ExecutionReadiness;
  hasPlan: boolean;
  skillRunCount: number;
}) {
  const steps = [
    {
      label: '产品专家',
      state: hasIdea ? '就绪' : '等待需求',
      detail: '生成 PRD：目标、验收标准、非目标和假设。',
      icon: Sparkles,
      ready: hasIdea,
    },
    {
      label: '架构专家',
      state: repositoryReady ? '仓库已选' : '缺少仓库',
      detail: repositoryReady ? `读取 ${repositoryLabel || '目标仓库'} 的画像、测试和风险。` : '先选择已绑定仓库。',
      icon: GitBranch,
      ready: repositoryReady,
    },
    {
      label: 'UI/UX + QA',
      state: hasPlan ? '已有计划' : '生成后注入',
      detail: '把体验要求、测试命令和质量门写进 PR DAG。',
      icon: ShieldAlert,
      ready: hasPlan,
    },
    {
      label: 'Skill 编排',
      state: skillRunCount > 0 ? `${skillRunCount} 次记录` : '按目标注入',
      detail: '只把匹配专家、仓库和 executor 的 skill 编进 prompt。',
      icon: BookOpen,
      ready: skillRunCount > 0 || hasIdea,
    },
    {
      label: 'Coding Agent',
      state: executionReadiness.canDispatch ? 'Codex 可调度' : '等待 runtime',
      detail: selectedAgent
        ? `${selectedAgent.label} · ${executionReadiness.reason}`
        : executionReadiness.reason,
      icon: Terminal,
      ready: executionReadiness.canDispatch,
    },
  ];

  return (
    <aside className="rounded-lg border border-border-subtle bg-bg-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">提交后会发生什么</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            CodingCTO 会先规划，不会直接改代码；审批后才调度 Codex 执行。
          </p>
        </div>
        <Badge variant="outline" className={executionReadiness.canDispatch ? 'text-success' : 'text-warning'}>
          {executionReadiness.canDispatch ? '可执行' : '需准备'}
        </Badge>
      </div>
      <div className="mt-4 space-y-2">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="rounded-md bg-bg-surface p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-xs font-medium">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-text-main">
                      <Icon className="h-4 w-4 text-primary" />
                      {step.label}
                    </div>
                    <Badge variant="outline" className={step.ready ? 'text-success' : 'text-text-muted'}>
                      {step.state}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-muted">{step.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
        生成计划后，你会在说明书页看到专家产出、质量门和每个 PR 节点的 Prompt 契约。
      </div>
    </aside>
  );
}

function RequirementSummaryPanel({
  t,
  idea,
  effectiveRepoId,
  selectedGitHubRepository,
  repositoryReady,
  selectedAgent,
  executionReadiness,
  hasPlan,
  skillRunCount,
  onCreate,
}: {
  t: DashboardTranslator;
  idea: string;
  effectiveRepoId: string;
  selectedGitHubRepository?: GitHubRepositoryDTO;
  repositoryReady: boolean;
  selectedAgent?: ExecutionAgentOption;
  executionReadiness: ExecutionReadiness;
  hasPlan: boolean;
  skillRunCount: number;
  onCreate: () => void;
}) {
  const repoLabel = selectedGitHubRepository
    ? `${selectedGitHubRepository.github_owner}/${selectedGitHubRepository.github_repo}`
    : effectiveRepoId;
  const hasIdea = Boolean(idea.trim());

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
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 truncate text-sm font-medium text-text-main">
            {repoLabel || t('detail.idea.repositoryId')}
          </div>
          <Badge variant="outline" className={repositoryReady ? 'text-success' : 'text-warning'}>
            {repositoryReady ? '仓库已绑定' : '等待仓库'}
          </Badge>
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">需求输入检查</div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              一个需求至少需要清楚的问题描述、目标仓库和计划前的审批预期；CodingCTO 会先规划，不会直接改代码。
            </p>
          </div>
          <Button type="button" size="sm" onClick={onCreate}>
            {hasIdea ? '编辑需求' : t('createDialog.title')}
            <SquarePen className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <PromptContractMetric
            label="需求描述"
            value={hasIdea ? '已填写' : '待输入'}
            state={hasIdea ? 'ready' : 'waiting'}
          />
          <PromptContractMetric
            label="目标仓库"
            value={repositoryReady ? '已绑定' : '待选择'}
            state={repositoryReady ? 'ready' : 'blocked'}
          />
          <PromptContractMetric
            label="计划状态"
            value={hasPlan ? '已生成' : '待生成'}
            state={hasPlan ? 'ready' : 'waiting'}
          />
        </div>
      </div>

      <IntakePipelinePreview
        hasIdea={hasIdea}
        repositoryReady={repositoryReady}
        repositoryLabel={repoLabel}
        selectedAgent={selectedAgent}
        executionReadiness={executionReadiness}
        hasPlan={hasPlan}
        skillRunCount={skillRunCount}
      />
    </div>
  );
}

function EmptyProjectPlanPanel({
  isLoading,
  generationError,
  onCreate,
}: {
  isLoading: boolean;
  generationError: string;
  onCreate: () => void;
}) {
  const upcomingChecks: DispatchChecklistItem[] = [
    {
      id: 'experts',
      label: '专家产出',
      detail: '产品、架构、UI/UX 和 QA 先生成 PRD、技术计划和验收标准。',
      state: 'waiting',
    },
    {
      id: 'dag',
      label: 'PR DAG',
      detail: '计划会拆成可独立评审的 PR 节点，并保留依赖顺序。',
      state: 'waiting',
    },
    {
      id: 'prompt',
      label: 'Prompt 契约',
      detail: '每个节点会带上预期文件、测试命令、non-goals、Skill 和质量门。',
      state: 'waiting',
    },
    {
      id: 'dispatch',
      label: 'Codex 调度',
      detail: '审批后才会调起在线 runtime；不会在录入需求时直接改代码。',
      state: 'waiting',
    },
  ];

  return (
    <div className="grid gap-4">
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
      {generationError ? (
        <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4 text-sm leading-6 text-warning">
          <div className="font-medium text-text-main">计划生成没有完成</div>
          <p className="mt-1">{generationError}</p>
        </div>
      ) : null}
      <DispatchReadinessChecklist
        items={upcomingChecks}
        readyCount={0}
        blockedCount={0}
        title="生成计划后会检查什么"
        description="这不是额外配置页，而是从需求到 Codex 调度前必须能解释清楚的产品流程。"
      />
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
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
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

function PreDispatchRunGuide({
  plan,
  selectedNodeIds,
  executionReadiness,
  qualityGates,
  githubRecoveryActions,
}: {
  plan: PlanBundle;
  selectedNodeIds: string[];
  executionReadiness: ExecutionReadiness;
  qualityGates: QualityGateSummary[];
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
}) {
  const selectedCount = selectedNodeIds.length;
  const blockedGateCount = qualityGates.filter(gate => gate.state === 'blocked').length;
  const steps = [
    {
      id: 'confirm',
      label: '1. 确认调度',
      detail: `审批后会创建运行，并派发 ${selectedCount || plan.prNodes.length} 个 PR 节点。`,
      state: selectedCount > 0 ? 'ready' : 'waiting',
    },
    {
      id: 'claim',
      label: '2. Runtime Claim',
      detail: executionReadiness.canDispatch
        ? '在线 runtime 会领取任务，并在本地仓库启动 Codex CLI。'
        : executionReadiness.reason,
      state: executionReadiness.canDispatch ? 'ready' : 'blocked',
    },
    {
      id: 'events',
      label: '3. 事件与日志',
      detail: '每个任务会写入 claim、prompt、stdout/stderr、测试结果和 PR 状态事件。',
      state: 'waiting',
    },
    {
      id: 'recovery',
      label: '4. PR 与回收',
      detail:
        blockedGateCount > 0
          ? `${blockedGateCount} 个质量门需要检查；失败后回到看板或创建 review_patch。`
          : '通过后会进入 PR、CI、评审和可合并状态。',
      state: blockedGateCount > 0 ? 'blocked' : 'waiting',
    },
  ] satisfies DispatchChecklistItem[];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">启动后会发生什么</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            运行页负责看 Codex 执行、事件日志、PR 状态和失败回收；不是在这里重新写需求或改计划。
          </p>
        </div>
        <Badge
          variant="outline"
          className={executionReadiness.canDispatch ? statusClassName('completed') : statusClassName('blocked')}
        >
          {executionReadiness.canDispatch ? 'Runtime 可领取' : '等待 Runtime'}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 xl:grid-cols-2">
        {steps.map(step => (
          <div
            key={step.label}
            className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-main">{step.label}</span>
              <Badge variant="outline" className={qualityGateStateClassName(step.state)}>
                {step.state === 'ready'
                  ? '就绪'
                  : step.state === 'waiting'
                    ? '等待'
                    : '需处理'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">{step.detail}</p>
          </div>
        ))}
      </div>
      {qualityGates.some(gate => gate.id === 'github' && gate.state === 'blocked') &&
      githubRecoveryActions.length > 0 ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle p-3">
          <div className="text-sm font-medium text-warning">GitHub 交付权限未就绪</div>
          <p className="mt-1 text-xs leading-5 text-warning">
            正式执行会创建 Issue、推送分支并打开 PR；请先修复 GitHub 连接和仓库权限。
          </p>
          <GitHubGateRecoveryActions actions={githubRecoveryActions} />
        </div>
      ) : null}
    </div>
  );
}

function ProjectDispatchProofPanel({
  repositoryId,
  runtimeId,
  canDispatch,
  readinessReason,
  task,
  events,
  isCreating,
  isLoadingEvents,
  error,
  onRun,
}: {
  repositoryId: string;
  runtimeId?: string;
  canDispatch: boolean;
  readinessReason: string;
  task?: CodingCTODirectAgentTaskDTO;
  events: Array<{ seq: number; type: string; output?: string }>;
  isCreating: boolean;
  isLoadingEvents: boolean;
  error: string;
  onRun: () => void;
}) {
  const eventSummary = summarizeTaskEvents(events);
  const proofReady = Boolean(task && eventSummary.hasRuntimeClaim && eventSummary.hasExecutorResult);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">项目级 Codex 调度验证</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            用当前项目、仓库和 runtime 创建一个只读任务，证明平台能命令本地 Codex。正式交付仍从计划审批启动。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={proofReady ? 'text-success' : task ? 'text-info' : 'text-text-muted'}
          >
            {proofReady ? '验证通过' : task ? eventSummary.proofLabel : '未验证'}
          </Badge>
          <Button type="button" size="sm" onClick={onRun} disabled={!canDispatch || isCreating}>
            {isCreating ? '创建中' : '运行只读验证'}
            <Terminal className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualMetric label="仓库" value={repositoryId || '未选择'} />
        <ManualMetric label="Runtime" value={runtimeId || '未就绪'} />
        <ManualMetric label="Runtime claim" value={eventSummary.hasRuntimeClaim ? '有' : '无'} />
        <ManualMetric label="执行结果" value={eventSummary.hasExecutorResult ? '有' : '无'} />
      </div>
      {!canDispatch ? (
        <div className="mt-3 rounded-md bg-warning-subtle px-3 py-2 text-sm leading-6 text-warning">
          {readinessReason}
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 rounded-md bg-error-subtle px-3 py-2 text-sm leading-6 text-error">
          {error}
        </div>
      ) : null}
      {task ? (
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium text-text-main">
              #{task.id} · {task.title}
            </div>
            <Badge variant="outline" className={statusClassName(task.status)}>
              {task.status}
            </Badge>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            <div>事件数：{events.length}</div>
            <div>输出事件：{eventSummary.outputEventCount}</div>
            <div>最后事件：{eventSummary.lastEventLabel}</div>
            <div>{isLoadingEvents ? '事件加载中' : eventSummary.proofLabel}</div>
          </div>
          {task.output_log ? (
            <div className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-words">
              {task.output_log}
            </div>
          ) : null}
          {task.failure_reason ? (
            <div className="mt-2 text-warning">{task.failure_reason}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DispatchProofSeparationPanel({
  run,
  directTaskStatus,
  directTaskEvents,
  qualityGates,
  onRunDirectProof,
  onOpenPlan,
  onOpenReview,
  isCreatingDirectProof,
  canRunDirectProof,
}: {
  run: ExecutionRun;
  directTaskStatus?: string;
  directTaskEvents: Array<{ seq: number; type: string; output?: string }>;
  qualityGates: QualityGateSummary[];
  onRunDirectProof: () => void;
  onOpenPlan: () => void;
  onOpenReview: () => void;
  isCreatingDirectProof: boolean;
  canRunDirectProof: boolean;
}) {
  const blockedFormalGates = qualityGates.filter(gate => gate.state === 'blocked');
  const summary = dispatchProofSeparationSummary({
    run,
    directTaskStatus,
    directTaskEvents,
    formalBlockedReasons: blockedFormalGates.map(gate => gate.label),
  });

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">调度证明分离</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{summary.headline}</p>
        </div>
        <Badge
          variant="outline"
          className={summary.canClaimFormalDelivery ? 'text-success' : 'text-warning'}
        >
          {summary.canClaimFormalDelivery ? '正式派发已证明' : '正式派发未证明'}
        </Badge>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {summary.lanes.map(lane => (
          <div key={lane.id} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{lane.label}</div>
              <Badge variant="outline" className={dispatchProofStateClassName(lane.state)}>
                {dispatchProofStateLabel(lane.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{lane.evidence}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">{lane.nextAction}</p>
            <div className="mt-3 flex justify-end">
              {lane.id === 'direct-proof' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRunDirectProof}
                  disabled={!canRunDirectProof || isCreatingDirectProof}
                >
                  {isCreatingDirectProof ? '创建中' : '运行只读验证'}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={blockedFormalGates.length > 0 ? onOpenReview : onOpenPlan}
                >
                  {blockedFormalGates.length > 0 ? '处理阻塞项' : '去计划页启动'}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function dispatchProofStateLabel(state: DispatchProofState) {
  switch (state) {
    case 'proven':
      return '已证明';
    case 'partial':
      return '部分';
    default:
      return '缺失';
  }
}

function dispatchProofStateClassName(state: DispatchProofState) {
  switch (state) {
    case 'proven':
      return 'text-success';
    case 'partial':
      return 'text-info';
    default:
      return 'text-warning';
  }
}

function PlanReview({
  plan,
  decisionOverrides,
  selectedExecutionNodeIds,
  approved,
  isStarting,
  dispatchError,
  executionReadiness,
  qualityGates,
  githubRecoveryActions,
  agentOptions,
  selectedExecutor,
  onDecisionOverrideChange,
  onExecutionNodeSelectionChange,
  onExecutorChange,
  onReviewQualityGates,
  onInspectPrompt,
  onOpenAgents,
  onApprove,
}: {
  plan: PlanBundle;
  decisionOverrides: Record<string, string>;
  selectedExecutionNodeIds: string[];
  approved: boolean;
  isStarting: boolean;
  dispatchError: string;
  executionReadiness: ExecutionReadiness;
  qualityGates: QualityGateSummary[];
  githubRecoveryActions: GitHubReadinessRecoveryAction[];
  agentOptions: ExecutionAgentOption[];
  selectedExecutor: string;
  onDecisionOverrideChange: (key: string, value: string) => void;
  onExecutionNodeSelectionChange: (nodeIds: string[]) => void;
  onExecutorChange: (value: string) => void;
  onReviewQualityGates: () => void;
  onInspectPrompt: () => void;
  onOpenAgents: () => void;
  onApprove: () => void;
}) {
  const { productSpec, implementationPlan } = plan;
  const [dispatchConfirmOpen, setDispatchConfirmOpen] = useState(false);
  const approvalReadiness = planApprovalReadiness(plan);
  const executionRangeNotes = executionRangeReview(plan.prNodes, selectedExecutionNodeIds);
  const canStartSelectedRange = canStartExecutionRange(plan.prNodes, selectedExecutionNodeIds);
  const selectedExecutionNodes = plan.prNodes.filter(node =>
    selectedExecutionNodeIds.includes(node.id)
  );
  const decisionFields = decisionFieldsForPlan(plan);
  const planAssumptions = productSpec.assumptions.filter(
    item => !item.startsWith('PR DAG review:')
  );
  const skillRunsQuery = useSpecForgePlanSkillRuns(plan.planId);
  const skillRuns = skillRunsQuery.data?.skill_runs ?? [];
  const blockedQualityGates = qualityGates.filter(gate => gate.state === 'blocked');
  const waitingQualityGates = qualityGates.filter(gate => gate.state === 'waiting');
  const readyQualityGates = qualityGates.filter(gate => gate.state === 'ready');
  const qualityGateLabel = (gate: QualityGateSummary) =>
    gate.id === 'risk' && gate.detail.includes('已由人工确认')
      ? `${gate.label}（已确认）`
      : gate.label;
  const qualityGateStatusText = [
    readyQualityGates.length
      ? `就绪：${readyQualityGates.map(qualityGateLabel).join('、')}`
      : '',
    waitingQualityGates.length
      ? `等待：${waitingQualityGates.map(qualityGateLabel).join('、')}`
      : '',
    blockedQualityGates.length
      ? `需处理：${blockedQualityGates.map(qualityGateLabel).join('、')}`
      : '',
  ]
    .filter(Boolean)
    .join('；');
  const dispatchChecklist = [
    {
      id: 'plan',
      label: '计划可审批',
      detail: approvalReadiness.canApprove
        ? 'PRD、技术计划和 PR DAG 已具备审批条件。'
        : approvalReadiness.reason,
      state: approvalReadiness.canApprove ? 'ready' : 'blocked',
    },
    {
      id: 'range',
      label: '任务范围',
      detail: canStartSelectedRange
        ? `已选择 ${selectedExecutionNodeIds.length} 个 PR 节点；依赖关系满足执行顺序。`
        : '至少选择一个 PR 节点，并且不能跳过上游依赖。',
      state: canStartSelectedRange ? 'ready' : 'blocked',
    },
    {
      id: 'agent',
      label: '执行智能体',
      detail: executionReadiness.canDispatch
        ? `${executorDisplayName(selectedExecutor)} 已在线，可由平台调起。`
        : executionReadiness.reason,
      state: executionReadiness.canDispatch ? 'ready' : 'blocked',
    },
    {
      id: 'skills',
      label: '专家与 Skill',
      detail: skillRuns.length
        ? `${skillRuns.length} 条专家产出会进入 Prompt 证据链。`
        : '可以先执行；生成计划后会尽量加载产品、技术和 PR DAG 的专家记录。',
      state: skillRuns.length ? 'ready' : 'waiting',
    },
    {
      id: 'quality',
      label: '质量门',
      detail:
        blockedQualityGates.length > 0
          ? `${blockedQualityGates.length} 个质量门需要先处理。${qualityGateStatusText}。`
          : waitingQualityGates.length > 0
            ? `${waitingQualityGates.length} 个质量门会在执行后继续等待 PR、CI 或审查结果。${qualityGateStatusText}。`
            : `${qualityGateStatusText}。`,
      state:
        blockedQualityGates.length > 0
          ? 'blocked'
          : waitingQualityGates.length > 0
            ? 'waiting'
            : 'ready',
    },
    {
      id: 'prompt',
      label: 'Prompt 契约',
      detail: '每个 PR 节点会带上目标、预期文件、测试命令、non-goals 和质量门。',
      state: plan.prNodes.length > 0 ? 'ready' : 'blocked',
    },
  ] satisfies DispatchChecklistItem[];
  const dispatchReadyCount = dispatchChecklist.filter(item => item.state === 'ready').length;
  const dispatchBlockedCount = dispatchChecklist.filter(item => item.state === 'blocked').length;

  return (
    <div className="grid gap-4">
      <ExpertPlanningKanban
        plan={plan}
        skillRuns={skillRuns}
        skillRunsLoading={skillRunsQuery.isLoading}
        qualityGates={qualityGates}
        selectedNodeCount={selectedExecutionNodeIds.length}
        onInspectPrompt={onInspectPrompt}
      />

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
          <DispatchReadinessChecklist
            items={dispatchChecklist}
            readyCount={dispatchReadyCount}
            blockedCount={dispatchBlockedCount}
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
            <RuntimeBlockerPanel
              reason={executionReadiness.reason}
              selectedExecutor={selectedExecutor}
              onOpenAgents={onOpenAgents}
            />
          )}
          {blockedQualityGates.length > 0 && (
            <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <span>
                  当前有 {blockedQualityGates.length} 个质量门阻塞。请先处理风险、测试或恢复决策，再启动 Codex。
                </span>
                <Button type="button" variant="outline" size="sm" onClick={onReviewQualityGates}>
                  查看检查项
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
              {blockedQualityGates.some(gate => gate.id === 'github') &&
              githubRecoveryActions.length > 0 ? (
                <GitHubGateRecoveryActions actions={githubRecoveryActions} />
              ) : null}
            </div>
          )}
          {dispatchError ? (
            <DispatchFailurePanel
              message={dispatchError}
              runtimeReady={executionReadiness.canDispatch}
              onOpenAgents={onOpenAgents}
              onRetry={() => setDispatchConfirmOpen(true)}
            />
          ) : null}
          <DispatchConfirmDialog
            open={dispatchConfirmOpen}
            plan={plan}
            selectedNodes={selectedExecutionNodes}
            selectedExecutor={selectedExecutor}
            checklist={dispatchChecklist}
            isStarting={isStarting}
            onOpenChange={setDispatchConfirmOpen}
            onConfirm={async () => {
              await onApprove();
              setDispatchConfirmOpen(false);
            }}
          />
          <Button
            onClick={() => setDispatchConfirmOpen(true)}
            disabled={
              approved ||
              isStarting ||
              !approvalReadiness.canApprove ||
              !canStartSelectedRange ||
              !executionReadiness.canDispatch ||
              dispatchBlockedCount > 0
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

function RuntimeBlockerPanel({
  reason,
  selectedExecutor,
  onOpenAgents,
}: {
  reason: string;
  selectedExecutor: string;
  onOpenAgents: () => void;
}) {
  return (
    <div className="rounded-lg border border-warning/30 bg-warning-subtle p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-warning">
            <Terminal className="h-4 w-4 shrink-0" />
            运行器还不能领取任务
          </div>
          <p className="mt-2 text-sm leading-6 text-warning">{reason}</p>
          <div className="mt-3 grid gap-2 text-xs leading-5 text-text-muted sm:grid-cols-3">
            <div className="rounded-md bg-bg-surface px-3 py-2">
              <div className="font-medium text-text-main">1. 打开智能体</div>
              <div className="mt-1">查看 runtime 是否在线、可写，并检测到 Codex CLI。</div>
            </div>
            <div className="rounded-md bg-bg-surface px-3 py-2">
              <div className="font-medium text-text-main">2. 启动 ccto</div>
              <div className="mt-1">复制本地启动命令，让运行器连接 API 并上报能力。</div>
            </div>
            <div className="rounded-md bg-bg-surface px-3 py-2">
              <div className="font-medium text-text-main">3. 回来启动</div>
              <div className="mt-1">运行器就绪后，计划页会解除执行智能体阻塞。</div>
            </div>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onOpenAgents}>
          检查智能体
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3 text-xs text-text-muted">
        当前执行器：{executorDisplayName(selectedExecutor)}
      </div>
    </div>
  );
}

function DispatchFailurePanel({
  message,
  runtimeReady,
  onOpenAgents,
  onRetry,
}: {
  message: string;
  runtimeReady: boolean;
  onOpenAgents: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-error/30 bg-error-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-error">
            <CircleX className="h-4 w-4 shrink-0" />
            启动执行失败
          </div>
          <p className="mt-2 text-sm leading-6 text-error">{message}</p>
          <p className="mt-2 text-xs leading-5 text-text-muted">
            {runtimeReady
              ? 'Runtime 已在线，请确认仓库权限、任务状态和后端派发接口后重试。'
              : '先检查智能体页的 runtime、Codex CLI、仓库绑定和 Skill 状态，再回到计划页启动。'}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onOpenAgents}>
            检查智能体
          </Button>
          <Button type="button" size="sm" onClick={onRetry}>
            重新确认启动
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DispatchConfirmDialog({
  open,
  plan,
  selectedNodes,
  selectedExecutor,
  checklist,
  isStarting,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  plan: PlanBundle;
  selectedNodes: PRNode[];
  selectedExecutor: string;
  checklist: DispatchChecklistItem[];
  isStarting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const blockedCount = checklist.filter(item => item.state === 'blocked').length;
  const waitingCount = checklist.filter(item => item.state === 'waiting').length;
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setImpactAcknowledged(false);
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent size="lg" className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>确认启动 Coding Agent</DialogTitle>
          <DialogDescription>
            审批后会创建执行运行，并把选中的 PR 节点派发给在线 runtime。这个动作会让 Codex
            在目标仓库中开始工作。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <DispatchConfirmMetric label="目标仓库" value={plan.repoProfile.repositoryId} />
            <DispatchConfirmMetric label="执行器" value={executorDisplayName(selectedExecutor)} />
            <DispatchConfirmMetric label="PR 节点" value={`${selectedNodes.length} 个`} />
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-warning">正式执行影响</div>
                <p className="mt-1 text-sm leading-6 text-warning">
                  这不是只读验证。正式执行会让本地 Codex 在目标仓库工作；成功后会提交变更、推送分支，并进入创建 GitHub PR、CI 和评审流程。
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-bg-surface px-3 py-2">
              <div>
                <div className="text-sm font-medium text-text-main">我确认要启动正式交付</div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  已理解该动作不同于只读调度验证，会修改目标仓库并可能打开 PR。
                </p>
              </div>
              <Switch checked={impactAcknowledged} onCheckedChange={setImpactAcknowledged} />
            </div>
          </div>
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">即将执行的范围</div>
              <Badge
                variant="outline"
                className={blockedCount > 0 ? statusClassName('blocked') : statusClassName('completed')}
              >
                {blockedCount > 0
                  ? `${blockedCount} 项阻塞`
                  : waitingCount > 0
                    ? `${waitingCount} 项待确认`
                    : '可以启动'}
              </Badge>
            </div>
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
              {selectedNodes.map(node => (
                <div
                  key={node.id}
                  className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-main">
                    <Badge variant="outline">{node.nodeKey}</Badge>
                    <span>{node.title}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                    {node.goal}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {checklist.map(item => (
              <div
                key={item.id}
                className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-text-main">{item.label}</span>
                  <Badge variant="outline" className={qualityGateStateClassName(item.state)}>
                    {item.state === 'ready'
                      ? '就绪'
                      : item.state === 'waiting'
                        ? '可先行'
                        : '阻塞'}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            返回检查
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isStarting || blockedCount > 0 || !impactAcknowledged}
          >
            {isStarting ? '正在启动执行' : '确认审批并启动'}
            <Play className="ml-1.5 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DispatchConfirmMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

type DispatchChecklistItem = {
  id: string;
  label: string;
  detail: string;
  state: QualityGateState;
};

function DispatchReadinessChecklist({
  items,
  readyCount,
  blockedCount,
  title = '调度前检查单',
  description = '这些条件会决定“审批并启动”是否可用，也会进入 Coding Agent 的执行约束。',
}: {
  items: DispatchChecklistItem[];
  readyCount: number;
  blockedCount: number;
  title?: string;
  description?: string;
}) {
  const waitingCount = items.filter(item => item.state === 'waiting').length;
  const summaryLabel =
    blockedCount > 0
      ? `${blockedCount} 项阻塞`
      : readyCount > 0
        ? `${readyCount}/${items.length} 项就绪`
        : `${waitingCount} 项待生成`;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-text-main">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {description}
          </p>
        </div>
        <Badge
          variant="outline"
          className={blockedCount > 0 ? statusClassName('blocked') : statusClassName('completed')}
        >
          {summaryLabel}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map(item => (
          <div
            key={item.id}
            className={cn(
              'rounded-md border bg-bg-surface px-3 py-2',
              item.state === 'ready' && 'border-success/25',
              item.state === 'waiting' && 'border-warning/25',
              item.state === 'blocked' && 'border-warning/30 bg-warning-subtle'
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-main">{item.label}</span>
              <Badge variant="outline" className={qualityGateStateClassName(item.state)}>
                {item.state === 'ready'
                  ? '就绪'
                  : item.state === 'waiting'
                    ? '可先行'
                    : '阻塞'}
              </Badge>
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExpertPlanningKanban({
  plan,
  skillRuns,
  skillRunsLoading,
  qualityGates,
  selectedNodeCount,
  onInspectPrompt,
}: {
  plan: PlanBundle;
  skillRuns: SpecForgeSkillRunDTO[];
  skillRunsLoading: boolean;
  qualityGates: QualityGateSummary[];
  selectedNodeCount: number;
  onInspectPrompt: () => void;
}) {
  const runsByStage = new Map(skillRuns.map(run => [run.stage, run]));
  const blockedGateCount = qualityGates.filter(gate => gate.state === 'blocked').length;
  const waitingGateCount = qualityGates.filter(gate => gate.state === 'waiting').length;
  const testCommandCount = plan.prNodes.flatMap(node => node.testCommands).length;
  const columns = [
    {
      id: 'product_plan',
      title: '产品专家',
      input: '需求原文、Repo Wiki、业务规则',
      output: `${plan.productSpec.goals.length} 个目标，${plan.productSpec.acceptanceCriteria.length} 条验收标准`,
      detail: plan.productSpec.goals[0] || plan.idea,
      state: plan.productSpec.goals.length ? 'ready' : 'waiting',
      evidence: runsByStage.get('product_plan'),
    },
    {
      id: 'technical_plan',
      title: '架构专家',
      input: 'Repo Wiki、影响范围、风险和测试命令',
      output: `${plan.implementationPlan.affectedAreas.length} 个影响范围，${testCommandCount} 条测试命令`,
      detail: plan.implementationPlan.technicalSummary,
      state: plan.implementationPlan.affectedAreas.length ? 'ready' : 'waiting',
      evidence: runsByStage.get('technical_plan'),
    },
    {
      id: 'ux_qa',
      title: 'UI/UX + QA',
      input: '体验要求、验收标准、质量门',
      output: `${plan.prNodes.flatMap(node => node.testCommands).length} 条测试命令，${blockedGateCount} 个阻塞门`,
      detail:
        blockedGateCount > 0
          ? `${blockedGateCount} 个质量门需要先处理。`
          : waitingGateCount > 0
            ? `${waitingGateCount} 个质量门等待 PR、CI 或审查结果。`
            : '质量门已可继续。',
      state: blockedGateCount > 0 ? 'blocked' : waitingGateCount > 0 ? 'waiting' : 'ready',
      evidence: undefined,
    },
    {
      id: 'pr_dag',
      title: 'PR DAG',
      input: '产品计划、技术计划、依赖关系',
      output: `${plan.prNodes.length} 个 PR 节点，已选择 ${selectedNodeCount} 个执行`,
      detail: plan.prDagReview[0] || 'PR DAG 审核记录会约束执行顺序。',
      state: plan.prNodes.length && selectedNodeCount > 0 ? 'ready' : 'blocked',
      evidence: runsByStage.get('pr_dag'),
    },
    {
      id: 'prompt',
      title: 'Prompt 交接',
      input: 'Wiki、Skill、专家记录、质量门、PR 节点',
      output: '每个节点编译成 Coding Agent Prompt',
      detail: skillRuns.length
        ? `${skillRuns.length} 条专家运行记录会进入 Prompt 证据链。`
        : '生成计划后仍需确认专家运行记录和 Skill 证据。',
      state: skillRuns.length ? 'ready' : 'waiting',
      evidence: undefined,
    },
  ] satisfies Array<{
    id: string;
    title: string;
    input: string;
    output: string;
    detail: string;
    state: QualityGateState;
    evidence?: SpecForgeSkillRunDTO;
  }>;

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">专家计划 Kanban</CardTitle>
          <CardDescription>
            从需求到计划的中间产物按专家职责流转，最终汇总成 PR DAG 和 Coding Agent Prompt。
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {skillRunsLoading ? '检查专家记录' : `${skillRuns.length} 条专家记录`}
          </Badge>
          <Button type="button" variant="outline" size="sm" onClick={onInspectPrompt}>
            检查 Prompt
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 xl:grid-cols-5">
          {columns.map(column => (
            <div key={column.id} className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-text-main">{column.title}</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted">{column.input}</div>
                </div>
                <Badge variant="outline" className={qualityGateStateClassName(column.state)}>
                  {qualityGateStateLabel(column.state)}
                </Badge>
              </div>
              <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2">
                <div className="text-xs text-text-muted">输出</div>
                <div className="mt-1 text-sm font-medium leading-5 text-text-main">
                  {column.output}
                </div>
              </div>
              <p className="mt-3 line-clamp-4 text-xs leading-5 text-text-muted">{column.detail}</p>
              {column.evidence ? (
                <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
                  <div className="font-medium text-text-main">
                    {skillRunStageLabel(column.evidence.stage)} · {column.evidence.status}
                  </div>
                  <div className="mt-1 line-clamp-2">
                    {column.evidence.output_summary || '已记录专家产出。'}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
  repoWikiSummary,
  activeSkills,
  skillRuns,
  qualityGates,
  executionReadiness,
  selectedExecutor,
  isCompilingPrompt,
  onCompilePrompt,
}: {
  nodes: PRNode[];
  repositoryId: string;
  repoWikiSummary: string;
  activeSkills: SpecForgeSkillDTO[];
  skillRuns: SpecForgeSkillRunDTO[];
  qualityGates: QualityGateSummary[];
  executionReadiness: ExecutionReadiness;
  selectedExecutor: string;
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
  const promptReadyGateCount = qualityGates.filter(gate => gate.state === 'ready').length;
  const promptBlockedGateCount = qualityGates.filter(gate => gate.state === 'blocked').length;
  const attachedSkillNames = activeSkillNames(activeSkills);
  const promptSkillNames = Array.from(new Set([...attachedSkillNames, ...skillNamesFromRuns(skillRuns)]));
  const skillPromptContract = skillPromptContractSummary(skillRuns, activeSkillEvidenceRefs(activeSkills));
  const repoWikiReady = Boolean(repositoryId.trim() && repoWikiSummary.trim());

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
        'GitHub 交付控制需要 CodingCTO 后端、GitHub 连接和仓库权限可用。'
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
        '失败日志需要失败的 GitHub workflow 运行记录，以及 GitHub 访问权限。'
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
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-text-main">Prompt 契约概览</div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              每个 PR 节点会继承这些约束；编译单个节点时会展开为完整 Coding Agent Prompt。
            </p>
          </div>
          <Badge
            variant="outline"
            className={promptBlockedGateCount > 0 ? statusClassName('blocked') : statusClassName('completed')}
          >
            {promptBlockedGateCount > 0
              ? `${promptBlockedGateCount} 个质量门阻塞`
              : `${promptReadyGateCount}/${qualityGates.length} 个质量门就绪`}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <PromptContractMetric
            label="Repo Wiki"
            value={repoWikiReady ? '已进入证据链' : '待生成'}
            state={repoWikiReady ? 'ready' : 'waiting'}
          />
          <PromptContractMetric
            label="执行器"
            value={executorDisplayName(selectedExecutor)}
            state={executionReadiness.canDispatch ? 'ready' : 'waiting'}
          />
          <PromptContractMetric
            label="绑定 Skill"
            value={attachedSkillNames.length ? `${attachedSkillNames.length} 个` : '待绑定'}
            state={attachedSkillNames.length ? 'ready' : 'waiting'}
          />
          <PromptContractMetric
            label="专家记录"
            value={skillRuns.length ? `${skillRuns.length} 次` : '待生成'}
            state={skillRuns.length ? 'ready' : 'waiting'}
          />
          <PromptContractMetric
            label="Prompt 契约"
            value={skillPromptContractLabel(skillPromptContract.state)}
            state={skillPromptContractState(skillPromptContract.state)}
          />
          <PromptContractMetric
            label="质量门"
            value={
              promptBlockedGateCount > 0
                ? `${promptBlockedGateCount} 阻塞`
                : `${promptReadyGateCount}/${qualityGates.length} 就绪`
            }
            state={promptBlockedGateCount > 0 ? 'blocked' : 'ready'}
          />
        </div>
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
          {skillPromptContract.headline} {skillPromptContract.nextAction}
          {attachedSkillNames.length ? ` 已绑定：${attachedSkillNames.join('、')}。` : ''}
          {promptSkillNames.length ? ` Prompt 可用 Skill：${promptSkillNames.join('、')}。` : ''}
        </div>
      </div>
      <PromptAssemblyKanban
        repoWikiReady={repoWikiReady}
        repositoryId={repositoryId}
        activeSkillNames={attachedSkillNames}
        skillRunCount={skillRuns.length}
        promptSkillNames={promptSkillNames}
        qualityGates={qualityGates}
        executionReadiness={executionReadiness}
        selectedExecutor={selectedExecutor}
        nodes={effectiveNodes}
      />
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
            <CardDescription>
              选中 PR 节点的执行合同，包含专家证据、Skill 约束和质量门要求。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              <PromptContractMetric
                label="执行器"
                value={executorDisplayName(selectedExecutor)}
                state={executionReadiness.canDispatch ? 'ready' : 'waiting'}
              />
              <PromptContractMetric
                label="专家记录"
                value={skillRuns.length ? `${skillRuns.length} 次` : '待生成'}
                state={skillRuns.length ? 'ready' : 'waiting'}
              />
              <PromptContractMetric
                label="Skill 契约"
                value={skillPromptContractLabel(skillPromptContract.state)}
                state={skillPromptContractState(skillPromptContract.state)}
              />
              <PromptContractMetric
                label="质量门"
                value={
                  promptBlockedGateCount > 0
                    ? `${promptBlockedGateCount} 阻塞`
                    : `${promptReadyGateCount}/${qualityGates.length} 就绪`
                }
                state={promptBlockedGateCount > 0 ? 'blocked' : 'ready'}
              />
            </div>
            <pre className="max-h-96 overflow-auto rounded-lg border border-border-subtle bg-bg-subtle p-4 text-xs leading-5 text-text-main">
              {promptText}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function skillPromptContractLabel(state: ReturnType<typeof skillPromptContractSummary>['state']) {
  switch (state) {
    case 'ready':
      return '已完整';
    case 'partial':
      return '部分证据';
    default:
      return '待补充';
  }
}

function skillPromptContractState(
  state: ReturnType<typeof skillPromptContractSummary>['state']
): QualityGateState {
  switch (state) {
    case 'ready':
      return 'ready';
    case 'partial':
      return 'waiting';
    default:
      return 'blocked';
  }
}

function PromptAssemblyKanban({
  repoWikiReady,
  repositoryId,
  activeSkillNames,
  skillRunCount,
  promptSkillNames,
  qualityGates,
  executionReadiness,
  selectedExecutor,
  nodes,
}: {
  repoWikiReady: boolean;
  repositoryId: string;
  activeSkillNames: string[];
  skillRunCount: number;
  promptSkillNames: string[];
  qualityGates: QualityGateSummary[];
  executionReadiness: ExecutionReadiness;
  selectedExecutor: string;
  nodes: PRNode[];
}) {
  const blockedGateCount = qualityGates.filter(gate => gate.state === 'blocked').length;
  const readyGateCount = qualityGates.filter(gate => gate.state === 'ready').length;
  const testCommandCount = nodes.flatMap(node => node.testCommands).length;
  const expectedFileCount = nodes.flatMap(node => node.expectedFiles).length;
  const columns = [
    {
      id: 'evidence',
      title: '证据输入',
      detail: repoWikiReady
        ? `Repo Wiki 和仓库 ${repositoryId} 已进入证据链。`
        : '缺少 Repo Wiki 时，Prompt 只能使用有限仓库上下文。',
      state: repoWikiReady ? 'ready' : 'waiting',
      facts: [
        `仓库：${repositoryId || '未选择'}`,
        `PR 节点：${nodes.length}`,
        `预期文件：${expectedFileCount}`,
      ],
    },
    {
      id: 'skills',
      title: 'Skill 约束',
      detail: activeSkillNames.length
        ? `${activeSkillNames.length} 个 active skill 会先作为约束进入 Prompt。`
        : '还没有 active skill；Prompt 只能依赖计划和仓库证据。',
      state: activeSkillNames.length ? 'ready' : 'waiting',
      facts: [
        `已绑定：${activeSkillNames.length || 0}`,
        `Prompt 可用：${promptSkillNames.length || 0}`,
        `专家记录：${skillRunCount}`,
      ],
    },
    {
      id: 'scope',
      title: '任务范围',
      detail: '每个 PR 节点都会带上目标、non-goals、依赖、预期文件和测试命令。',
      state: nodes.length > 0 && expectedFileCount > 0 ? 'ready' : 'blocked',
      facts: [
        `节点：${nodes.length}`,
        `测试命令：${testCommandCount}`,
        `依赖节点：${nodes.filter(node => node.dependsOn.length > 0).length}`,
      ],
    },
    {
      id: 'quality',
      title: '质量门',
      detail:
        blockedGateCount > 0
          ? `${blockedGateCount} 个质量门会阻止正式派发。`
          : `${readyGateCount}/${qualityGates.length} 个质量门就绪。`,
      state: blockedGateCount > 0 ? 'blocked' : 'ready',
      facts: qualityGates.slice(0, 3).map(gate => `${gate.label}：${qualityGateStateLabel(gate.state)}`),
    },
    {
      id: 'handoff',
      title: '下发给 Codex',
      detail: executionReadiness.canDispatch
        ? `${executorDisplayName(selectedExecutor)} 可接收编译后的 Prompt。`
        : executionReadiness.reason,
      state: executionReadiness.canDispatch ? 'ready' : 'blocked',
      facts: [
        `执行器：${executorDisplayName(selectedExecutor)}`,
        `可调度 runtime：${executionReadiness.healthyRuntimeCount}`,
        executionReadiness.canDispatch ? '状态：可派发' : '状态：等待处理',
      ],
    },
  ] satisfies Array<{
    id: string;
    title: string;
    detail: string;
    state: QualityGateState;
    facts: string[];
  }>;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">Prompt 组装看板</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Coding Agent Prompt 不是一段自由文本，而是由证据、Skill、任务范围、质量门和执行器状态共同组装。
          </p>
        </div>
        <Badge variant="outline">Prompt Assembly</Badge>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        {columns.map(column => (
          <div key={column.id} className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{column.title}</div>
              <Badge variant="outline" className={qualityGateStateClassName(column.state)}>
                {qualityGateStateLabel(column.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{column.detail}</p>
            <div className="mt-3 space-y-1.5">
              {column.facts.map(fact => (
                <div
                  key={fact}
                  className="rounded-md border border-border-subtle bg-bg-surface px-2 py-1.5 text-xs leading-5 text-text-muted"
                >
                  {fact}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptContractMetric({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: QualityGateState;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={cn('mt-1 truncate text-sm font-medium', qualityGateStateClassName(state))}>
        {value}
      </div>
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
  approved,
  runtimeId,
  executor,
  isCancelling,
  onAdvance,
  onCancel,
  onExecutionBundle,
}: {
  run: ExecutionRun;
  approved: boolean;
  runtimeId?: string;
  executor: string;
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
  const activeTaskEventPolling =
    selectedTask?.status === 'running' || selectedTask?.processStatus === 'running' ? 2000 : false;
  const taskEventsQuery = useSpecForgeTaskEvents(selectedTaskId, undefined, {
    refetchInterval: activeTaskEventPolling,
  });
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
        <ExecutionHandoffPanel run={run} runtimeId={runtimeId} executor={executor} />
        <ExecutionLifecyclePanel approved={approved} run={run} />
        <ExecutionKanbanBoard tasks={run.tasks} onSelectTask={setSelectedTask} />
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
                  {task.processStatus && (
                    <Badge variant="outline" className={processStatusClassName(task.processStatus)}>
                      {processStatusLabel(task.processStatus)}
                    </Badge>
                  )}
                  {task.currentPhase && (
                    <Badge variant="outline">阶段：{task.currentPhase}</Badge>
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
              task.processRef ||
              task.sessionId ||
              task.workdir ||
              task.lastProgressAt ||
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

function ExecutionKanbanBoard({
  tasks,
  onSelectTask,
}: {
  tasks: PRNode[];
  onSelectTask: (task: PRNode) => void;
}) {
  const orderedTasks = tasks.slice().sort(taskSortValue);
  const columns = executionKanbanColumns.map(column => ({
    ...column,
    tasks: orderedTasks.filter(task => column.statuses.includes(task.status)),
  }));
  const totalTasks = orderedTasks.length;
  const activeColumn = columns.find(column => column.tasks.length > 0 && column.id !== 'done');
  const nextAction = activeColumn
    ? activeColumn.nextAction
    : totalTasks > 0
      ? '所有任务已到达完成列；下一步查看 PR、CI 和合并状态。'
      : '审批计划并启动执行后，PR 节点会按状态进入这个看板。';

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">执行进度看板</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            按 PR 节点观看任务从派发、Codex 执行、质量检查到 PR 交付的流转。
          </p>
        </div>
        <Badge variant="outline">{totalTasks} 个任务</Badge>
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
        {nextAction}
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-5">
        {columns.map(column => (
          <div key={column.id} className="min-h-48 rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-text-main">{column.title}</div>
                <div className="mt-1 text-xs leading-5 text-text-muted">{column.description}</div>
              </div>
              <Badge
                variant="outline"
                className={column.tasks.length > 0 ? statusClassName(column.badgeStatus) : ''}
              >
                {column.tasks.length}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {column.tasks.length === 0 ? (
                <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface px-3 py-4 text-xs leading-5 text-text-muted">
                  暂无任务。
                </div>
              ) : (
                column.tasks.map(task => (
                  <ExecutionKanbanCard
                    key={`${task.id}-${task.taskId ?? 'kanban'}`}
                    task={task}
                    onSelect={() => onSelectTask(task)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const executionKanbanColumns: Array<{
  id: string;
  title: string;
  description: string;
  statuses: PRNode['status'][];
  badgeStatus: PRNode['status'];
  nextAction: string;
}> = [
  {
    id: 'pending',
    title: '待派发',
    description: '计划已拆解，等待审批、依赖或后端任务创建。',
    statuses: ['planned', 'waiting_on_dependencies', 'queued'],
    badgeStatus: 'queued',
    nextAction: '先处理审批、依赖和质量门；就绪后平台会把任务派发给 runtime。',
  },
  {
    id: 'running',
    title: 'Codex 执行中',
    description: 'runtime 已领取或正在运行本地 coding agent。',
    statuses: ['running'],
    badgeStatus: 'running',
    nextAction: '查看任务事件、runtime claim、进程状态和最后进展时间。',
  },
  {
    id: 'quality',
    title: '质量 / PR',
    description: '任务已进入分支、PR、CI 或评审准备阶段。',
    statuses: ['pr_opened', 'ci_running', 'ready_for_review'],
    badgeStatus: 'ready_for_review',
    nextAction: '检查 CI、评审和 PR 链接；失败时进入阻塞列并发起修复。',
  },
  {
    id: 'blocked',
    title: '阻塞',
    description: '失败、取消或关闭，需要重试、修复或人工决策。',
    statuses: ['blocked', 'failed', 'cancelled', 'closed'],
    badgeStatus: 'failed',
    nextAction: '打开事件和诊断，重试失败任务或回到计划页调整 PR DAG。',
  },
  {
    id: 'done',
    title: '已完成',
    description: '任务完成或已合并，等待交付证据汇总。',
    statuses: ['completed', 'merged'],
    badgeStatus: 'completed',
    nextAction: '查看交付证据、PR 状态和测试报告。',
  },
];

function ExecutionKanbanCard({ task, onSelect }: { task: PRNode; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-md border border-border-subtle bg-bg-surface p-3 text-left transition-colors hover:border-primary/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-primary">{task.nodeKey}</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-text-main">
            {task.title}
          </div>
        </div>
        <Badge variant="outline" className={statusClassName(task.status)}>
          {statusLabel[task.status]}
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {task.taskId && <Badge variant="outline">#{task.taskId}</Badge>}
        {task.executor && <Badge variant="outline">{executorDisplayName(task.executor)}</Badge>}
        {task.attemptNumber && <Badge variant="outline">第 {task.attemptNumber} 次</Badge>}
      </div>
      <div className="mt-2 space-y-1 text-xs leading-5 text-text-muted">
        {task.dependsOn.length > 0 && <div>依赖：{task.dependsOn.join('、')}</div>}
        {task.runtimeId && <div className="truncate">Runtime：{task.runtimeId}</div>}
        {task.currentPhase && <div>阶段：{task.currentPhase}</div>}
        {task.failureReason && <div className="line-clamp-2 text-warning">失败：{task.failureReason}</div>}
      </div>
    </button>
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

function ExecutionHandoffPanel({
  run,
  runtimeId,
  executor,
}: {
  run: ExecutionRun;
  runtimeId?: string;
  executor: string;
}) {
  const summary = executionHandoffSummary(run);
  const pendingTasksQuery = useSpecForgeRuntimePendingTasks(runtimeId, executor);
  const pendingTasks = pendingTasksQuery.data?.tasks ?? [];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">Codex 调度交接</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{summary.headline}</p>
        </div>
        <Badge variant="outline" className={executionHandoffStateClassName(summary.state)}>
          {executionHandoffStateLabel(summary.state)}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualMetric label="PR 节点" value={String(summary.totalTasks)} />
        <ManualMetric label="后端任务" value={String(summary.backendTaskCount)} />
        <ManualMetric label="Runtime claim" value={String(summary.claimedTaskCount)} />
        <ManualMetric label="进程问题" value={String(summary.processProblemCount)} />
      </div>
      <div className="mt-3 rounded-md bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
        {summary.nextAction}
      </div>
      <FormalPendingTaskPreview
        runtimeId={runtimeId}
        tasks={pendingTasks}
        isLoading={pendingTasksQuery.isLoading}
        isError={pendingTasksQuery.isError}
      />
    </div>
  );
}

function FormalPendingTaskPreview({
  runtimeId,
  tasks,
  isLoading,
  isError,
}: {
  runtimeId?: string;
  tasks: SpecForgeExecutionBundleDTO['tasks'];
  isLoading: boolean;
  isError: boolean;
}) {
  return (
    <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-text-main">正式任务领取预览</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            这里只显示计划审批后派发给当前 runtime 的 PR 节点任务，不包含只读 direct proof。
          </p>
        </div>
        <Badge variant="outline" className={tasks.length ? 'text-info' : 'text-text-muted'}>
          {isLoading ? '检查中' : `${tasks.length} 个可领取`}
        </Badge>
      </div>
      {!runtimeId ? (
        <div className="mt-2 text-xs leading-5 text-warning">
          还没有可用 runtime。启动 ccto 后，这里会显示正式 PR 节点任务是否可领取。
        </div>
      ) : isError ? (
        <div className="mt-2 text-xs leading-5 text-warning">
          后端暂时没有返回领取预览；正式执行仍可通过运行事件验证。
        </div>
      ) : tasks.length ? (
        <div className="mt-3 space-y-2">
          {tasks.slice(0, 5).map(task => (
            <div
              key={task.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-bg-surface px-3 py-2 text-xs"
            >
              <div className="min-w-0">
                <div className="font-medium text-text-main">任务 #{task.id}</div>
                <div className="mt-1 text-text-muted">
                  PR node #{task.pr_node_id} · {task.executor}
                </div>
              </div>
              <Badge variant="outline" className={statusClassName(task.status)}>
                {task.status}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-xs leading-5 text-text-muted">
          当前没有正式 PR 节点任务在等待这个 runtime。审批并启动计划后，后端任务会先出现在这里，再被 runtime claim。
        </div>
      )}
    </div>
  );
}

function ExecutionLifecyclePanel({
  approved,
  run,
}: {
  approved: boolean;
  run: ExecutionRun;
}) {
  const steps = executionLifecycleSteps({ approved, run });

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-text-main">执行生命周期</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            启动后按这个顺序排查：计划审批、任务派发、runtime 领取、事件日志、PR 回流和失败恢复。
          </p>
        </div>
        <Badge variant="outline">{executionRunStatusLabel(run.status)}</Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {steps.map(step => (
          <div key={step.id} className="rounded-md border border-border-subtle bg-bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{step.label}</div>
              <Badge variant="outline" className={executionLifecycleStateClassName(step.state)}>
                {executionLifecycleStateLabel(step.state)}
              </Badge>
            </div>
            <p className="mt-2 text-xs leading-5 text-text-muted">{step.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function executionHandoffStateLabel(state: ExecutionHandoffState) {
  switch (state) {
    case 'dispatched':
      return '已派发';
    case 'waiting_claim':
      return '等待领取';
    case 'claimed':
      return '已领取';
    case 'blocked':
      return '需处理';
    case 'completed':
      return '已完成';
    default:
      return '未启动';
  }
}

function executionHandoffStateClassName(state: ExecutionHandoffState) {
  switch (state) {
    case 'claimed':
    case 'completed':
      return 'text-success';
    case 'dispatched':
    case 'waiting_claim':
      return 'text-info';
    case 'blocked':
      return 'text-error';
    default:
      return 'text-text-muted';
  }
}

function executionLifecycleStateLabel(state: ExecutionLifecycleState) {
  switch (state) {
    case 'ready':
      return '就绪';
    case 'active':
      return '进行中';
    case 'blocked':
      return '需处理';
    default:
      return '等待';
  }
}

function executionLifecycleStateClassName(state: ExecutionLifecycleState) {
  switch (state) {
    case 'ready':
      return 'text-success';
    case 'active':
      return 'text-info';
    case 'blocked':
      return 'text-error';
    default:
      return 'text-text-muted';
  }
}

function TaskDiagnostics({ task }: { task: PRNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
      {task.processRef && <div>进程引用：{task.processRef}</div>}
      {task.lastProgressAt && <div>最后进展：{formatTimestamp(task.lastProgressAt)}</div>}
      {task.sessionId && <div>会话：{task.sessionId}</div>}
      {task.workdir && <div className="truncate">工作目录：{task.workdir}</div>}
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
  const eventSummary = summarizeTaskEvents(events);
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
        <Badge
          variant="outline"
          className={eventSummary.hasExecutorResult ? 'text-success' : events.length ? 'text-info' : ''}
        >
          {eventSummary.proofLabel}
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualMetric
          label="Runtime claim"
          value={eventSummary.hasRuntimeClaim ? '有' : '无'}
        />
        <ManualMetric
          label="执行结果"
          value={eventSummary.hasExecutorResult ? '有' : '无'}
        />
        <ManualMetric label="输出事件" value={String(eventSummary.outputEventCount)} />
        <ManualMetric label="最后事件" value={eventSummary.lastEventLabel} />
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
