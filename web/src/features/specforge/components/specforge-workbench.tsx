'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/utils';
import {
  executionRunFromDTO,
  planBundleFromDTO,
  prNodeFromDTO,
} from '@/features/specforge/plan-adapter';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';
import {
  defaultIdea,
  demoPlan,
  demoRuntimes,
  demoRuntimeNow,
} from '@/features/specforge/mock-data';
import { runtimeFromDTO, summarizeRuntimeHealth } from '@/features/specforge/runtime-health';
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
import type {
  CompilePromptPayload,
  SpecForgeFixAttemptDTO,
  SpecForgeEscalationSummaryDTO,
  SpecForgeExecutionBundleDTO,
  GitHubWebhookEventDTO,
  SpecForgePRNodeFailureLogDTO,
  SpecForgeRepoArchitectureStatusDTO,
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
  blocked: '阻塞',
  merged: '已合并',
  closed: '已关闭',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
const runStatusLabel: Partial<Record<ExecutionRun['status'], string>> = {
  idle: '尚未开始',
  queued: '排队中',
  running: '执行中',
  blocked: '阻塞',
  completed: '已完成',
  cancelled: '已取消',
};
const genericStatusLabel: Record<string, string> = {
  pending: '待运行',
  online: '在线',
  offline: '离线',
  unstable: '不稳定',
  success: '成功',
  succeeded: '成功',
  failure: '失败',
  failed: '失败',
  queued: '排队中',
  running: '执行中',
  completed: '已完成',
  cancelled: '已取消',
  blocked: '阻塞',
};
const maxFixAttemptsPerNode = 3;
type PromptMode = NonNullable<CompilePromptPayload['type']>;
const promptModes: PromptMode[] = ['implementation', 'fix', 'review_patch'];
const promptModeLabel: Record<PromptMode, string> = {
  implementation: '实现',
  fix: '修复',
  review_patch: '评审修订',
};

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

function displayStatus(status: string) {
  return (
    statusLabel[status as PRNode['status']] ??
    runStatusLabel[status as ExecutionRun['status']] ??
    genericStatusLabel[status] ??
    status.replaceAll('_', ' ')
  );
}

function repoProfileSourceLabel(source: string) {
  switch (source) {
    case 'github_tree':
      return 'GitHub 目录';
    case 'request_hints':
      return '需求线索';
    case 'manual':
      return '手动画像';
    case 'demo':
      return '演示画像';
    default:
      return '未知来源';
  }
}

function formatTimestamp(value: string) {
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return value;
  }
  return time.toLocaleString();
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
}

