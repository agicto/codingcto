'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, GitPullRequest, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n';
import { useBindProjectRepository, useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import {
  projectContextHref,
  projectPlanHref,
  projectRequirementNewHref,
} from '@/features/project/project-utils';
import {
  ProjectAdvancedDetails,
  ProjectCommandHeader,
  ProjectReadinessStrip,
  ProjectWorkflowStepper,
  type ProjectReadinessStripItem,
  type ProjectWorkflowStep,
} from '@/features/project/components/project-flow-primitives';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useApproveSpecForgePlan,
  useCreateGitHubIssue,
  useCreateSpecForgeProjectIdea,
  useDispatchExecutionRun,
  useGitHubRepositories,
  useGitHubRepositoryReadiness,
  useLatestPlanRun,
  useLatestProjectPlan,
  useSpecForgeRuntimes,
  useStartExecutionRun,
  useUpsertGitHubRepository,
} from '@/features/specforge/hooks/use-specforge';
import {
  specForgeService,
  type GitHubRepositoryReadinessCheckDTO,
} from '@/features/specforge/services/specforge-service';
import { executionRunFromDTO, planBundleFromDTO } from '@/features/specforge/plan-adapter';
import { summarizeDeliveryRun } from '@/features/specforge/delivery-status';
import type { ExecutionRun, PlanBundle, PRNode } from '@/features/specforge/types';

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

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden pb-28">
      {!repositoryId ? (
        <ProjectMissingRepositoryState projectId={validProjectId} context={context} />
      ) : (
        <ProjectDeliveryBoard
          projectId={validProjectId}
          context={context}
          repository={selectedRepository}
        />
      )}
    </div>
  );
}

