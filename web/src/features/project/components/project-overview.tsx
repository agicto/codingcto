'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  GitBranch,
  GitPullRequest,
  Layers3,
  ListChecks,
  ScrollText,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  primaryRepositoryContext,
  projectContextContract,
  projectContextReadiness,
  projectOverviewDecision,
} from '@/features/project/project-context';
import {
  projectContextHref,
  projectRequirementNewHref,
  projectSpecForgeHref,
} from '@/features/project/project-utils';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import { useLatestPlanRun, useLatestProjectPlan } from '@/features/specforge/hooks/use-specforge';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';

export function ProjectOverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;

  if (!validProjectId) {
    return (
      <ProjectOverviewState
        title="Invalid project"
        description="Open a valid project from the project list."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return <ProjectOverviewState title="Loading project" description="Reading project context." />;
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectOverviewState
        title="Project unavailable"
        description="The project context could not be loaded. Confirm backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  return <ProjectOverview context={context} mode="page" />;
}

export function ProjectOverview({
  context,
  selectedRepository,
  mode = 'embedded',
}: {
  context: ProjectContextDTO;
  selectedRepository?: ProjectRepositoryContextDTO;
  mode?: 'page' | 'embedded';
}) {
  const repositoryContext = selectedRepository ?? primaryRepositoryContext(context);
  const readiness = projectContextReadiness(context);
  const decision = projectOverviewDecision(context);
  const contract = projectContextContract(context);
  const deliveryHref = projectSpecForgeHref(context.project.id);
  const contextHref = projectContextHref(context.project.id);
  const requirementHref = projectRequirementNewHref(context.project.id);
  const latestPlanQuery = useLatestProjectPlan(context.project.id);
  const latestPlan = latestPlanQuery.data;
  const latestRunQuery = useLatestPlanRun(latestPlan?.implementation_plan.id, {
    enabled: Boolean(
      latestPlan?.implementation_plan.id && latestPlan.implementation_plan.status === 'approved'
    ),
    refetchInterval: false,
  });
  const latestRun = latestRunQuery.data;
  const resolvedActionHref = resolveOverviewActionHref(
    decision.actionHref,
    deliveryHref,
    contextHref,
    requirementHref
  );
  const toneClassName =
    decision.tone === 'success'
      ? 'border-success/30 bg-success-subtle text-success'
      : decision.tone === 'warning'
        ? 'border-warning/30 bg-warning-subtle text-warning'
        : 'border-info/30 bg-info-subtle text-info';

  return (
    <section
      className={
        mode === 'page'
          ? 'mx-auto w-full max-w-7xl px-4 py-6 md:px-8'
          : 'border-b border-border-subtle bg-bg-canvas'
      }
    >
      <div
        className={
          mode === 'page'
            ? 'grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]'
            : 'mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]'
        }
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Project overview</Badge>
            <Badge
              variant="outline"
              className={
                readiness.hasPrimaryRepository
                  ? 'border-success/30 text-success'
                  : 'border-warning/30 text-warning'
              }
            >
              {readiness.hasPrimaryRepository ? 'Primary ready' : 'Primary required'}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
            {context.project.name}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            {context.project.description ||
              'Project boundary for product planning, repository context, execution runs, and PR delivery.'}
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewMetric
              icon={<GitBranch className="h-4 w-4" />}
              label="Primary repo"
              value={repositoryContext?.repository.repository_id ?? 'Missing'}
            />
            <OverviewMetric
              icon={<Layers3 className="h-4 w-4" />}
              label="Context repos"
              value={String(readiness.activeRepositoryCount)}
            />
            <OverviewMetric
              icon={<ListChecks className="h-4 w-4" />}
              label="Skills"
              value={String(readiness.skillCount)}
            />
            <OverviewMetric
              icon={<CircleAlert className="h-4 w-4" />}
              label="Warnings"
              value={String(readiness.warningCount)}
            />
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <OverviewStatusCard
              title="Context readiness"
              value={readiness.nextAction}
              caption={readiness.summary}
              icon={<Sparkles className="h-4 w-4" />}
            />
            <OverviewStatusCard
              title="Latest plan"
              value={
                latestPlan
                  ? latestPlan.implementation_plan.status
                  : latestPlanQuery.isFetching
                    ? 'Loading'
                    : 'No plan yet'
              }
              caption={
                latestPlan
                  ? `${latestPlan.pr_nodes.length} PR nodes planned`
                  : 'Create a requirement to generate a plan.'
              }
              icon={<ScrollText className="h-4 w-4" />}
            />
            <OverviewStatusCard
              title="Latest run"
              value={
                latestRun
                  ? latestRun.run.status
                  : latestRunQuery.isFetching
                    ? 'Loading'
                    : 'No run yet'
              }
              caption={
                latestRun
                  ? `${latestRun.tasks.length} execution tasks tracked`
                  : 'Approve a plan before execution.'
              }
              icon={<GitPullRequest className="h-4 w-4" />}
            />
          </div>
        </div>

        <Card className="border-border-subtle shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className={`rounded-md border p-2 ${toneClassName}`}>
                {decision.tone === 'success' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <CircleAlert className="h-4 w-4" />
                )}
              </span>
              {decision.title}
            </CardTitle>
            <CardDescription className="leading-6">{decision.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={resolvedActionHref}>
                {decision.actionLabel}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <div className="mt-4 grid gap-2 text-xs text-text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>Context contract</span>
                <span className="truncate text-text-main">{contract?.version ?? 'Not ready'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Execution repo</span>
                <span className="truncate text-text-main">
                  {contract?.execution_repository_id ??
                    repositoryContext?.repository.repository_id ??
                    'Missing'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Delivery unit</span>
                <span className="inline-flex items-center gap-1 text-text-main">
                  Pull requests
                  <GitPullRequest className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function ProjectOverviewState({
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

function OverviewMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2">
      <div className="flex items-center gap-2 text-xs text-text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 truncate text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function OverviewStatusCard({
  icon,
  title,
  value,
  caption,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-muted">
        {icon}
        {title}
      </div>
      <div className="mt-2 text-sm font-medium text-text-main">{value}</div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{caption}</p>
    </div>
  );
}

function resolveOverviewActionHref(
  anchor: string,
  deliveryHref: string,
  contextHref: string,
  requirementHref: string
): string {
  if (anchor === '#project-context') {
    return contextHref;
  }
  if (anchor === '#project-requirement') {
    return requirementHref;
  }
  if (anchor.startsWith('#')) {
    return `${deliveryHref}${anchor}`;
  }
  return anchor;
}
