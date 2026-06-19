'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n';
import {
  useBindProjectRepository,
  useProjectContext,
  useProjectRepositoryOptions,
} from '@/features/project/hooks/use-projects';
import { primaryRepositoryContext } from '@/features/project/project-context';
import {
  projectContextHref,
  projectPlanHref,
  projectPRReviewHref,
  projectRequirementNewHref,
  projectSpecForgeHref,
} from '@/features/project/project-utils';
import {
  ProjectAdvancedDetails,
  ProjectCommandHeader,
  ProjectReadinessStrip,
  ProjectWorkflowStepper,
  type ProjectReadinessStripItem,
  type ProjectWorkflowStep,
} from '@/features/project/components/project-flow-primitives';
import {
  githubReadinessRecoveryActions,
  githubReadinessRecoveryDiagnostics,
  githubReadinessRecoveryTargetFromRepositoryId,
} from '@/features/project/github-readiness-recovery';
import {
  githubRepositoryIdentitySummary,
  type GitHubRepositoryIdentitySummary,
} from '@/features/project/github-repository-identity';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useDispatchExecutionRun,
  useGitHubRepositoryReadiness,
  useLatestPlanRun,
  useLatestProjectPlan,
  useRepoArchitectureStatus,
  useSpecForgeRuntimes,
} from '@/features/specforge/hooks/use-specforge';
import { executionRunFromDTO, planBundleFromDTO } from '@/features/specforge/plan-adapter';
import { summarizeDeliveryRun } from '@/features/specforge/delivery-status';
import type { ExecutionRun, PlanBundle, PRNode } from '@/features/specforge/types';
import type { GitHubRepositoryReadinessCheckDTO } from '@/features/specforge/services/specforge-service';
import { hasFreshDispatchRuntime } from '@/features/specforge/runtime-dispatch-readiness';
import { cn } from '@/utils';

export function ProjectSpecForgeConsole() {
  const t = useT('dashboard.projectDelivery');
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;
  const selectedRepository = primaryRepositoryContext(context);
  const repositoryId = selectedRepository?.repository.repository_id;
  const hasProjectContext = Boolean(context);

  if (!validProjectId) {
    return (
      <ProjectScopedState
        title={t('states.invalidProject.title')}
        description={t('states.invalidProject.description')}
      />
    );
  }

  if (!hasProjectContext && contextQuery.isFetching) {
    return (
      <ProjectScopedState
        title={t('states.loading.title')}
        description={t('states.loading.description')}
      />
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectScopedState
        title={t('states.unavailable.title')}
        description={t('states.unavailable.description')}
        actionHref="/console/projects"
        actionLabel={t('states.unavailable.action')}
      />
    );
  }

  const loadedContext = context;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden pb-28">
      {!repositoryId ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Alert>
            <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('primaryRequired.description')}
            </AlertDescription>
          </Alert>
          <ProjectRepositoryBindPanel projectId={projectId} />
        </div>
      ) : (
        <ProjectDeliveryBoard
          projectId={validProjectId}
          context={loadedContext}
          repository={selectedRepository}
        />
      )}
    </div>
  );
}

type ProjectDeliveryTone = 'ready' | 'waiting' | 'blocked' | 'running';

interface ProjectDeliveryNextAction {
  title: string;
  description: string;
  label: string;
  href?: string;
  disabled?: boolean;
  onClick?: () => void;
}

