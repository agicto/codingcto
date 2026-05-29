"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  GitPullRequest,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils";
import {
  executionRunFromDTO,
  planBundleFromDTO,
} from "@/features/specforge/plan-adapter";
import {
  defaultIdea,
  demoPlan,
  demoRuntimes,
  demoRuntimeNow,
} from "@/features/specforge/mock-data";
import {
  runtimeFromDTO,
  summarizeRuntimeHealth,
} from "@/features/specforge/runtime-health";
import {
  useApproveSpecForgePlan,
  useCreateSpecForgeIdea,
  useDispatchExecutionRun,
  useExecutionRun,
  useSpecForgeRuntimes,
  useStartExecutionRun,
} from "@/features/specforge/hooks/use-specforge";
import type {
  ExecutionRun,
  PlanBundle,
  PRNode,
  RepoProfile,
} from "@/features/specforge/types";

const statusLabel: Record<PRNode["status"], string> = {
  planned: "Planned",
  queued: "Queued",
  running: "Running",
  waiting_on_dependencies: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function statusClassName(status: PRNode["status"]) {
  if (status === "completed") {
    return "border-success/30 bg-success-subtle text-success";
  }
  if (status === "running") {
    return "border-info/30 bg-info-subtle text-info";
  }
  if (status === "waiting_on_dependencies") {
    return "border-warning/30 bg-warning-subtle text-warning";
  }
  if (status === "failed" || status === "cancelled") {
    return "border-error/30 bg-error-subtle text-error";
  }
  return "border-border bg-bg-surface text-text-subtle";
}

function riskClassName(risk: PRNode["estimatedRisk"]) {
  if (risk === "high") {
    return "border-error/30 bg-error-subtle text-error";
  }
  if (risk === "medium") {
    return "border-warning/30 bg-warning-subtle text-warning";
  }
  return "border-success/30 bg-success-subtle text-success";
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

export function SpecForgeWorkbench() {
  const [idea, setIdea] = useState(defaultIdea);
  const [repoId, setRepoId] = useState(demoPlan.repoProfile.repositoryId);
  const [activePlan, setActivePlan] = useState<PlanBundle>(demoPlan);
  const activePlanRef = useRef(activePlan);
  const [planSource, setPlanSource] = useState<"api" | "demo">("demo");
  const [hasPlan, setHasPlan] = useState(true);
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<ExecutionRun>({
    status: "idle",
    tasks: demoPlan.prNodes,
  });
  const [currentRuntimeNow] = useState(() => Date.now());

  const createIdea = useCreateSpecForgeIdea(repoId.trim());
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const isStartingRun = approvePlan.isPending || startRun.isPending || dispatchRun.isPending;
  const runQuery = useExecutionRun(run.runId, {
    enabled: Boolean(run.runId),
    refetchInterval: run.status === "queued" || run.status === "running" ? 5000 : false,
  });
  const readyCount = run.tasks.filter((task) => task.status === "completed").length;
  const runningCount = run.tasks.filter((task) => task.status === "running").length;
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
    if (run.status === "idle") {
      return runtimeSummary.online > 0
        ? "Awaiting plan approval; a healthy executor is ready"
        : "Awaiting plan approval; no healthy executor is online";
    }
    return `${readyCount} / ${run.tasks.length} PR nodes completed`;
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
      const bundle = await createIdea.mutateAsync({
        input: trimmedIdea,
        type: "feature",
      });
      const nextPlan = planBundleFromDTO(bundle);
      setActivePlan(nextPlan);
      setIdea(nextPlan.idea);
      setPlanSource("api");
      setHasPlan(true);
      setRun({ status: "idle", tasks: nextPlan.prNodes });
    } catch {
      const fallbackPlan = demoPlanForInput(trimmedIdea, trimmedRepoId);
      setActivePlan(fallbackPlan);
      setPlanSource("demo");
      setHasPlan(true);
      setRun({ status: "idle", tasks: fallbackPlan.prNodes });
    }
  }

  function resetIdea() {
    setIdea(defaultIdea);
    setRepoId(demoPlan.repoProfile.repositoryId);
    setActivePlan(demoPlan);
    setPlanSource("demo");
    setHasPlan(true);
    setApproved(false);
    setRun({ status: "idle", tasks: demoPlan.prNodes });
  }

  async function approveAndStart() {
    if (activePlan.planId) {
      try {
        const approvedPlan =
          activePlan.implementationPlan.status === "approved"
            ? activePlan
            : planBundleFromDTO(
                await approvePlan.mutateAsync({
                  planId: activePlan.planId,
                  payload: { approved: true },
                })
              );
        setActivePlan(approvedPlan);

        const started = await startRun.mutateAsync({
          planId: approvedPlan.planId ?? activePlan.planId,
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
    setRun({
      status: "running",
      startedAt,
      tasks: activePlan.prNodes.map((node) => ({
        ...node,
        status: node.dependsOn.length === 0 ? "running" : "waiting_on_dependencies",
      })),
    });
  }

  function advanceRun() {
    setRun((current) => {
      const nextTasks = current.tasks.map((task) => ({ ...task }));
      const runningIndex = nextTasks.findIndex((task) => task.status === "running");

      if (runningIndex >= 0) {
        nextTasks[runningIndex].status = "completed";
        const completedKeys = new Set(
          nextTasks
            .filter((task) => task.status === "completed")
            .map((task) => task.nodeKey)
        );
        const nextWaiting = nextTasks.find((task) => {
          return (
            task.status === "waiting_on_dependencies" &&
            task.dependsOn.every((dependency) => completedKeys.has(dependency))
          );
        });
        if (nextWaiting) {
          nextWaiting.status = "running";
        }
      }

      const isDone = nextTasks.every((task) => task.status === "completed");
      return {
        ...current,
        status: isDone ? "completed" : "running",
        tasks: nextTasks,
      };
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">SpecForge</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Describe a feature, review the product and technical plan, then start a PR-oriented
            execution run.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <Metric label="Ready" value={String(readyCount)} />
          <Metric label="Running" value={String(runningCount)} />
          <Metric label="Executors" value={String(runtimeSummary.online)} />
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              Idea intake
            </CardTitle>
            <CardDescription>Start with product intent, not issue-sized tasks.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              className="min-h-36"
              aria-label="Describe the feature SpecForge should turn into reviewable PRs"
              placeholder="Describe the product outcome, constraints, and any implementation boundaries..."
            />
            <Input
              value={repoId}
              onChange={(event) => setRepoId(event.target.value)}
              aria-label="Repository ID"
              placeholder="Repository ID"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={generatePlan}
                disabled={!idea.trim() || !repoId.trim() || createIdea.isPending}
              >
                {createIdea.isPending ? "Generating plan" : "Generate implementation plan"}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={resetIdea}>
                Reset
              </Button>
            </div>
            <RepoProfileSummary repoProfile={activePlan.repoProfile} planSource={planSource} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <RunSummary progressText={progressText} approved={approved} run={run} />
          <RuntimeReadiness
            onlineCount={runtimeSummary.online}
            recentlyLostCount={runtimeSummary.recently_lost}
            isLoading={runtimesQuery.isLoading}
            isFallback={Boolean(runtimesQuery.isError || !runtimeDTOs?.length)}
          />
          {hasPlan && (
            <Tabs defaultValue="plan" className="gap-4">
              <TabsList className="grid w-full grid-cols-3 md:w-fit">
                <TabsTrigger value="plan">Plan</TabsTrigger>
                <TabsTrigger value="dag">PR DAG</TabsTrigger>
                <TabsTrigger value="run">Run</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4">
                <PlanReview
                  plan={activePlan}
                  approved={approved}
                  isStarting={isStartingRun}
                  onApprove={approveAndStart}
                />
              </TabsContent>
              <TabsContent value="dag">
                <PRDag nodes={activePlan.prNodes} />
              </TabsContent>
              <TabsContent value="run">
                <ExecutionStatus run={run} onAdvance={advanceRun} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </section>
    </div>
  );
}

function RuntimeReadiness({
  onlineCount,
  recentlyLostCount,
  isLoading,
  isFallback,
}: {
  onlineCount: number;
  recentlyLostCount: number;
  isLoading: boolean;
  isFallback: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
          <Terminal className="h-4 w-4 text-primary" />
        </div>
        <div>
          <div className="text-sm font-medium">Executor readiness</div>
          <div className="mt-1 text-sm text-text-muted">
            {isLoading
              ? "Checking executor runtime heartbeats."
              : onlineCount > 0
                ? "Approved plans can be dispatched to a healthy runtime."
                : "Execution will wait until a runtime heartbeat is online."}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={onlineCount > 0 ? statusClassName("completed") : ""}>
          {onlineCount} online
        </Badge>
        <Badge
          variant="outline"
          className={recentlyLostCount > 0 ? statusClassName("waiting_on_dependencies") : ""}
        >
          {recentlyLostCount} unstable
        </Badge>
        {isFallback && (
          <Badge variant="outline" className="border-border bg-bg-surface text-text-subtle">
            demo fallback
          </Badge>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
    </div>
  );
}

function RepoProfileSummary({
  repoProfile,
  planSource,
}: {
  repoProfile: RepoProfile;
  planSource: "api" | "demo";
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitBranch className="h-4 w-4 text-primary" />
          Repo profile
        </div>
        <Badge
          variant="outline"
          className={planSource === "api" ? statusClassName("completed") : ""}
        >
          {planSource === "api" ? "API plan" : "Demo fallback"}
        </Badge>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-muted">{repoProfile.summary}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {repoProfile.stack.map((item) => (
          <Badge key={item} variant="outline">
            {item}
          </Badge>
        ))}
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
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <div className="text-sm font-medium">Delivery state</div>
        <div className="mt-1 text-sm text-text-muted">{progressText}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className={approved ? statusClassName("completed") : ""}>
          {approved ? "Plan approved" : "Plan approval required"}
        </Badge>
        <Badge
          variant="outline"
          className={run.status === "running" ? statusClassName("running") : ""}
        >
          {run.status === "idle" ? "No run started" : run.status}
        </Badge>
      </div>
    </div>
  );
}

function PlanReview({
  plan,
  approved,
  isStarting,
  onApprove,
}: {
  plan: PlanBundle;
  approved: boolean;
  isStarting: boolean;
  onApprove: () => void;
}) {
  const { productSpec, implementationPlan } = plan;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product understanding</CardTitle>
          <CardDescription>Defaults and acceptance criteria before execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="Goals" items={productSpec.goals} />
          <ListBlock title="Business rules" items={productSpec.businessRules} />
          <ListBlock title="Acceptance criteria" items={productSpec.acceptanceCriteria} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technical plan</CardTitle>
          <CardDescription>{implementationPlan.technicalSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="Affected areas" items={implementationPlan.affectedAreas} />
          <ListBlock title="Security risks" items={implementationPlan.securityRisks} icon="risk" />
          <ListBlock title="Migration risks" items={implementationPlan.migrationRisks} />
          <Button
            onClick={onApprove}
            disabled={approved || isStarting}
            className="w-full justify-center"
          >
            {approved ? "Approved" : isStarting ? "Starting run" : "Approve & Start"}
            {approved ? <CheckCircle2 className="ml-1.5 h-4 w-4" /> : <Play className="ml-1.5 h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ListBlock({
  title,
  items,
  icon,
}: {
  title: string;
  items: string[];
  icon?: "risk";
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {icon === "risk" && <ShieldAlert className="h-4 w-4 text-warning" />}
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PRDag({ nodes }: { nodes: PRNode[] }) {
  return (
    <div className="space-y-3">
      {nodes.map((node, index) => (
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
                    {node.estimatedRisk} risk
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <CompactList title="Depends on" items={node.dependsOn.length ? node.dependsOn : ["None"]} />
              <CompactList title="Expected files" items={node.expectedFiles} />
              <CompactList title="Tests" items={node.testCommands} />
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}

function ExecutionStatus({ run, onAdvance }: { run: ExecutionRun; onAdvance: () => void }) {
  const canAdvance = run.status === "running";

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Execution run</CardTitle>
          <CardDescription>
            Delivery state is organized by PR node, not by individual agent workers.
          </CardDescription>
        </div>
        <Button onClick={onAdvance} disabled={!canAdvance} variant="outline">
          Advance demo run
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "flex flex-col gap-3 rounded-lg border border-border-subtle p-4 md:flex-row md:items-center md:justify-between",
              task.status === "running" && "border-info/40 bg-info-subtle"
            )}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium">{task.title}</span>
              </div>
              <div className="mt-1 text-xs text-text-muted">{task.branchName}</div>
            </div>
            <Badge variant="outline" className={statusClassName(task.status)}>
              {statusLabel[task.status]}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CompactList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-text-muted">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-text-main">
        {items.map((item) => (
          <li key={item} className="truncate">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
