"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  GitPullRequest,
  Play,
  ShieldAlert,
  Sparkles,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils";
import { defaultIdea, demoPlan } from "@/features/specforge/mock-data";
import type { ExecutionRun, PRNode } from "@/features/specforge/types";

const statusLabel: Record<PRNode["status"], string> = {
  planned: "Planned",
  queued: "Queued",
  running: "Running",
  waiting_on_dependencies: "Waiting",
  completed: "Completed",
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

export function SpecForgeWorkbench() {
  const [idea, setIdea] = useState(defaultIdea);
  const [hasPlan, setHasPlan] = useState(true);
  const [approved, setApproved] = useState(false);
  const [run, setRun] = useState<ExecutionRun>({
    status: "idle",
    tasks: demoPlan.prNodes,
  });

  const readyCount = run.tasks.filter((task) => task.status === "completed").length;
  const runningCount = run.tasks.filter((task) => task.status === "running").length;
  const waitingCount = run.tasks.filter((task) => task.status === "waiting_on_dependencies").length;

  const progressText = useMemo(() => {
    if (run.status === "idle") {
      return "Awaiting approval";
    }
    return `${readyCount} / ${run.tasks.length} PR nodes completed`;
  }, [readyCount, run.status, run.tasks.length]);

  function generatePlan() {
    setHasPlan(true);
    setApproved(false);
    setRun({ status: "idle", tasks: demoPlan.prNodes });
  }

  function approveAndStart() {
    const startedAt = new Date().toISOString();
    setApproved(true);
    setRun({
      status: "running",
      startedAt,
      tasks: demoPlan.prNodes.map((node, index) => ({
        ...node,
        status: index === 0 ? "running" : "waiting_on_dependencies",
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
          <Metric label="Waiting" value={String(waitingCount)} />
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
              aria-label="Product idea"
            />
            <div className="flex flex-wrap gap-2">
              <Button onClick={generatePlan} disabled={!idea.trim()}>
                Generate implementation plan
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => setIdea(defaultIdea)}>
                Reset
              </Button>
            </div>
            <RepoProfileSummary />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <RunSummary progressText={progressText} approved={approved} run={run} />
          {hasPlan && (
            <Tabs defaultValue="plan" className="gap-4">
              <TabsList className="grid w-full grid-cols-3 md:w-fit">
                <TabsTrigger value="plan">Plan</TabsTrigger>
                <TabsTrigger value="dag">PR DAG</TabsTrigger>
                <TabsTrigger value="run">Run</TabsTrigger>
              </TabsList>

              <TabsContent value="plan" className="space-y-4">
                <PlanReview approved={approved} onApprove={approveAndStart} />
              </TabsContent>
              <TabsContent value="dag">
                <PRDag nodes={demoPlan.prNodes} />
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
    </div>
  );
}

function RepoProfileSummary() {
  const { repoProfile } = demoPlan;

  return (
    <div className="rounded-lg border border-border-subtle bg-muted/30 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <GitBranch className="h-4 w-4 text-primary" />
        Repo profile
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
        <Badge variant="outline" className={run.status === "running" ? statusClassName("running") : ""}>
          {run.status === "idle" ? "No run started" : run.status}
        </Badge>
      </div>
    </div>
  );
}

function PlanReview({ approved, onApprove }: { approved: boolean; onApprove: () => void }) {
  const { productSpec, implementationPlan } = demoPlan;

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
          <Button onClick={onApprove} disabled={approved} className="w-full justify-center">
            {approved ? "Approved" : "Approve & Start"}
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