type ProjectDeliveryNextAction = {
  title: string;
  description: string;
  label: string;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

function ProjectMissingRepositoryState({
  projectId,
  context,
}: {
  projectId: number;
  context: ProjectContextDTO;
}) {
  const t = useT('dashboard.projectDelivery');
  const readiness = projectContextReadiness(context);
  const readinessStrip: ProjectReadinessStripItem[] = [
    {
      label: '主仓库',
      value: '未绑定',
      helper: readiness.nextAction,
      tone: 'blocked',
    },
    {
      label: '仓库上下文',
      value: `${readiness.activeRepositoryCount} repos`,
      helper: `${readiness.skillCount} skills · ${readiness.warningCount} warnings`,
      tone: 'waiting',
    },
    {
      label: '运行器',
      value: '稍后配置',
      helper: '执行前再启动本地 runtime',
      tone: 'waiting',
    },
    {
      label: 'GitHub',
      value: '待绑定',
      helper: '需要 primary repository',
      tone: 'blocked',
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <ProjectCommandHeader
        title={context.project.name}
        description={t('primaryRequired.description')}
        badges={[
          { label: 'CodingCTO Delivery' },
          { label: t('primaryRequired.title'), tone: 'blocked' },
        ]}
        secondaryActions={[
          {
            label: '项目上下文',
            href: projectContextHref(projectId),
            variant: 'outline',
          },
        ]}
      />
      <ProjectReadinessStrip items={readinessStrip} />
      <Alert>
        <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
        <AlertDescription>{t('primaryRequired.description')}</AlertDescription>
      </Alert>
      <ProjectRepositoryBindPanel
        projectId={projectId}
        workspaceId={context.project.workspace_id}
      />
    </main>
  );
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
  const projectName = context.project.name || `Project ${projectId}`;
  const [deliveryActionMessage, setDeliveryActionMessage] = useState('');
  const runtimesQuery = useSpecForgeRuntimes({ status: 'online', limit: 20 });
  const dispatchRun = useDispatchExecutionRun();
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
  const readiness = readinessQuery.data;
  const githubReady = Boolean(readiness?.ready);
  const localAgentReady = (runtimesQuery.data?.runtimes ?? []).some(runtime => {
    if (runtime.status !== 'online' || runtime.executor !== 'codex_cli') {
      return false;
    }
    return (runtime.available_clis ?? []).some(cli => cli.available && cli.command === 'codex');
  });
  const wikiReady = Boolean(repository?.profile || repository?.architecture_snapshot);
  const latestPlanHref = latestPlan?.planId ? projectPlanHref(projectId, latestPlan.planId) : undefined;
  const newRequirementHref = projectRequirementNewHref(projectId);
  const activeTask = deliveryTasks.find(task =>
    ['running', 'ci_running'].includes(task.status)
  );
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
  });
  const readinessStrip: ProjectReadinessStripItem[] = [
    {
      label: '主仓库',
      value: repoId,
      helper: '项目交付目标已确定',
      tone: 'ready',
    },
    {
      label: '仓库上下文',
      value: wikiReady ? '可用' : '待生成',
      helper: wikiReady ? '已读取 repo profile 或架构快照' : '建议在执行前补齐上下文',
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
      description: '主仓库已绑定',
      status: 'complete',
    },
    {
      id: 'requirement',
      label: '需求',
      description: latestPlan ? '已有计划来源' : '输入产品目标',
      status: latestPlan ? 'complete' : 'current',
    },
    {
      id: 'approval',
      label: '审批',
      description: latestPlan ? '检查 PR DAG' : '等待计划生成',
      status: latestPlan
        ? latestPlan.implementationPlan.status === 'approved'
          ? 'complete'
          : 'current'
        : 'waiting',
    },
    {
      id: 'delivery',
      label: '交付',
      description: deliverySummary?.headline ?? '跟踪 PR 节点',
      status: blockedTask
        ? 'blocked'
        : latestPlan?.implementationPlan.status === 'approved' || activeTask || reviewableTask
          ? 'current'
          : 'waiting',
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
            label: blockedTask
              ? '阻塞'
              : activeTask
                ? '执行中'
                : reviewableTask
                  ? '可评审'
                  : latestPlan
                    ? '计划中'
                    : '待需求',
            tone: blockedTask
              ? 'blocked'
              : activeTask
                ? 'running'
                : reviewableTask
                  ? 'ready'
                  : 'waiting',
          },
        ]}
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

      <ProjectDeliveryNextActionPanel action={nextAction} isDispatching={dispatchRun.isPending} />

      <DeliverySummaryPanel
        latestPlan={latestPlan}
        latestRun={latestRun}
        tasks={deliveryTasks}
        isLoading={latestPlanQuery.isFetching || latestPlanRunQuery.isFetching}
        actionMessage={deliveryActionMessage}
      />

      <ProjectAdvancedDetails
        title="运行器、Prompt 和诊断详情"
        description="这些信息用于排错和审计，不作为默认交付视图。"
      >
        <div className="space-y-5">
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
          />
          <ProjectE2ERunPanel
            projectId={projectId}
            projectName={projectName}
            repository={repository?.repository}
          />
          <SpecForgeWorkbench
            key={repoId}
            projectId={projectId}
            initialRepositoryId={repoId}
            projectLabel={projectName}
            repositoryLocked
            pageScroll
          />
        </div>
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
      description: blockedTask.failureReason || '该 PR 节点已阻塞。查看下方摘要和高级诊断。',
      label: latestPlanHref ? '查看计划' : '查看详情',
      href: latestPlanHref,
      disabled: !latestPlanHref,
    };
  }
  if (reviewableTask) {
    return {
      title: `${reviewableTask.nodeKey} 可评审`,
      description: '已有可检查的 PR 节点。打开 GitHub PR 或继续查看执行摘要。',
      label: reviewableTask.githubPrUrl ? '打开 GitHub PR' : '查看计划',
      href: reviewableTask.githubPrUrl || latestPlanHref,
      external: Boolean(reviewableTask.githubPrUrl),
      disabled: !reviewableTask.githubPrUrl && !latestPlanHref,
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
          ) : action.href && action.external ? (
            <Button asChild disabled={action.disabled}>
              <a href={action.href} target="_blank" rel="noreferrer">
                {action.label}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </a>
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

function DeliverySummaryPanel({
  latestPlan,
  latestRun,
  tasks,
  isLoading,
  actionMessage,
}: {
  latestPlan?: PlanBundle;
  latestRun?: ExecutionRun;
  tasks: PRNode[];
  isLoading: boolean;
  actionMessage: string;
}) {
  const summary = latestRun ? summarizeDeliveryRun(latestRun) : undefined;

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-text-main">
            <GitPullRequest className="h-4 w-4 text-text-muted" />
            PR node delivery
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {summary?.headline ??
              (latestPlan ? '计划已生成，等待审批或执行记录。' : '还没有计划和 PR 节点。')}
          </p>
        </div>
        <Badge variant="outline">
          {isLoading ? '刷新中' : summary ? `${summary.progressPercent}% complete` : 'No run'}
        </Badge>
      </div>
      {summary ? (
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
          <DeliveryMetric label="Ready" value={summary.ready} />
          <DeliveryMetric label="Active" value={summary.active} />
          <DeliveryMetric label="Waiting" value={summary.waiting} />
          <DeliveryMetric label="Blocked" value={summary.blocked + summary.failed} />
          <DeliveryMetric label="Merged" value={summary.merged} />
        </div>
      ) : null}
      {actionMessage ? (
        <div className="mt-3 rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-sm text-text-muted">
          {actionMessage}
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {tasks.length ? (
          tasks.map(task => <PRNodeSummaryRow key={`${task.id}-${task.taskId ?? 'planned'}`} task={task} />)
        ) : (
          <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle px-3 py-4 text-sm text-text-muted">
            创建需求并审批计划后，这里会显示 PR 节点状态。
          </div>
        )}
      </div>
    </section>
  );
}

function DeliveryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-sm font-semibold text-text-main">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
    </div>
  );
}

function PRNodeSummaryRow({ task }: { task: PRNode }) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">
              {task.nodeKey}
            </Badge>
            <Badge variant="outline" className={deliveryTaskStatusClassName(task.status)}>
              {deliveryTaskStatusLabel(task.status)}
            </Badge>
            {task.githubPrNumber ? (
              <Badge variant="outline">PR #{task.githubPrNumber}</Badge>
            ) : null}
          </div>
          <div className="mt-2 text-sm font-medium text-text-main">{task.title}</div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{task.goal}</p>
          {task.failureReason ? (
            <div className="mt-2 rounded-[4px] border border-error/30 bg-error-subtle px-3 py-2 text-xs leading-5 text-error">
              {task.failureReason}
            </div>
          ) : null}
        </div>
        {task.githubPrUrl ? (
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <a href={task.githubPrUrl} target="_blank" rel="noreferrer">
              GitHub PR
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </a>
          </Button>
        ) : null}
      </div>
    </div>
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
        <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-text-main">GitHub readiness checks</div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefreshReadiness}
              disabled={isCheckingReadiness}
            >
              {isCheckingReadiness ? 'Checking' : 'Refresh'}
            </Button>
          </div>
          {readiness?.checks.length ? (
            <div className="mt-3 grid gap-2">
              {readiness.checks.map(check => (
                <ReadinessCheckRow key={check.key} check={check} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-[4px] border border-dashed border-border-subtle bg-bg-surface px-3 py-4 text-sm text-text-muted">
              暂无 GitHub readiness 结果。
            </div>
          )}
          {blockingChecks.length > 0 ? (
            <div className="mt-3 rounded-[4px] border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              {readinessProblemSummary(blockingChecks, 'GitHub repository is not ready.', 'zh-Hans')}
            </div>
          ) : null}
        </div>
      </div>
      <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
        <div className="text-sm font-medium text-text-main">PR 节点技术详情</div>
        <div className="mt-3 space-y-2">
          {tasks.length ? (
            tasks.map(task => (
              <div
                key={`${task.id}-${task.taskId ?? 'planned'}`}
                className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2"
              >
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

function ProjectRepositoryBindPanel({
  projectId,
  workspaceId,
}: {
  projectId: number;
  workspaceId: string;
}) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const globalRepositoriesQuery = useGitHubRepositories();
  const upsertRepository = useUpsertGitHubRepository();
  const repositories = globalRepositoriesQuery.data?.repositories ?? [];
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');
  const parsedRepository = useMemo(() => parseGitHubRepositoryURL(repositoryUrl), [repositoryUrl]);

  function findInstalledRepository() {
    if (!parsedRepository) {
      return undefined;
    }
    return repositories.find(
      repository =>
        repository.github_owner.toLowerCase() === parsedRepository.owner.toLowerCase() &&
        repository.github_repo.toLowerCase() === parsedRepository.repo.toLowerCase()
    );
  }

  async function bindRepositoryToProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsedRepository) {
      setMessage('请输入有效的 GitHub 仓库链接，例如 https://github.com/owner/repo。');
      return;
    }
    const installedRepository = findInstalledRepository();
    if (!installedRepository) {
      setMessage('GitHub App 已安装，但当前可访问仓库列表里没有这个仓库。请确认安装时选择了该仓库，然后刷新。');
      return;
    }
    setMessage('');
    try {
      const repository = await upsertRepository.mutateAsync({
        repository_id: installedRepository.repository_id,
        workspace_id: workspaceId,
        github_installation_id: installedRepository.github_installation_id,
        github_owner: installedRepository.github_owner,
        github_repo: installedRepository.github_repo,
        default_branch: installedRepository.default_branch,
        is_private: installedRepository.is_private,
      });
      const response = await bindRepository.mutateAsync({
        repository_id: repository.repository_id,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setRepositoryUrl('');
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
        <CardDescription>
          直接粘贴 GitHub 仓库链接。CodingCTO 会从已安装的 GitHub App 仓库列表中匹配，然后绑定到当前项目。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={bindRepositoryToProject}
        >
          <div className="space-y-2">
            <Label htmlFor="project-repository-url">GitHub 仓库链接</Label>
            <Input
              id="project-repository-url"
              value={repositoryUrl}
              onChange={event => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
            />
            {repositories.length > 0 ? (
              <div className="text-xs leading-5 text-text-muted">
                已检测到 {repositories.length} 个 GitHub App 可访问仓库。
              </div>
            ) : (
              <div className="text-xs leading-5 text-warning">
                暂未读取到 GitHub App 仓库，请先在 GitHub 设置里同步安装结果。
              </div>
            )}
          </div>
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
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                bindRepository.isPending ||
                upsertRepository.isPending ||
                !repositoryUrl.trim()
              }
            >
              {bindRepository.isPending || upsertRepository.isPending ? t('binding') : '绑定仓库'}
            </Button>
          </div>
        </form>
        {message && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-5 text-text-muted">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type FlowStepStatus = 'pending' | 'running' | 'success' | 'error';

type FlowStep = {
  id: string;
  title: string;
  status: FlowStepStatus;
  detail?: string;
  href?: string;
};

function ProjectE2ERunPanel({
  projectId,
  projectName,
  repository,
}: {
  projectId: number;
  projectName?: string;
  repository?: ProjectRepositoryContextDTO['repository'];
}) {
  const t = useT('dashboard.projectDelivery.e2e');
  const { locale } = useLocale();
  const createIssue = useCreateGitHubIssue();
  const createRequirement = useCreateSpecForgeProjectIdea(projectId);
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const readinessQuery = useGitHubRepositoryReadiness(repository?.repository_id);
  const [issueTitle, setIssueTitle] = useState(t('defaultIssueTitle'));
  const [issueBody, setIssueBody] = useState(t('defaultIssueBody'));
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [running, setRunning] = useState(false);
  const readiness = readinessQuery.data;
  const readinessBlockingChecks =
    readiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const readinessChecking = Boolean(repository?.repository_id) && readinessQuery.isFetching && !readiness;
  const readinessBlocked = Boolean(readiness && !readiness.ready);

  function setStep(next: FlowStep) {
    setSteps(current => {
      const index = current.findIndex(step => step.id === next.id);
      if (index === -1) {
        return [...current, next];
      }
      const copy = [...current];
      copy[index] = { ...copy[index], ...next };
      return copy;
    });
  }

  async function runFlow() {
    if (!repository?.repository_id) {
      setSteps([
        {
          id: 'repository',
          title: t('steps.repository.title'),
          status: 'error',
          detail: t('errors.noRepository'),
        },
      ]);
      return;
    }
    if (readinessBlocked) {
      setSteps([
        {
          id: 'readiness',
          title: t('readiness.title'),
          status: 'error',
          detail: readinessProblemSummary(readinessBlockingChecks, t('readiness.noChecks'), locale),
        },
      ]);
      return;
    }
    setRunning(true);
    setSteps([]);
    try {
      setStep({
        id: 'repository',
        title: t('steps.repository.title'),
        status: 'success',
        detail: repository.repository_id,
      });

      setStep({ id: 'issue', title: t('steps.issue.title'), status: 'running' });
      const issue = await createIssue.mutateAsync({
        repository_id: repository.repository_id,
        title: issueTitle,
        body: issueBody,
      });
      setStep({
        id: 'issue',
        title: t('steps.issue.title'),
        status: 'success',
        detail: `#${issue.number} ${issue.title}`,
        href: issue.html_url,
      });

      setStep({ id: 'plan', title: t('steps.plan.title'), status: 'running' });
      const planBundle = await createRequirement.mutateAsync({
        type: 'docs',
        input: [
          `GitHub Issue: #${issue.number}`,
          `Issue URL: ${issue.html_url}`,
          `项目：${projectName || '未命名项目'}`,
          '',
          issueTitle,
          issueBody,
        ].join('\n'),
      });
      setStep({
        id: 'plan',
        title: t('steps.plan.title'),
        status: 'success',
        detail: t('steps.plan.detail', { count: planBundle.pr_nodes.length }),
      });

      const firstNode = planBundle.pr_nodes.find(node => node.depends_on.length === 0) ?? planBundle.pr_nodes[0];
      if (!firstNode) {
        throw new Error(t('errors.noExecutableNode'));
      }

      setStep({ id: 'approve', title: t('steps.approve.title'), status: 'running' });
      const approved = await approvePlan.mutateAsync({
        planId: planBundle.implementation_plan.id,
        payload: { approved: true },
      });
      setStep({
        id: 'approve',
        title: t('steps.approve.title'),
        status: 'success',
        detail: t('steps.approve.detail', { id: approved.implementation_plan.id }),
      });

      setStep({ id: 'run', title: t('steps.run.title'), status: 'running' });
      const run = await startRun.mutateAsync({
        planId: approved.implementation_plan.id,
        payload: { executor: 'codex_cli', pr_node_ids: [firstNode.id] },
      });
      setStep({
        id: 'run',
        title: t('steps.run.title'),
        status: 'success',
        detail: `Run #${run.run.id}`,
      });

      setStep({ id: 'dispatch', title: t('steps.dispatch.title'), status: 'running' });
      const dispatched = await dispatchRun.mutateAsync({
        runId: run.run.id,
        payload: { max_tasks: 1, require_runtime_ready: true },
      });
      const task = dispatched.tasks.find(candidate => candidate.status === 'dispatched');
      if (!task) {
        throw new Error(t('errors.noDispatchedTask'));
      }
      setStep({
        id: 'dispatch',
        title: t('steps.dispatch.title'),
        status: 'success',
        detail: `Task #${task.id}`,
      });

      setStep({
        id: 'codex',
        title: t('steps.codexWaiting.title'),
        status: 'running',
        detail: t('steps.codexWaiting.detail'),
      });
      const executed = await waitForRuntimeTaskCompletion(run.run.id, task.id, t('errors.timeout'));
      const executedTask = executed.tasks.find(candidate => candidate.id === task.id);
      if (!executedTask || executedTask.status !== 'completed') {
        throw new Error(executedTask?.failure_reason || executedTask?.error_log || t('errors.codexFailed'));
      }
      setStep({
        id: 'codex',
        title: t('steps.codexDone.title'),
        status: 'success',
        detail: t('steps.codexDone.detail'),
      });

      const prNode = executed.plan?.pr_nodes.find(node => node.id === task.pr_node_id);
      setStep({
        id: 'pr',
        title: t('steps.pr.title'),
        status: prNode?.github_pr_url ? 'success' : 'error',
        detail: prNode?.github_pr_url ? t('steps.pr.detail', { number: prNode.github_pr_number ?? '' }) : t('steps.pr.missing'),
        href: prNode?.github_pr_url,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t('errors.flowFailed');
      setStep({ id: 'error', title: t('steps.error.title'), status: 'error', detail });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-medium text-text-main">{t('title')}</h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">{t('description')}</p>
        </div>
        <Badge variant="outline">Advanced</Badge>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-text-main">{t('readiness.title')}</div>
                <div className="mt-1 text-xs leading-5 text-text-muted">
                  {t('readiness.description')}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  readiness?.ready
                    ? 'border-success/30 text-success'
                    : readinessBlocked || readinessQuery.isError
                      ? 'border-error/30 text-error'
                      : 'border-primary/30 text-primary'
                }
              >
                {readiness?.ready
                  ? t('readiness.status.ready')
                  : readinessBlocked || readinessQuery.isError
                    ? t('readiness.status.blocked')
                    : t('readiness.status.checking')}
              </Badge>
            </div>
            {readinessQuery.isError ? (
              <div className="mt-3 rounded-md border border-error/30 bg-error-subtle px-3 py-2 text-xs leading-5 text-error">
                {t('readiness.error')}
              </div>
            ) : readiness ? (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {readiness.checks.map(check => (
                  <ReadinessCheckRow key={check.key} check={check} />
                ))}
              </div>
            ) : (
              <div className="mt-3 text-xs leading-5 text-text-muted">
                {t('readiness.checkingRepository')}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="e2e-issue-title">{t('issueTitleLabel')}</Label>
            <Input
              id="e2e-issue-title"
              value={issueTitle}
              onChange={event => setIssueTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="e2e-issue-body">{t('issueBodyLabel')}</Label>
            <Textarea
              id="e2e-issue-body"
              value={issueBody}
              rows={4}
              onChange={event => setIssueBody(event.target.value)}
            />
          </div>
          <Button
            type="button"
            onClick={runFlow}
            disabled={
              running ||
              readinessChecking ||
              readinessBlocked ||
              !repository?.repository_id ||
              !issueTitle.trim()
            }
          >
            {running
              ? t('button.running')
              : readinessBlocked
                ? t('button.blocked')
                : t('button.start')}
          </Button>
        </div>
        <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">{t('timeline.title')}</div>
          {steps.length === 0 ? (
            <div className="text-sm leading-6 text-text-muted">{t('timeline.empty')}</div>
          ) : (
            <div className="space-y-2">
              {steps.map(step => (
                <FlowStepRow key={step.id} step={step} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FlowStepRow({ step }: { step: FlowStep }) {
  const t = useT('dashboard.projectDelivery.e2e');
  const tone =
    step.status === 'success'
      ? 'border-success/30 text-success'
      : step.status === 'error'
        ? 'border-error/30 text-error'
        : step.status === 'running'
          ? 'border-primary/30 text-primary'
          : 'border-border-subtle text-text-muted';

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text-main">{step.title}</span>
        <Badge variant="outline" className={tone}>
          {step.status === 'running'
            ? t('stepStatus.running')
            : step.status === 'success'
              ? t('stepStatus.success')
              : step.status === 'error'
                ? t('stepStatus.error')
                : t('stepStatus.pending')}
        </Badge>
      </div>
      {step.detail ? <div className="mt-1 text-xs leading-5 text-text-muted">{step.detail}</div> : null}
      {step.href ? (
        <a
          href={step.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-xs font-medium text-primary hover:underline"
        >
          {t('linkLabel')}
        </a>
      ) : null}
    </div>
  );
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
  const label =
    check.status === 'ok'
      ? t('checkStatus.ok')
      : check.status === 'warning'
        ? t('checkStatus.warning')
        : t('checkStatus.error');

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

function readinessProblemSummary(
  checks: GitHubRepositoryReadinessCheckDTO[],
  emptyMessage: string,
  locale: string
) {
  if (checks.length === 0) {
    return emptyMessage;
  }
  return checks
    .map(check => {
      const localizedCheck = localizeGitHubReadinessCheck(check, locale);
      return `${localizedCheck.message}${localizedCheck.detail ? `: ${localizedCheck.detail}` : ''}`;
    })
    .join(locale.startsWith('zh') ? '；' : '; ');
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
    installation: 'GitHub App installation is synced',
    installation_token: 'GitHub App token is available',
  };

  return {
    message: permissionMessage ?? messages[check.key] ?? check.message,
    detail: localizeGitHubReadinessDetail(check.detail),
  };
}

function permissionReadinessMessage(
  permissionName: string,
  status: GitHubRepositoryReadinessCheckDTO['status']
) {
  if (status === 'ok') {
    return `${permissionName} permission is available`;
  }
  if (status === 'warning') {
    return `GitHub App is missing ${permissionName}; later CI reads may be unavailable`;
  }
  return `GitHub App is missing required ${permissionName} permission`;
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

function deliveryTaskStatusLabel(status: PRNode['status']) {
  switch (status) {
    case 'planned':
      return 'Planned';
    case 'queued':
      return 'Queued';
    case 'running':
      return 'Running';
    case 'waiting_on_dependencies':
      return 'Waiting';
    case 'pr_opened':
      return 'PR opened';
    case 'ci_running':
      return 'CI running';
    case 'ready_for_review':
      return 'Ready';
    case 'blocked':
      return 'Blocked';
    case 'merged':
      return 'Merged';
    case 'closed':
      return 'Closed';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function deliveryTaskStatusClassName(status: PRNode['status']) {
  if (['ready_for_review', 'completed', 'merged', 'pr_opened'].includes(status)) {
    return 'border-success/30 text-success';
  }
  if (['running', 'ci_running', 'queued'].includes(status)) {
    return 'border-primary/30 text-primary';
  }
  if (['blocked', 'failed', 'cancelled', 'closed'].includes(status)) {
    return 'border-error/30 text-error';
  }
  return 'text-text-muted';
}

function formatDeliveryTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

async function waitForRuntimeTaskCompletion(runId: number, taskId: number, timeoutMessage: string) {
  const terminalStatuses = new Set([
    'completed',
    'failed',
    'cancelled',
    'blocked',
    'dependency_closed',
  ]);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const bundle = await specForgeService.getRun(runId);
    const task = bundle.tasks.find(candidate => candidate.id === taskId);
    if (task && terminalStatuses.has(task.status)) {
      return bundle;
    }
    await sleep(2000);
  }
  throw new Error(timeoutMessage);
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function parseGitHubRepositoryURL(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const shorthand = normalized.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }
  try {
    const url = new URL(normalized);
    if (!url.hostname.endsWith('github.com')) {
      return null;
    }
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    return null;
  }
}
