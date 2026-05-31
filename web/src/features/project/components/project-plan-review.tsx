'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowRight, GitPullRequest, ScrollText } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { projectContextHref, projectSpecForgeHref } from '@/features/project/project-utils';
import {
  executionRunFromDTO,
  planBundleFromDTO,
} from '@/features/specforge/plan-adapter';
import {
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import { executionReadinessForExecutor } from '@/features/specforge/execution-readiness';
import { PlanReview } from '@/features/specforge/components/workbench-plan';
import { runtimeFromDTO } from '@/features/specforge/runtime-health';
import {
  useApproveSpecForgePlan,
  useDispatchExecutionRun,
  useSpecForgePlan,
  useSpecForgeRuntimes,
  useStartExecutionRun,
} from '@/features/specforge/hooks/use-specforge';
import type { SpecForgePlanBundleDTO } from '@/features/specforge/services/specforge-service';
import type { PlanBundle } from '@/features/specforge/types';

export function ProjectPlanReviewPage() {
  const params = useParams<{ projectId: string; planId: string }>();
  const projectId = Number(params.projectId);
  const planId = Number(params.planId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const validPlanId = Number.isFinite(planId) ? planId : 0;
  const planQuery = useSpecForgePlan(validPlanId);

  if (!validProjectId || !validPlanId) {
    return (
      <PlanReviewState
        title="Invalid plan"
        description="Open a valid plan from a project requirement."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!planQuery.data && planQuery.isFetching) {
    return <PlanReviewState title="Loading plan" description="Reading plan snapshot." />;
  }

  if (planQuery.isError || !planQuery.data) {
    return (
      <PlanReviewState
        title="Plan unavailable"
        description="The plan snapshot could not be loaded. Confirm backend auth and try again."
        actionHref={projectContextHref(validProjectId)}
        actionLabel="Review context"
      />
    );
  }

  return (
    <ProjectPlanReview
      key={planQuery.data.implementation_plan.id}
      projectId={validProjectId}
      bundle={planQuery.data}
    />
  );
}

function ProjectPlanReview({
  projectId,
  bundle,
}: {
  projectId: number;
  bundle: SpecForgePlanBundleDTO;
}) {
  const router = useRouter();
  const initialPlan = useMemo(() => planBundleFromDTO(bundle), [bundle]);
  const [plan, setPlan] = useState<PlanBundle>(initialPlan);
  const [decisionOverrides, setDecisionOverrides] = useState<Record<string, string>>(() =>
    defaultDecisionOverrides(initialPlan)
  );
  const [selectedExecutionNodeIds, setSelectedExecutionNodeIds] = useState<string[]>(() =>
    initialPlan.prNodes.map(node => node.id)
  );
  const [message, setMessage] = useState('');
  const runtimesQuery = useSpecForgeRuntimes({ limit: 20 });
  const runtimes = useMemo(
    () => (runtimesQuery.data?.runtimes ?? []).map(runtimeFromDTO),
    [runtimesQuery.data?.runtimes]
  );
  const [runtimeNow] = useState(() => Date.now());
  const executionReadiness = useMemo(
    () =>
      executionReadinessForExecutor({
        runtimes,
        executor: 'codex_cli',
        now: runtimeNow,
        allowFallback: false,
      }),
    [runtimeNow, runtimes]
  );
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const isStarting = approvePlan.isPending || startRun.isPending || dispatchRun.isPending;
  const approved = plan.implementationPlan.status === 'approved';
  const boardHref = `${projectSpecForgeHref(projectId)}#project-delivery`;

  async function approveAndStart() {
    const selectedPRNodeIDs = selectedExecutionNodeIds
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && id > 0);
    if (selectedPRNodeIDs.length === 0 || !plan.planId) {
      return;
    }

    setMessage('');
    try {
      const approvedPlan =
        plan.implementationPlan.status === 'approved'
          ? plan
          : planBundleFromDTO(
              await approvePlan.mutateAsync({
                planId: plan.planId,
                payload: {
                  approved: true,
                  decision_overrides: normalizeDecisionOverrides(decisionOverrides),
                },
              })
            );
      setPlan(approvedPlan);

      const started = await startRun.mutateAsync({
        planId: approvedPlan.planId ?? plan.planId,
        payload: {
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
        setPlan(next.plan);
      }
      router.push(boardHref);
    } catch {
      setMessage('Plan approval or dispatch failed. Check runtime readiness and try again.');
    }
  }

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-bg-canvas">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-8">
        <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Plan review</Badge>
              <Badge
                variant="outline"
                className={
                  approved ? 'border-success/30 text-success' : 'border-warning/30 text-warning'
                }
              >
                {approved ? 'Approved' : 'Awaiting approval'}
              </Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
              Review plan before execution
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Confirm product understanding, decisions, technical scope, PR DAG, risks, skill
              pipeline, and execution range before CodingCTO dispatches a runtime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={projectContextHref(projectId)}>Review context</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={boardHref}>
                Open board
                <GitPullRequest className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <PlanMetaCard plan={plan} runtimeCount={executionReadiness.healthyRuntimeCount} />

        {message ? (
          <Alert>
            <AlertTitle>Approval did not start</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        <PlanReview
          plan={plan}
          decisionOverrides={decisionOverrides}
          selectedExecutionNodeIds={selectedExecutionNodeIds}
          approved={approved}
          isStarting={isStarting}
          executionReadiness={executionReadiness}
          onDecisionOverrideChange={(key, value) =>
            setDecisionOverrides(current => ({ ...current, [key]: value }))
          }
          onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
          onApprove={approveAndStart}
        />
      </div>
    </main>
  );
}

function PlanMetaCard({ plan, runtimeCount }: { plan: PlanBundle; runtimeCount: number }) {
  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-primary" />
          Plan snapshot
        </CardTitle>
        <CardDescription className="leading-6">{plan.idea}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm md:grid-cols-4">
        <MetaItem label="Plan ID" value={plan.planId ? String(plan.planId) : 'Draft'} />
        <MetaItem label="Repository" value={plan.repoProfile.repositoryId} />
        <MetaItem label="PR nodes" value={String(plan.prNodes.length)} />
        <MetaItem label="Ready runtimes" value={String(runtimeCount)} />
      </CardContent>
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate font-medium text-text-main">{value}</div>
    </div>
  );
}

function PlanReviewState({
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
          <Link href={actionHref}>
            {actionLabel}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