export function SpecForgeWorkbench({
  projectId,
  initialRepositoryId,
  projectLabel,
  repositoryLocked = false,
}: SpecForgeWorkbenchProps = {}) {
  const searchParams = useSearchParams();
  const initialRepoId = initialRepositoryId?.trim() || demoPlan.repoProfile.repositoryId;
  const repoIdFromURL = searchParams.get('repo_id')?.trim();
  const [idea, setIdea] = useState(defaultIdea);
  const [repoIdOverride, setRepoIdOverride] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<PlanBundle>(() =>
    demoPlanForInput(defaultIdea, initialRepoId)
  );
  const activePlanRef = useRef(activePlan);
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, string>>(() =>
    defaultDecisionOverrides(demoPlan)
  );
  const [selectedExecutionNodeIds, setSelectedExecutionNodeIds] = useState<string[]>(() =>
    demoPlan.prNodes.map(node => node.id)
  );
  const [planSource, setPlanSource] = useState<'api' | 'demo'>('demo');
  const [hasPlan, setHasPlan] = useState(true);
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<ExecutionRun>({
    status: 'idle',
    selectedPRNodeIds: [],
    tasks: demoPlan.prNodes,
  });
  const [selectedWorkItem, setSelectedWorkItem] = useState<
    'intake' | 'plan' | 'dag' | 'run' | 'context'
  >('intake');
  const [currentRuntimeNow] = useState(() => Date.now());
  const connectedRepositoriesQuery = useGitHubRepositories({ workspace_id: 'default' });
  const connectedRepositories = useMemo(
    () => connectedRepositoriesQuery.data?.repositories ?? [],
    [connectedRepositoriesQuery.data?.repositories]
  );
  const repoId =
    repoIdOverride ||
    initialRepositoryId?.trim() ||
    repoIdFromURL ||
    connectedRepositories[0]?.repository_id ||
    demoPlan.repoProfile.repositoryId;
  const selectedGitHubRepository = connectedRepositories.find(
    repository => repository.repository_id === repoId.trim()
  );

  const createIdea = useCreateSpecForgeIdea(repoId.trim());
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
  const readyCount = run.tasks.filter(task => isPRNodeDelivered(task.status)).length;
  const runningCount = run.tasks.filter(task => isPRNodeActive(task.status)).length;
  const runtimesQuery = useSpecForgeRuntimes({ limit: 20 });
  const runtimeDTOs = runtimesQuery.data?.runtimes;
  const runtimes = useMemo(() => {
    if (runtimeDTOs?.length) {
      return runtimeDTOs.map(runtimeFromDTO);
    }
    return demoRuntimes;
  }, [runtimeDTOs]);
  const runtimeNow = runtimeDTOs?.length ? currentRuntimeNow : demoRuntimeNow;
  const runtimeSummary = useMemo(
    () => summarizeRuntimeHealth(runtimes, runtimeNow),
    [runtimes, runtimeNow]
  );

  const progressText = useMemo(() => {
    if (run.status === 'idle') {
      return runtimeSummary.online > 0
        ? '等待方案审批；已有健康执行器可用'
        : '等待方案审批；暂无健康执行器在线';
    }
    return `${readyCount} / ${run.tasks.length} 个 PR 节点已就绪或已合并`;
  }, [readyCount, run.status, run.tasks.length, runtimeSummary.online]);

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

  async function generatePlan() {
    const trimmedIdea = idea.trim();
    const trimmedRepoId = repoId.trim();
    if (!trimmedIdea || !trimmedRepoId) {
      return;
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
    } catch {
      const fallbackPlan = demoPlanForInput(trimmedIdea, trimmedRepoId);
      setActivePlan(fallbackPlan);
      setDecisionOverrides(defaultDecisionOverrides(fallbackPlan));
      setSelectedExecutionNodeIds(fallbackPlan.prNodes.map(node => node.id));
      setPlanSource('demo');
      setHasPlan(true);
      setRun({ status: 'idle', selectedPRNodeIds: [], tasks: fallbackPlan.prNodes });
    }
  }

  function resetIdea() {
    const defaultRepository = connectedRepositories[0];
    const resetRepoId =
      initialRepositoryId?.trim() ||
      repoIdFromURL ||
      defaultRepository?.repository_id ||
      demoPlan.repoProfile.repositoryId;
    setIdea(defaultIdea);
    setRepoIdOverride(resetRepoId);
    const resetPlan = demoPlanForInput(defaultIdea, resetRepoId);
    resetPlan.repoProfile.defaultBranch =
      defaultRepository?.default_branch ?? resetPlan.repoProfile.defaultBranch;
    setActivePlan(resetPlan);
    setDecisionOverrides(defaultDecisionOverrides(resetPlan));
    setSelectedExecutionNodeIds(resetPlan.prNodes.map(node => node.id));
    setPlanSource('demo');
    setHasPlan(true);
    setApproved(false);
    setRun({ status: 'idle', selectedPRNodeIds: [], tasks: resetPlan.prNodes });
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
            pr_node_ids: selectedPRNodeIDs,
          },
        });
        const dispatched = await dispatchRun.mutateAsync({
          runId: started.run.id,
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
    return `Prompt type: ${mode}\n\n${buildPromptPreview(activePlan, node)}`;
  }

  const deliveryStages = [
    {
      id: 'intake',
      title: '需求录入',
      tone: 'bg-bg-surface',
      emptyLabel: '等待需求',
      items: [
        {
          id: 'intake' as const,
          key: 'IDEA',
          title: '录入产品意图',
          description: '描述功能目标、约束条件和验收边界。',
          status: idea.trim() ? '可生成方案' : '需要输入',
          icon: Sparkles,
        },
      ],
    },
    {
      id: 'context',
      title: '仓库上下文',
      tone: 'bg-bg-subtle/70',
      emptyLabel: '未选择仓库',
      items: [
        {
          id: 'context' as const,
          key: 'CTX',
          title: '分析仓库和技能',
          description: `${activePlan.repoProfile.stack.slice(0, 3).join(', ')} · ${repoId}`,
          status: planSource === 'api' ? 'API 上下文' : '演示兜底',
          icon: GitBranch,
        },
      ],
    },
    {
      id: 'planning',
      title: '方案规划',
      tone: 'bg-warning-subtle',
      emptyLabel: '尚未生成方案',
      items: [
        {
          id: 'plan' as const,
          key: 'PLAN',
          title: '审批产品和技术方案',
          description: `${activePlan.prNodes.length} 个 PR 节点 · 一次审批检查点`,
          status: approved ? '已审批' : '待评审',
          icon: ScrollText,
        },
        {
          id: 'dag' as const,
          key: 'PROMPT',
          title: '编译 PR DAG 和提示词',
          description: '检查依赖、文件范围、测试和提示词契约。',
          status: `${activePlan.prNodes.length} 个节点`,
          icon: GitMerge,
        },
      ],
    },
    {
      id: 'execution',
      title: '执行',
      tone: 'bg-success-subtle',
      emptyLabel: '尚未开始执行',
      items: [
        {
          id: 'run' as const,
          key: 'RUN',
          title: '运行 Codex 并交付 PR',
          description: progressText,
          status: displayStatus(run.status),
          icon: Play,
        },
      ],
    },
    {
      id: 'delivery',
      title: 'PR 交付',
      tone: 'bg-info-subtle',
      emptyLabel: '执行后 PR 会出现在这里',
      items: [],
    },
    {
      id: 'blocked',
      title: '需要决策',
      tone: 'bg-error-subtle',
      emptyLabel: '暂无升级事项',
      items: [],
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-surface">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-base font-semibold">项目指挥中心</h1>
            <p className="text-xs text-text-muted">
              {projectLabel ? `${projectLabel} · ` : ''}从需求到方案、提示词、Codex 执行和 PR 交付
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{runningCount} 个运行中任务</Badge>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('context')}>
            分析仓库
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('plan')}>
            手动方案
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('dag')}>
            流水线
          </Button>
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
        <Button
          variant={selectedWorkItem === 'intake' || selectedWorkItem === 'context' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setSelectedWorkItem('intake')}
        >
          全部工作
        </Button>
        <Button
          variant={selectedWorkItem === 'plan' || selectedWorkItem === 'dag' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setSelectedWorkItem('plan')}
        >
          方案
        </Button>
        <Button
          variant={selectedWorkItem === 'run' ? 'secondary' : 'outline'}
          size="sm"
          onClick={() => setSelectedWorkItem('run')}
        >
          执行
        </Button>
      </div>

      <section className="grid min-h-0 flex-1 grid-rows-[minmax(360px,1fr)_minmax(340px,42vh)] overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-1">
        <div className="min-w-0 overflow-x-auto p-3">
          <div className="grid h-full min-w-[1320px] grid-cols-6 gap-3">
            {deliveryStages.map(column => (
              <div key={column.id} className={cn('flex min-h-0 flex-col rounded-xl p-3', column.tone)}>
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
                    <div className="flex h-40 items-center justify-center text-sm text-text-muted">
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
                          <div className="mt-2 text-sm font-semibold leading-5">{item.title}</div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                            {item.description}
                          </p>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="rounded-full bg-muted px-2 py-1 text-text-subtle">
                              {item.status}
                            </span>
                            <span className="text-text-muted">当前</span>
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

        <aside className="min-h-0 overflow-y-auto border-t border-border-subtle bg-bg-subtle/60 p-4 xl:border-l xl:border-t-0">
          {selectedWorkItem === 'intake' && (
            <DetailPanel title="IDEA" heading="录入产品意图">
              <div className="space-y-4">
                <Textarea
                  value={idea}
                  onChange={event => setIdea(event.target.value)}
                  className="min-h-40 bg-bg-surface"
                  aria-label="描述要让 CodingCTO 拆成可评审 PR 的功能"
                  placeholder="描述产品目标、约束条件和实现边界..."
                />
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="specforge-repository">目标仓库</Label>
                    {selectedGitHubRepository ? (
                      <Badge
                        variant="outline"
                        className="border-success/30 bg-success-subtle text-success"
                      >
                        GitHub 已连接
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning-subtle text-warning"
                      >
                        未验证
                      </Badge>
                    )}
                  </div>
                  {connectedRepositories.length > 0 && !repositoryLocked ? (
                    <select
                      id="specforge-repository"
                      value={repoId}
                      onChange={event => setRepoIdOverride(event.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-bg-surface px-3 text-sm text-text-main outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                    >
                      {connectedRepositories.map(repository => (
                        <option key={repository.repository_id} value={repository.repository_id}>
                          {repository.github_owner}/{repository.github_repo} ·{' '}
                          {repository.default_branch}
                        </option>
                      ))}
                      {!selectedGitHubRepository && repoId.trim() ? (
                        <option value={repoId.trim()}>{repoId.trim()} · 手动输入</option>
                      ) : null}
                    </select>
                  ) : (
                    <Input
                      id="specforge-repository"
                      value={repoId}
                      onChange={event => setRepoIdOverride(event.target.value)}
                      aria-label="仓库 ID"
                      placeholder="先在设置中连接 GitHub 仓库"
                      disabled={repositoryLocked}
                      className="bg-bg-surface"
                    />
                  )}
                  <p className="text-xs leading-5 text-text-muted">
                    {selectedGitHubRepository
                      ? `后续拆分、分支、提交和 PR 都会在 ${selectedGitHubRepository.github_owner}/${selectedGitHubRepository.github_repo} 下执行。`
                      : connectedRepositoriesQuery.isLoading
                        ? '正在读取已连接仓库...'
                        : '还没有已连接仓库时，可以先去设置页安装 GitHub App 并保存仓库。'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={generatePlan}
                    disabled={
                      !idea.trim() ||
                      !repoId.trim() ||
                      createIdea.isPending ||
                      createProjectIdea.isPending
                    }
                  >
                    {createIdea.isPending || createProjectIdea.isPending
                      ? '正在生成方案'
                      : '生成实现方案'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={resetIdea}>
                    重置
                  </Button>
                </div>
              </div>
            </DetailPanel>
          )}

          {selectedWorkItem === 'context' && (
            <DetailPanel title="仓库上下文" heading="仓库分析和技能">
              <div className="space-y-4">
                <RepoProfileSummary
                  repoId={repoId.trim()}
                  repoProfile={activePlan.repoProfile}
                  planSource={planSource}
                  onProfileSaved={profile => {
                    setActivePlan(current => ({
                      ...current,
                      repoProfile: profile,
                    }));
                  }}
                />
                <RepoSkillsPanel repoId={repoId.trim()} projectId={projectId} />
                <GitHubWebhookEventsPanel />
              </div>
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && hasPlan && (
            <DetailPanel title="方案" heading="评审并批准方案">
              <PlanReview
                plan={activePlan}
                decisionOverrides={decisionOverrides}
                selectedExecutionNodeIds={selectedExecutionNodeIds}
                approved={approved}
                isStarting={isStartingRun}
                onDecisionOverrideChange={(key, value) =>
                  setDecisionOverrides(current => ({ ...current, [key]: value }))
                }
                onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
                onApprove={approveAndStart}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && hasPlan && (
            <DetailPanel title="提示词" heading="PR DAG 和提示词契约">
              <PRDag
                nodes={activePlan.prNodes}
                repositoryId={activePlan.repoProfile.repositoryId}
                isCompilingPrompt={compilePrompt.isPending}
                onCompilePrompt={compileNodePrompt}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'run' && (
            <DetailPanel title="执行" heading="执行和 PR 交付">
              <div className="space-y-4">
                <RunSummary progressText={progressText} approved={approved} run={run} />
                <RuntimeReadiness
                  onlineCount={runtimeSummary.online}
                  recentlyLostCount={runtimeSummary.recently_lost}
                  runtimes={runtimes}
                  isLoading={runtimesQuery.isLoading}
                  isFallback={Boolean(runtimesQuery.isError || !runtimeDTOs?.length)}
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

function RuntimeReadiness({
  onlineCount,
  recentlyLostCount,
  runtimes,
  isLoading,
  isFallback,
}: {
  onlineCount: number;
  recentlyLostCount: number;
  runtimes: ExecutorRuntime[];
  isLoading: boolean;
  isFallback: boolean;
}) {
  const sweepRuntimes = useSweepSpecForgeRuntimes();
  const sweepTasks = useSweepSpecForgeTasks();
  const [maintenanceMessage, setMaintenanceMessage] = useState('');

  async function sweepRuntimeHeartbeats() {
    setMaintenanceMessage('');
    try {
      const result = await sweepRuntimes.mutateAsync({ stale_seconds: 300 });
      setMaintenanceMessage(
        `已将 ${result.offline_runtimes.length} 个执行器标记为离线，并将 ${result.failed_tasks.length} 个任务标记为失败。`
      );
    } catch {
      setMaintenanceMessage('清理执行器需要 CodingCTO 后端在线。');
    }
  }

  async function sweepStaleExecutionTasks() {
    setMaintenanceMessage('');
    try {
      const result = await sweepTasks.mutateAsync({
        dispatch_timeout_seconds: 900,
        running_timeout_seconds: 3600,
      });
      setMaintenanceMessage(`已将 ${result.failed_tasks.length} 个超时任务标记为失败。`);
    } catch {
      setMaintenanceMessage('清理任务需要 CodingCTO 后端在线。');
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
              {isLoading
                ? '正在检查本地执行器心跳。'
                : onlineCount > 0
                  ? '方案批准后可以派发给健康的本地执行器。'
                  : '需要等到本地执行器上线后才能开始执行。'}
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
              演示兜底
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          {runtimes.slice(0, 3).map(runtime => (
            <div
              key={runtime.runtimeId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{runtime.runtimeId}</div>
                <div className="text-xs text-text-muted">
                  {runtime.executor}
                  {runtime.hostname ? ` · ${runtime.hostname}` : ''}
                </div>
              </div>
              <Badge variant="outline">{displayStatus(runtime.status)}</Badge>
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
            {sweepRuntimes.isPending ? '清理中' : '清理执行器'}
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

function RepoProfileSummary({
  repoId,
  repoProfile,
  planSource,
  onProfileSaved,
}: {
  repoId: string;
  repoProfile: RepoProfile;
  planSource: 'api' | 'demo';
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
          {planSource === 'api' ? 'API 方案' : '演示兜底'}
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
              <span>{warning}</span>
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
        aria-label="代码规范"
        placeholder="代码规范"
      />
      <Input
        value={riskAreas}
        onChange={event => setRiskAreas(event.target.value)}
        aria-label="风险区域"
        placeholder="风险区域：auth, migrations"
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
            ? '需要启动 CodingCTO 后端才能保存仓库画像。'
            : '仓库画像会用于方案规划、PR DAG 和提示词编译。'}
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
        ? '架构快照最新'
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
          <span>生成快照后，方案规划前的仓库分析会更可追溯。</span>
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
  const [name, setName] = useState('仓库编码指南');
  const [description, setDescription] = useState('注入 CodingCTO 提示词的仓库级说明。');
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
            保存仓库说明，用于方案规划、提示词编译和项目技能运行。
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
          placeholder="例如：数据访问走 service 层，API route 保持轻量，UI PR 前运行 pnpm type-check。"
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
            CodingCTO 后端可用后即可保存技能。
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
            还没有记录 Webhook 事件。
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
            {approved ? '方案已批准' : '需要批准方案'}
          </Badge>
          <Badge
            variant="outline"
            className={
              run.status === 'running' || run.status === 'blocked'
                ? statusClassName(run.status)
                : ''
            }
          >
            {run.status === 'idle' ? '尚未开始执行' : displayStatus(run.status)}
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
              {blockedNode.nodeKey} 阻塞
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
  onDecisionOverrideChange,
  onExecutionNodeSelectionChange,
  onApprove,
}: {
  plan: PlanBundle;
  decisionOverrides: Record<string, string>;
  selectedExecutionNodeIds: string[];
  approved: boolean;
  isStarting: boolean;
  onDecisionOverrideChange: (key: string, value: string) => void;
  onExecutionNodeSelectionChange: (nodeIds: string[]) => void;
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
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">产品理解</CardTitle>
          <CardDescription>执行前确认默认规则和验收标准。</CardDescription>
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
          <ListBlock title="方案假设" items={planAssumptions} />
          <SkillPipelinePanel
            skillRuns={skillRuns}
            isLoading={skillRunsQuery.isLoading}
            isOffline={skillRunsQuery.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">技术方案</CardTitle>
          <CardDescription>{implementationPlan.technicalSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="影响范围" items={implementationPlan.affectedAreas} />
          <ListBlock title="PR DAG 评审" items={plan.prDagReview} />
          <ExecutionRangeSelector
            nodes={plan.prNodes}
            selectedNodeIds={selectedExecutionNodeIds}
            disabled={approved || isStarting}
            onChange={onExecutionNodeSelectionChange}
          />
          <ListBlock title="执行范围评审" items={executionRangeNotes} />
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
          <Button
            onClick={onApprove}
            disabled={
              approved || isStarting || !approvalReadiness.canApprove || !canStartSelectedRange
            }
            className="w-full justify-center"
          >
            {approved ? '已批准' : isStarting ? '正在启动' : '批准并启动'}
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
          output_summary: 'API 生成方案后会记录产品理解。',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 1,
          stage: 'technical_plan',
          status: 'pending',
          input_summary: '',
          output_summary: 'API 生成方案后会在这里展示技术规划记录。',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          stage: 'pr_dag',
          status: 'pending',
          input_summary: '',
          output_summary: 'PR DAG 生成过程会作为技能运行记录。',
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
          {isLoading ? '检查中' : skillRuns.length > 0 ? `${skillRuns.length} 次运行` : '待运行'}
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
              {displayStatus(run.status)}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
              {run.output_summary || '尚未记录输出。'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function skillRunStageLabel(stage: string) {
  const labels: Record<string, string> = {
    product_plan: '产品方案',
    technical_plan: '技术方案',
    pr_dag: 'PR DAG',
    self_review: '自检评审',
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
            <div>
              <div className="text-sm font-medium">
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
          <li key={item} className="flex gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-primary" />
            <span>{item}</span>
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
      setDeliveryError('GitHub 交付需要已保存的仓库和 PR 节点。');
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
        'GitHub 交付操作需要 CodingCTO 后端在线，并完成 GitHub App 配置。'
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
        likely_cause: 'CI 诊断需要这个 PR 节点存在 GitHub workflow run。',
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
      setFailureLogError('读取失败日志需要先选择 PR 节点和仓库。');
      return;
    }

    const prNodeId = Number(selectedFixNode.id);
    if (!Number.isFinite(prNodeId) || prNodeId <= 0) {
      setFailureLogError('读取失败日志需要已保存的 PR 节点。');
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
        '读取失败日志需要失败的 GitHub workflow run，以及 GitHub App 访问权限。'
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
            每个 PR 节点最多自动修复 {maxFixAttemptsPerNode} 次；超过后 CodingCTO 会生成决策摘要并升级处理。
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
                    {node.estimatedRisk === 'high'
                      ? '高风险'
                      : node.estimatedRisk === 'medium'
                        ? '中风险'
                        : '低风险'}
                  </Badge>
                  {node.githubPrUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={node.githubPrUrl} target="_blank" rel="noreferrer">
                        PR #{node.githubPrNumber ?? '已创建'}
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
                <div className="font-medium text-text-main">自动修复次数</div>
                <div className="mt-1 text-text-muted">
                  已使用 {highestFixAttempt} / {maxFixAttemptsPerNode} 次
                  {fixBudgetExhausted
                    ? '；继续重试前需要先生成决策摘要。'
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
                {fixAttemptsQuery.isLoading ? '正在检查 CI 诊断。' : '还没有修复尝试。'}
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
                    <Badge variant="outline">{displayStatus(attempt.status)}</Badge>
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
                CodingCTO 后端可用后会加载实时修复尝试。
              </p>
            )}
            {escalationSummaryQuery.isError && (
              <p className="text-xs leading-5 text-text-muted">
                升级摘要需要 CodingCTO 后端在线。
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
      setTaskActionError('重试需要已保存的后端任务。');
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
        '只有失败或取消的任务可以重试；因依赖关闭的任务需要重新调整方案。'
      );
    } finally {
      setTaskActionId(undefined);
    }
  }

  async function completeExecutionTask(task: PRNode) {
    if (!task.taskId) {
      setTaskActionError('完成任务需要已保存的后端任务。');
      return;
    }

    setTaskActionError('');
    setTaskActionId(task.taskId);
    try {
      const bundle = await completeTask.mutateAsync(task.taskId);
      onExecutionBundle(bundle);
    } catch {
      setTaskActionError(
        '只有已派发或执行中的任务可以完成，并且需要 CodingCTO 后端在线。'
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
            交付状态按 PR 节点组织，而不是按单个智能体工作进程组织。
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
            这次运行正在等待决策。可以用新会话重试失败或取消的任务；如果 PR DAG 需要重新规划，也可以取消运行。
            {blockedRecoverableTasks.length > 0 && (
              <span className="ml-1 font-medium text-text-main">
                {blockedRecoverableTasks.length} 个任务可以重试。
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
                  {task.executor && <Badge variant="outline">{task.executor}</Badge>}
                  {task.attemptNumber && (
                    <Badge variant="outline">第 {task.attemptNumber} 次</Badge>
                  )}
                  {task.taskId && <Badge variant="outline">task #{task.taskId}</Badge>}
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
                    : '完成'}
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
                setTaskActionError('评审修订需要已保存的后端任务。');
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
                  '评审修订需要任务处于已完成、失败或已取消状态，并且 CodingCTO 后端在线。'
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
        还没有选择要执行的 PR 节点。
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-main">
        <GitMerge className="h-4 w-4 text-primary" />
        交付图
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
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
      {task.outputLog && <div className="mt-1 truncate">输出：{task.outputLog}</div>}
      {task.errorLog && <div className="mt-1 truncate">错误：{task.errorLog}</div>}
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
        {failureLog.log_excerpt || '没有返回日志摘录。'}
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
            CodingCTO 后端可用后会加载实时任务事件。
          </div>
        )}
        {!task.taskId && (
          <div className="text-sm text-text-muted">
            实时任务事件需要已派发的后端任务。
          </div>
        )}
        {task.taskId && !isLoading && !isError && events.length === 0 && (
          <div className="text-sm text-text-muted">还没有记录任务事件。</div>
        )}
        {events.map(event => (
          <TaskEventRow key={event.id} event={event} />
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3">
        <div className="text-sm font-medium text-text-main">评审反馈修订</div>
        <div className="mt-1 text-xs leading-5 text-text-muted">
          任务结束后，可以根据人工 PR 评审反馈创建一个范围明确的修订任务。
        </div>
        <Textarea
          value={reviewFeedback}
          onChange={event => setReviewFeedback(event.target.value)}
          className="mt-3 min-h-24 bg-bg-surface"
          aria-label="人工评审反馈"
          placeholder="粘贴这项任务可执行的 PR 评审反馈..."
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">
            {task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
              ? '可修订'
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
        {eventText || '没有事件内容。'}
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