function ProjectDeliveryBoard({
  projectId,
  context,
  repository,
}: {
  projectId: number;
  context: ProjectContextDTO;
  repository?: ProjectRepositoryContextDTO;
}) {
  const repoId = repository?.repository.repository_id ?? '';
  const [runtimeNow] = useState(() => Date.now());
  const [deliveryActionMessage, setDeliveryActionMessage] = useState('');
  const runtimesQuery = useSpecForgeRuntimes({ status: 'online', limit: 20 });
  const dispatchRun = useDispatchExecutionRun();
  const architectureQuery = useRepoArchitectureStatus(repoId);
  const readinessQuery = useGitHubRepositoryReadiness(repoId || undefined);
  const latestPlanQuery = useLatestProjectPlan(projectId);
  const latestPlan = useMemo(
    () => (latestPlanQuery.data ? planBundleFromDTO(latestPlanQuery.data) : undefined),
    [latestPlanQuery.data]
  );
  const latestPlanRunQuery = useLatestPlanRun(latestPlan?.planId, {
    enabled: Boolean(latestPlan?.planId),
    refetchInterval: latestPlan?.implementationPlan.status === 'approved' ? 3000 : false,
  });
  const latestRun = useMemo<ExecutionRun | undefined>(() => {
    if (!latestPlanRunQuery.data) {
      return undefined;
    }
    return executionRunFromDTO(latestPlanRunQuery.data, latestPlan).run;
  }, [latestPlan, latestPlanRunQuery.data]);
  const deliverySummary = latestRun ? summarizeDeliveryRun(latestRun) : undefined;
  const deliveryTasks = latestRun?.tasks.length ? latestRun.tasks : (latestPlan?.prNodes ?? []);
  const localAgentReady = ['codex_cli', 'kimi_cli', 'claude_code_cli'].some(executor =>
    hasFreshDispatchRuntime(runtimesQuery.data?.runtimes, runtimeNow, executor, repoId)
  );
  const readiness = readinessQuery.data;
  const githubReady = Boolean(readiness?.ready);
  const snapshot = architectureQuery.data?.snapshot ?? repository?.architecture_snapshot;
  const profile = repository?.profile;
  const repoReady = Boolean(repoId);
  const wikiReady = Boolean(snapshot || profile);
  const projectName = context.project.name || `Project ${projectId}`;
  const newRequirementHref = projectRequirementNewHref(projectId);
  const latestPlanHref = latestPlan?.planId ? projectPlanHref(projectId, latestPlan.planId) : undefined;
  const planApproved = latestPlan?.implementationPlan.status === 'approved';
  const activeTask = deliveryTasks.find(task => task.status === 'running' || task.status === 'ci_running');
  const runningTask = deliveryTasks.find(task => task.status === 'running');
  const reviewableTask = deliveryTasks.find(task =>
    ['pr_opened', 'ready_for_review', 'completed'].includes(task.status)
  );
  const blockedTask = deliveryTasks.find(task =>
    ['blocked', 'failed', 'cancelled'].includes(task.status)
  );
  const queuedTask = deliveryTasks.find(task => task.status === 'queued');

  async function dispatchQueuedTask() {
    if (!latestRun?.runId || !queuedTask) {
      return;
    }
    setDeliveryActionMessage('');
    try {
      await dispatchRun.mutateAsync({
        runId: latestRun.runId,
        payload: {
          max_tasks: 1,
          require_runtime_ready: true,
        },
      });
      setDeliveryActionMessage(`${queuedTask.nodeKey} 已派发给可用 runtime。`);
    } catch {
      setDeliveryActionMessage('派发失败。请确认本地 runtime 在线并匹配目标仓库。');
    }
  }

  const nextAction = projectDeliveryNextAction({
    latestPlan,
    latestPlanHref,
    reviewableTask,
    blockedTask,
    queuedTask,
    activeTask,
    newRequirementHref,
    dispatchQueuedTask,
    isDispatching: dispatchRun.isPending,
    projectId,
  });
  const readinessStrip: ProjectReadinessStripItem[] = [
    {
      label: '主仓库',
      value: repoId || '未绑定',
      helper: repoReady ? '项目交付目标已确定' : '先绑定 primary repository',
      tone: repoReady ? 'ready' : 'blocked',
    },
    {
      label: '仓库上下文',
      value: wikiReady ? '可用' : '待生成',
      helper: wikiReady ? '计划可使用 repo profile 或架构快照' : '建议在执行前补齐上下文',
      tone: wikiReady ? 'ready' : 'waiting',
    },
    {
      label: '运行器',
      value: localAgentReady ? '在线' : '未在线',
      helper: localAgentReady ? '可派发本地执行' : '可以先审计划，执行前再启动',
      tone: localAgentReady ? 'ready' : 'waiting',
    },
    {
      label: 'GitHub',
      value: githubReady ? 'Ready' : '需检查',
      helper: githubReady ? '连接和权限检查通过' : '执行前可能需要恢复 GitHub 配置',
      tone: githubReady ? 'ready' : 'waiting',
    },
  ];
  const workflowSteps: ProjectWorkflowStep[] = [
    {
      id: 'setup',
      label: '准备',
      description: repoReady ? '主仓库已绑定' : '绑定主仓库',
      status: repoReady ? 'complete' : 'blocked',
    },
    {
      id: 'requirement',
      label: '需求',
      description: latestPlan ? '已有计划来源' : '输入产品目标',
      status: latestPlan ? 'complete' : repoReady ? 'current' : 'blocked',
    },
    {
      id: 'approval',
      label: '审批',
      description: latestPlan ? '检查 PR DAG' : '等待计划生成',
      status: latestPlan ? (planApproved ? 'complete' : 'current') : 'waiting',
    },
    {
      id: 'delivery',
      label: '交付',
      description: deliverySummary?.headline ?? '跟踪 PR 节点',
      status: blockedTask ? 'blocked' : planApproved || activeTask || reviewableTask ? 'current' : 'waiting',
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 md:px-8">
      <ProjectCommandHeader
        title={projectName}
        description="从一个需求开始，审批一次计划，然后跟踪 GitHub PR。运行器、Prompt 和诊断证据默认收进高级详情。"
        badges={[
          { label: 'CodingCTO Delivery' },
          {
            label: blockedTask ? '阻塞' : runningTask ? '执行中' : reviewableTask ? '可评审' : latestPlan ? '计划中' : '待需求',
            tone: blockedTask ? 'blocked' : runningTask ? 'running' : reviewableTask ? 'ready' : 'waiting',
          },
        ]}
        primaryAction={
          nextAction.href
            ? {
                label: nextAction.label,
                href: nextAction.href,
                disabled: nextAction.disabled,
                icon: <ArrowRight className="ml-1.5 h-3.5 w-3.5" />,
              }
            : undefined
        }
        secondaryActions={[
          {
            label: '新建需求',
            href: newRequirementHref,
            variant: 'outline',
            icon: <Sparkles className="ml-1.5 h-3.5 w-3.5" />,
          },
          {
            label: '项目上下文',
            href: projectContextHref(projectId),
            variant: 'outline',
          },
        ]}
      />

      <ProjectReadinessStrip items={readinessStrip} />
      <ProjectWorkflowStepper steps={workflowSteps} />

      <ProjectDeliveryNextActionPanel
        action={nextAction}
        isDispatching={dispatchRun.isPending}
      />

      <DeliveryMonitorPanel
        projectId={projectId}
        latestPlan={latestPlan}
        latestRun={latestRun}
        tasks={deliveryTasks}
        isLoading={latestPlanQuery.isFetching || latestPlanRunQuery.isFetching}
        isDispatching={dispatchRun.isPending}
        actionMessage={deliveryActionMessage}
        onDispatchQueuedTask={dispatchQueuedTask}
      />

      <ProjectAdvancedDetails
        title="运行器、Prompt 和诊断详情"
        description="这些信息用于排错和审计，不作为默认交付视图。"
      >
        <DeliveryDiagnosticsPanel
          repoId={repoId}
          context={context}
          latestPlan={latestPlan}
          latestRun={latestRun}
          tasks={deliveryTasks}
          localAgentReady={localAgentReady}
          githubReady={githubReady}
          wikiReady={wikiReady}
          readiness={readiness}
          isCheckingReadiness={readinessQuery.isFetching}
          onRefreshReadiness={() => readinessQuery.refetch()}
          projectId={projectId}
        />
      </ProjectAdvancedDetails>
    </main>
  );
}

function projectDeliveryNextAction({
  latestPlan,
  latestPlanHref,
  reviewableTask,
  blockedTask,
  queuedTask,
  activeTask,
  newRequirementHref,
  dispatchQueuedTask,
  isDispatching,
  projectId,
}: {
  latestPlan?: PlanBundle;
  latestPlanHref?: string;
  reviewableTask?: PRNode;
  blockedTask?: PRNode;
  queuedTask?: PRNode;
  activeTask?: PRNode;
  newRequirementHref: string;
  dispatchQueuedTask: () => void;
  isDispatching: boolean;
  projectId: number;
}): ProjectDeliveryNextAction {
  if (!latestPlan) {
    return {
      title: '还没有需求计划',
      description: '先创建一个需求，生成产品计划、技术计划和 PR DAG。',
      label: '新建需求',
      href: newRequirementHref,
    };
  }
  if (latestPlan.implementationPlan.status !== 'approved') {
    return {
      title: '计划等待审批',
      description: '审批 PR DAG 后，CodingCTO 才会开始派发执行任务。',
      label: '查看计划',
      href: latestPlanHref,
      disabled: !latestPlanHref,
    };
  }
  if (blockedTask) {
    return {
      title: `${blockedTask.nodeKey} 需要处理`,
      description: blockedTask.failureReason || '该 PR 节点已阻塞。打开评审页查看失败原因和修复动作。',
      label: '打开评审',
      href: projectPRReviewHref(projectId, Number(blockedTask.id)),
    };
  }
  if (reviewableTask) {
    return {
      title: `${reviewableTask.nodeKey} 可评审`,
      description: '已有可检查的 PR 节点。进入评审页查看 PR、CI 和验证证据。',
      label: '打开评审',
      href: projectPRReviewHref(projectId, Number(reviewableTask.id)),
    };
  }
  if (queuedTask && !activeTask) {
    return {
      title: `${queuedTask.nodeKey} 等待派发`,
      description: '有任务已排队。确认本地运行器在线后继续执行下一个 PR 节点。',
      label: isDispatching ? '派发中' : `继续执行 ${queuedTask.nodeKey}`,
      onClick: dispatchQueuedTask,
      disabled: isDispatching,
    };
  }
  if (activeTask) {
    return {
      title: `${activeTask.nodeKey} 执行中`,
      description: '运行器正在处理当前 PR 节点。默认视图只显示交付状态，详细进度在高级详情中查看。',
      label: latestPlanHref ? '查看计划' : '等待执行',
      href: latestPlanHref,
      disabled: !latestPlanHref,
    };
  }
  return {
    title: '等待执行结果',
    description: '计划已审批，等待任务创建、运行器认领或 PR 状态回传。',
    label: latestPlanHref ? '查看计划' : '等待执行',
    href: latestPlanHref,
    disabled: !latestPlanHref,
  };
}

function ProjectDeliveryNextActionPanel({
  action,
  isDispatching,
}: {
  action: ProjectDeliveryNextAction;
  isDispatching: boolean;
}) {
  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-main">下一步</div>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-text-main">{action.title}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{action.description}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {action.onClick ? (
            <Button
              type="button"
              disabled={action.disabled || isDispatching}
              onClick={action.onClick}
            >
              {action.label}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          ) : action.href ? (
            <Button asChild disabled={action.disabled}>
              <Link href={action.href}>
                {action.label}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button type="button" disabled>
              {action.label}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

function DeliveryDiagnosticsPanel({
  repoId,
  context,
  latestPlan,
  latestRun,
  tasks,
  localAgentReady,
  githubReady,
  wikiReady,
  readiness,
  isCheckingReadiness,
  onRefreshReadiness,
  projectId,
}: {
  repoId: string;
  context: ProjectContextDTO;
  latestPlan?: PlanBundle;
  latestRun?: ExecutionRun;
  tasks: PRNode[];
  localAgentReady: boolean;
  githubReady: boolean;
  wikiReady: boolean;
  readiness?: {
    ready: boolean;
    github_owner?: string;
    github_repo?: string;
    checks: GitHubRepositoryReadinessCheckDTO[];
  };
  isCheckingReadiness: boolean;
  onRefreshReadiness: () => void;
  projectId: number;
}) {
  const blockingChecks = readiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div className="space-y-3">
        <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">交付诊断</div>
          <div className="mt-3 grid gap-2 text-sm">
            <DiagnosticsRow label="项目" value={context.project.name} />
            <DiagnosticsRow label="仓库" value={repoId || '未绑定'} />
            <DiagnosticsRow label="计划" value={latestPlan?.planId ? `#${latestPlan.planId}` : '无'} />
            <DiagnosticsRow label="Run" value={latestRun?.runId ? `#${latestRun.runId}` : '无'} />
            <DiagnosticsRow label="运行器" value={localAgentReady ? '在线' : '未在线'} />
            <DiagnosticsRow label="GitHub" value={githubReady ? 'ready' : 'needs check'} />
            <DiagnosticsRow label="仓库上下文" value={wikiReady ? '可用' : '待生成'} />
          </div>
        </div>
        {readiness?.checks.length ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
            <div className="text-sm font-medium text-text-main">GitHub readiness checks</div>
            <div className="mt-3 grid gap-2">
              {readiness.checks.map(check => (
                <ReadinessCheckRow key={check.key} check={check} />
              ))}
            </div>
            {blockingChecks.length > 0 ? (
              <ReadinessRecoveryActions
                checks={blockingChecks}
                repositoryId={repoId}
                githubOwner={readiness.github_owner}
                githubRepo={readiness.github_repo}
                returnTo={projectSpecForgeHref(projectId)}
                isChecking={isCheckingReadiness}
                onRefresh={onRefreshReadiness}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
        <div className="text-sm font-medium text-text-main">PR 节点技术详情</div>
        <div className="mt-3 space-y-2">
          {tasks.length ? (
            tasks.map(task => (
              <div key={`${task.id}-${task.taskId ?? 'planned'}`} className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {task.nodeKey}
                  </Badge>
                  <Badge variant="outline" className={deliveryTaskStatusClassName(task.status)}>
                    {deliveryTaskStatusLabel(task.status)}
                  </Badge>
                  {task.taskId ? <Badge variant="outline">task #{task.taskId}</Badge> : null}
                </div>
                <div className="mt-2 text-sm font-medium text-text-main">{task.title}</div>
                <div className="mt-1 grid gap-1 text-xs leading-5 text-text-muted sm:grid-cols-2">
                  <span>phase: {task.currentPhase ?? task.processStatus ?? 'not started'}</span>
                  <span>runtime: {task.runtimeId || 'unassigned'}</span>
                  <span>last: {task.lastProgressAt ? formatDeliveryTime(task.lastProgressAt) : 'n/a'}</span>
                  <span className="truncate">dir: {task.workdir || 'n/a'}</span>
                </div>
                {task.failureReason ? (
                  <div className="mt-2 rounded-[4px] border border-error/30 bg-error-subtle px-3 py-2 text-xs leading-5 text-error">
                    {task.failureReason}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-4 text-sm text-text-muted">
              暂无 PR 节点详情。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DiagnosticsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2">
      <span className="text-text-muted">{label}</span>
      <span className="min-w-0 truncate font-medium text-text-main">{value}</span>
    </div>
  );
}

function DeliveryMonitorPanel({
  projectId,
  latestPlan,
  latestRun,
  tasks,
  isLoading,
  isDispatching,
  actionMessage,
  onDispatchQueuedTask,
}: {
  projectId: number;
  latestPlan?: PlanBundle;
  latestRun?: ExecutionRun;
  tasks: PRNode[];
  isLoading: boolean;
  isDispatching: boolean;
  actionMessage: string;
  onDispatchQueuedTask: () => void;
}) {
  const summary = latestRun ? summarizeDeliveryRun(latestRun) : undefined;
  const planHref = latestPlan?.planId ? projectPlanHref(projectId, latestPlan.planId) : undefined;
  const total = summary?.total ?? tasks.length;
  const ready = summary?.ready ?? tasks.filter(task => ['completed', 'pr_opened', 'ready_for_review', 'merged'].includes(task.status)).length;
  const progressPercent = summary?.progressPercent ?? (total ? Math.round((ready / total) * 100) : 0);
  const activeTask = tasks.find(task => task.status === 'running' || task.status === 'ci_running');
  const queuedTask = tasks.find(task => task.status === 'queued');

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-text-main">当前交付</h2>
            <Badge variant="outline" className={latestRun ? deliveryToneClassName(activeTask ? 'running' : 'ready') : 'text-text-muted'}>
              {latestRun ? `Run #${latestRun.runId}` : latestPlan ? `Plan #${latestPlan.planId}` : '暂无计划'}
            </Badge>
            {isLoading ? (
              <Badge variant="outline" className="border-info/30 text-info">
                刷新中
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-text-muted">
            {summary?.headline ??
              (latestPlan
                ? latestPlan.implementationPlan.status === 'approved'
                  ? '计划已审批，等待执行任务创建或 runtime 回传结果。'
                  : '计划已生成，先进入计划页审批后才会启动执行。'
                : '还没有项目计划。先创建一个需求并生成计划。')}
          </p>
          {summary?.nextAction ? (
            <p className="mt-1 text-sm leading-6 text-text-main">{summary.nextAction}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {queuedTask && !activeTask ? (
            <Button type="button" size="sm" disabled={isDispatching} onClick={onDispatchQueuedTask}>
              {isDispatching ? '派发中' : `继续执行 ${queuedTask.nodeKey}`}
            </Button>
          ) : null}
          {planHref ? (
            <Button asChild variant="outline" size="sm">
              <Link href={planHref}>打开计划</Link>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href={projectRequirementNewHref(projectId)}>新建需求</Link>
          </Button>
        </div>
      </div>
      {actionMessage ? (
        <div className="mt-3 rounded-md border border-info/20 bg-info-subtle px-3 py-2 text-sm leading-6 text-info">
          {actionMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-xs text-text-muted">PR 节点进度</div>
              <div className="mt-1 text-2xl font-semibold text-text-main">
                {ready}/{total}
              </div>
            </div>
            <Badge variant="outline" className="text-text-muted">
              {progressPercent}%
            </Badge>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-surface">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
            <div>运行中：{summary?.active ?? 0}</div>
            <div>等待：{summary?.waiting ?? 0}</div>
            <div>阻塞：{summary?.blocked ?? 0}</div>
            <div>失败：{summary?.failed ?? 0}</div>
          </div>
        </div>

        <div className="min-w-0 rounded-md border border-border-subtle bg-bg-subtle">
          {tasks.length ? (
            <div className="divide-y divide-border-subtle">
              {tasks.map(task => (
                <div key={`${task.id}-${task.taskId ?? 'planned'}`} className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_220px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {task.nodeKey}
                      </Badge>
                      <Badge variant="outline" className={deliveryTaskStatusClassName(task.status)}>
                        {deliveryTaskStatusLabel(task.status)}
                      </Badge>
                    </div>
                    <div className="mt-2 truncate text-sm font-medium text-text-main">
                      {task.title}
                    </div>
                    {task.failureReason ? (
                      <div className="mt-2 rounded-[4px] border border-error/30 bg-error-subtle px-3 py-2 text-xs leading-5 text-error">
                        {task.failureReason}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                    {task.status === 'queued' && !activeTask ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isDispatching}
                        onClick={onDispatchQueuedTask}
                      >
                        {isDispatching ? '派发中' : '继续执行'}
                      </Button>
                    ) : null}
                    {task.githubPrUrl ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={task.githubPrUrl} target="_blank" rel="noreferrer">
                          GitHub PR
                        </Link>
                      </Button>
                    ) : null}
                    {task.taskId && ['pr_opened', 'ready_for_review', 'completed', 'failed', 'blocked'].includes(task.status) ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={projectPRReviewHref(projectId, Number(task.id))}>
                          评审
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm leading-6 text-text-muted">
              当前没有 PR 节点。先创建需求并生成计划。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function deliveryToneClassName(tone: ProjectDeliveryTone) {
  switch (tone) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'blocked':
      return 'border-warning/30 text-warning';
    case 'running':
      return 'border-primary/30 text-primary';
    default:
      return 'border-border-subtle text-text-muted';
  }
}

function deliveryTaskStatusLabel(status: PRNode['status']) {
  switch (status) {
    case 'planned':
      return '已计划';
    case 'queued':
      return '已排队';
    case 'running':
      return '执行中';
    case 'waiting_on_dependencies':
      return '等待依赖';
    case 'pr_opened':
      return 'PR 已打开';
    case 'ci_running':
      return 'CI 中';
    case 'ready_for_review':
      return '可评审';
    case 'blocked':
      return '阻塞';
    case 'merged':
      return '已合并';
    case 'closed':
      return '已关闭';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function deliveryTaskStatusClassName(status: PRNode['status']) {
  switch (status) {
    case 'running':
    case 'ci_running':
      return 'border-primary/30 text-primary';
    case 'pr_opened':
    case 'ready_for_review':
    case 'completed':
    case 'merged':
      return 'border-success/30 text-success';
    case 'blocked':
    case 'failed':
    case 'cancelled':
      return 'border-error/30 text-error';
    case 'queued':
    case 'waiting_on_dependencies':
      return 'border-warning/30 text-warning';
    default:
      return 'border-border-subtle text-text-muted';
  }
}

function formatDeliveryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('zh-Hans', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

function ProjectScopedState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">{description}</AlertDescription>
      </Alert>
      {actionHref && actionLabel ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function ProjectRepositoryBindPanel({ projectId }: { projectId: number }) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const repositoryOptionsQuery = useProjectRepositoryOptions(projectId);
  const repositories = repositoryOptionsQuery.data?.repositories ?? [];
  const selectableRepositories = repositories.filter(repository => repository.selectable);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');
  const selectedRepository = repositories.find(
    repository => repository.repository_id === selectedRepositoryId
  );

  async function bindRepositoryToProject() {
    if (!selectedRepository?.selectable) {
      setMessage(t('messages.repositoryRequired'));
      return;
    }
    setMessage('');
    try {
      const response = await bindRepository.mutateAsync({
        repository_id: selectedRepository.repository_id,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setSelectedRepositoryId('');
      setRole('primary');
      setMessage(
        t('messages.bound', {
          role: t(`roles.${response.repository.role}`),
          repoId: response.repository.repository_id,
        })
      );
    } catch {
      setMessage(t('messages.bindFailed'));
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs leading-5 text-text-muted">
            {repositoryOptionsQuery.isLoading
              ? t('loadingRepositories')
              : t('repositoryCount', { count: selectableRepositories.length })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/console/settings?tab=github">{t('connectRepository')}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={repositoryOptionsQuery.isFetching}
              onClick={() => repositoryOptionsQuery.refetch()}
            >
              {t('refreshRepositories')}
            </Button>
          </div>
        </div>

        {repositoryOptionsQuery.isLoading ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {t('loadingRepositories')}
          </div>
        ) : repositories.length > 0 ? (
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {repositories.map(repository => {
              const selected = selectedRepositoryId === repository.repository_id;
              return (
                <button
                  key={repository.repository_id}
                  type="button"
                  disabled={!repository.selectable}
                  onClick={() => setSelectedRepositoryId(repository.repository_id)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary-subtle'
                      : 'border-border-subtle bg-bg-surface hover:bg-bg-subtle',
                    !repository.selectable && 'cursor-not-allowed opacity-65 hover:bg-bg-surface'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text-main">
                      {repository.access.full_name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                      {repository.access.default_branch} · {repositorySourceLabel(repository)}
                      {repository.disabled_reason ? ` · ${repository.disabled_reason}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {repository.already_bound ? (
                      <Badge variant="outline" className="border-border-subtle text-text-muted">
                        {t(`roles.${repository.bound_role || 'dependency'}`)}
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={
                        repository.writable
                          ? 'border-success/30 text-success'
                          : 'border-border-subtle text-text-muted'
                      }
                    >
                      {repository.writable ? t('writable') : t('readOnly')}
                    </Badge>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {t('emptyRepositories')}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[220px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="project-repository-role">{t('role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="project-repository-role">
                <SelectValue placeholder={t('role')} />
              </SelectTrigger>
              <SelectContent>
                {['primary', 'dependency', 'docs', 'infra'].map(item => (
                  <SelectItem key={item} value={item}>
                    {t(`roles.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={bindRepository.isPending || !selectedRepository?.selectable}
              onClick={bindRepositoryToProject}
            >
              {bindRepository.isPending ? t('binding') : t('submit')}
            </Button>
          </div>
        </div>

        {message && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-5 text-text-muted">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function repositorySourceLabel(repository: {
  access: {
    source_type: string;
    organization_login?: string;
    visibility?: string;
  };
}) {
  const source =
    repository.access.source_type === 'organization' && repository.access.organization_login
      ? repository.access.organization_login
      : 'personal';
  return `${source} · ${repository.access.visibility || 'repository'}`;
}

function ReadinessCheckRow({ check }: { check: GitHubRepositoryReadinessCheckDTO }) {
  const t = useT('dashboard.projectDelivery.e2e');
  const { locale } = useLocale();
  const localizedCheck = localizeGitHubReadinessCheck(check, locale);
  const tone =
    check.status === 'ok'
      ? 'border-success/30 bg-success-subtle text-success'
      : check.status === 'warning'
        ? 'border-warning/30 bg-warning-subtle text-warning'
        : 'border-error/30 bg-error-subtle text-error';
  const label = check.status === 'ok' ? t('checkStatus.ok') : check.status === 'warning' ? t('checkStatus.warning') : t('checkStatus.error');

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium leading-5 text-text-main">{localizedCheck.message}</div>
          {localizedCheck.detail ? (
            <div className="mt-1 break-words leading-5 text-text-muted">{localizedCheck.detail}</div>
          ) : null}
        </div>
        <Badge variant="outline" className={tone}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

function ReadinessRecoveryActions({
  checks,
  repositoryId,
  githubOwner,
  githubRepo,
  returnTo,
  isChecking,
  onRefresh,
}: {
  checks: GitHubRepositoryReadinessCheckDTO[];
  repositoryId: string;
  githubOwner?: string;
  githubRepo?: string;
  returnTo: string;
  isChecking: boolean;
  onRefresh: () => void;
}) {
  const inferredRecoveryTarget = githubReadinessRecoveryTargetFromRepositoryId(repositoryId);
  const recoveryTarget =
    githubOwner && githubRepo
      ? { owner: githubOwner, repo: githubRepo, repositoryId, returnTo }
      : inferredRecoveryTarget
        ? { ...inferredRecoveryTarget, returnTo }
        : undefined;
  const actions = githubReadinessRecoveryActions(
    checks,
    recoveryTarget
  );
  const diagnostics = githubReadinessRecoveryDiagnostics(checks);
  const identity = githubRepositoryIdentitySummary({
    repositoryId,
    githubOwner,
    githubRepo,
  });

  if (!actions.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle p-3">
      <div className="text-sm font-medium text-warning">下一步处理</div>
      <p className="mt-1 text-xs leading-5 text-warning">
        真实端到端试跑需要 GitHub 连接、仓库绑定和写权限都就绪。先完成下面的配置，再回到这里重新检查。
      </p>
      <ProjectRepositoryIdentityDiagnostic identity={identity} />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {diagnostics.map(diagnostic => (
          <div key={diagnostic.checkKey} className="rounded-md bg-bg-surface px-3 py-2">
            <div className="text-xs font-medium leading-5 text-text-main">
              {diagnostic.checkKey} - {diagnostic.setupStep}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">{diagnostic.detail}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {actions.map(action => (
          <div key={action.id} className="rounded-md bg-bg-surface px-3 py-2">
            <div className="text-xs font-medium leading-5 text-text-main">{action.label}</div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">{action.description}</div>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isChecking}>
          {isChecking ? '检查中' : '重新检查'}
        </Button>
      </div>
    </div>
  );
}

function ProjectRepositoryIdentityDiagnostic({
  identity,
}: {
  identity: GitHubRepositoryIdentitySummary;
}) {
  return (
    <div className="mt-3 rounded-md bg-bg-surface px-3 py-2">
      <div className="text-xs font-medium leading-5 text-text-main">{identity.headline}</div>
      <div className="mt-0.5 text-xs leading-5 text-text-muted">{identity.detail}</div>
    </div>
  );
}

function localizeGitHubReadinessCheck(
  check: GitHubRepositoryReadinessCheckDTO,
  locale: string
) {
  if (locale.startsWith('zh')) {
    return { message: check.message, detail: check.detail };
  }

  const permissionName = githubPermissionLabel(check.key);
  const permissionMessage = check.key.startsWith('permission_')
    ? permissionReadinessMessage(permissionName, check.status)
    : undefined;
  const messages: Record<string, string> = {
    repository: 'Repository is bound to this project',
    settings: 'GitHub integration is enabled',
    connection: 'GitHub account connection is active',
    oauth_token: 'GitHub OAuth token is available',
    repository_access: 'Repository access record is available',
    repository_read: 'Repository can be read',
    repository_write: 'Repository can be written',
    repository_ref: 'Default branch can be read',
    installation: 'Legacy GitHub App installation is synced',
    installation_token: 'Legacy GitHub App token is available',
  };

  return {
    message: permissionMessage ?? messages[check.key] ?? check.message,
    detail: localizeGitHubReadinessDetail(check.detail),
  };
}

function permissionReadinessMessage(permissionName: string, status: GitHubRepositoryReadinessCheckDTO['status']) {
  if (status === 'ok') {
    return `${permissionName} permission is available`;
  }
  if (status === 'warning') {
    return `GitHub access is missing ${permissionName}; later CI reads may be unavailable`;
  }
  return `GitHub access is missing required ${permissionName} permission`;
}

function githubPermissionLabel(key: string) {
  const labels: Record<string, string> = {
    permission_metadata: 'metadata:read',
    permission_contents: 'contents:write',
    permission_pull_requests: 'pull_requests:write',
    permission_issues: 'issues:write',
    permission_actions: 'actions:read',
    permission_statuses: 'statuses:read',
  };
  return labels[key] ?? key.replace(/^permission_/, '').replaceAll('_', ':');
}

function localizeGitHubReadinessDetail(detail?: string) {
  if (!detail) {
    return undefined;
  }
  const permissionDetail = detail.match(/^当前权限：(.+)，需要：(.+)$/);
  if (permissionDetail) {
    return `Current permission: ${permissionDetail[1]}; required: ${permissionDetail[2]}`;
  }
  return detail;
}
