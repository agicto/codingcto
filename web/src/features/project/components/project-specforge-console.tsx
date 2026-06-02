'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileText,
  GitBranch,
  Github,
  ListChecks,
  Rocket,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import {
  projectOverviewHref,
  projectRequirementNewHref,
} from '@/features/project/project-utils';
import type { ProjectContextDTO } from '@/features/project/services/project-service';
import {
  useGitHubRepositoryReadiness,
  useLatestProjectPlan,
} from '@/features/specforge/hooks/use-specforge';

export function ProjectSpecForgeConsole() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;

  if (!validProjectId) {
    return (
      <DeliveryState
        title="Invalid project"
        description="Open a valid project before starting CodingCTO delivery."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return <DeliveryState title="Loading project" description="Reading project context." />;
  }

  if (contextQuery.isError || !context) {
    return (
      <DeliveryState
        title="Project unavailable"
        description="The project could not be loaded. Check backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  return <ProjectDeliveryHome context={context} />;
}

function ProjectDeliveryHome({ context }: { context: ProjectContextDTO }) {
  const readiness = projectContextReadiness(context);
  const primaryRepository = primaryRepositoryContext(context);
  const repositoryId = primaryRepository?.repository.repository_id;
  const githubReadiness = useGitHubRepositoryReadiness(repositoryId);
  const latestPlan = useLatestProjectPlan(context.project.id);
  const blockingChecks =
    githubReadiness.data?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const repositoryReady = Boolean(githubReadiness.data?.ready);
  const canStart = readiness.hasPrimaryRepository && repositoryReady;
  const nextAction = !readiness.hasPrimaryRepository
    ? '先绑定一个主仓库'
    : !repositoryReady
      ? '先完成 GitHub 检查'
      : '输入需求，生成计划';

  return (
    <main className="h-full overflow-y-auto bg-bg-canvas">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-8">
        <header className="rounded-lg border border-border-subtle bg-bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">CodingCTO Delivery</Badge>
            <Badge
              variant="outline"
              className={canStart ? 'border-success/30 text-success' : 'border-warning/30 text-warning'}
            >
              {canStart ? 'Ready' : 'Setup needed'}
            </Badge>
          </div>
          <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-text-main">
                {context.project.name}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                这个页面只做一件事：把当前项目的一条需求变成可评审的 GitHub PR。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={projectOverviewHref(context.project.id)}>项目资料</Link>
              </Button>
              {canStart ? (
                <Button asChild>
                  <Link href={projectRequirementNewHref(context.project.id)}>
                    输入需求
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button disabled>
                  输入需求
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          <StatusCard
            icon={Github}
            title="主仓库"
            value={primaryRepository?.repository.repository_id ?? '未绑定'}
            ok={readiness.hasPrimaryRepository}
            actionHref={projectOverviewHref(context.project.id)}
            actionLabel="去绑定"
          />
          <StatusCard
            icon={CheckCircle2}
            title="GitHub 检查"
            value={
              githubReadiness.isFetching && !githubReadiness.data
                ? '检查中'
                : repositoryReady
                  ? '已通过'
                  : '需要处理'
            }
            ok={repositoryReady}
            actionHref="/console/settings?tab=github"
            actionLabel="去设置"
          />
          <StatusCard
            icon={ListChecks}
            title="最新计划"
            value={
              latestPlan.data
                ? `Plan #${latestPlan.data.implementation_plan.id}`
                : latestPlan.isFetching
                  ? '读取中'
                  : '暂无'
            }
            ok={Boolean(latestPlan.data)}
            actionHref={projectRequirementNewHref(context.project.id)}
            actionLabel="新建需求"
          />
        </section>

        {!canStart ? (
          <Alert>
            <CircleAlert className="h-4 w-4" />
            <AlertTitle>{nextAction}</AlertTitle>
            <AlertDescription className="mt-2">
              {!readiness.hasPrimaryRepository
                ? 'CodingCTO 需要一个主仓库作为执行目标。项目资料页可以绑定 GitHub 仓库并生成仓库材料。'
                : readinessProblemSummary(blockingChecks)}
            </AlertDescription>
          </Alert>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <StepCard
            icon={FileText}
            step="01"
            title="输入需求"
            description="写清楚功能、问题或改动目标。这里不会直接运行代码。"
          />
          <StepCard
            icon={GitBranch}
            step="02"
            title="生成计划"
            description="CodingCTO 会基于项目材料生成计划和 PR 拆分。"
          />
          <StepCard
            icon={Rocket}
            step="03"
            title="审批交付"
            description="确认计划后再派发给本地 runtime，最终创建 GitHub PR。"
          />
        </section>
      </div>
    </main>
  );
}

function StatusCard({
  icon: Icon,
  title,
  value,
  ok,
  actionHref,
  actionLabel,
}: {
  icon: typeof Github;
  title: string;
  value: string;
  ok: boolean;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-muted">{title}</div>
              <div className="mt-1 truncate text-base font-semibold text-text-main">{value}</div>
            </div>
          </div>
          <Badge
            variant="outline"
            className={ok ? 'border-success/30 text-success' : 'border-warning/30 text-warning'}
          >
            {ok ? 'OK' : 'Todo'}
          </Badge>
        </div>
        {!ok ? (
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function StepCard({
  icon: Icon,
  step,
  title,
  description,
}: {
  icon: typeof FileText;
  step: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-subtle text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-sm font-semibold text-text-muted">{step}</span>
      </div>
      <h2 className="mt-4 text-base font-semibold text-text-main">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function DeliveryState({
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

function readinessProblemSummary(
  checks: Array<{ message: string; detail?: string; required: boolean; status: string }>
) {
  if (checks.length === 0) {
    return 'GitHub 仓库还没有通过检查。请确认 GitHub App 已安装、仓库已同步，并且权限满足 Issue、PR 和代码读取需求。';
  }
  return checks
    .slice(0, 2)
    .map(check => check.detail || check.message)
    .join(' ');
}
