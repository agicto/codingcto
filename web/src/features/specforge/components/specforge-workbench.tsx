'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  GitBranch,
  GitMerge,
  ListChecks,
  Play,
  ScrollText,
  Sparkles,
  Terminal,
} from 'lucide-react';

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
import { projectSpecForgeHref, slugFromProjectName } from '@/features/project/project-utils';
import {
  useCreateProject,
  useCreateWorkspace,
  useProjects,
} from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  executionRunFromDTO,
  planBundleFromDTO,
} from '@/features/specforge/plan-adapter';
import {
  WorkbenchDeliveryBoard,
  WorkbenchModeTabs,
  type WorkbenchItemId,
  type WorkbenchStage,
} from '@/features/specforge/components/workbench-board';
import {
  DetailPanel,
  EmptyProjectPlanPanel,
} from '@/features/specforge/components/workbench-panels';
import { PlanReview } from '@/features/specforge/components/workbench-plan';
import { ExecutionStatus, RunSummary } from '@/features/specforge/components/workbench-execution';
import { RepoContextPanel } from '@/features/specforge/components/workbench-context';
import { PRDag } from '@/features/specforge/components/workbench-prompt';
import { statusClassName, type PromptMode } from '@/features/specforge/components/workbench-utils';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';
import {
  defaultIdea,
  demoPlan,
  demoRuntimes,
  demoRuntimeNow,
} from '@/features/specforge/mock-data';
import { runtimeFromDTO, summarizeRuntimeHealth } from '@/features/specforge/runtime-health';
import {
  useApproveSpecForgePlan,
  useCancelExecutionRun,
  useCompileSpecForgePrompt,
  useCreateSpecForgeIdea,
  useCreateSpecForgeProjectIdea,
  useDispatchExecutionRun,
  useExecutionRun,
  useLatestPlanRun,
  useLatestProjectPlan,
  useSpecForgeRuntimes,
  useSweepSpecForgeRuntimes,
  useSweepSpecForgeTasks,
  useStartExecutionRun,
} from '@/features/specforge/hooks/use-specforge';
import {
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import { executionReadinessForExecutor } from '@/features/specforge/execution-readiness';
import type { SpecForgeExecutionBundleDTO } from '@/features/specforge/services/specforge-service';
import { isPRNodeActive, isPRNodeDelivered } from '@/features/specforge/status';
import type { ExecutionRun, ExecutorRuntime, PlanBundle, PRNode } from '@/features/specforge/types';

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
  const initialRepoId = initialRepositoryId?.trim() || demoPlan.repoProfile.repositoryId;
  const initialIdea = projectId ? '' : defaultIdea;
  const [idea, setIdea] = useState(initialIdea);
  const [repoId, setRepoId] = useState(initialRepoId);
  const [activePlan, setActivePlan] = useState<PlanBundle>(() =>
    demoPlanForInput(initialIdea || defaultIdea, initialRepoId)
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
  const [selectedWorkItem, setSelectedWorkItem] = useState<WorkbenchItemId>('intake');
  const [currentRuntimeNow] = useState(() => Date.now());

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
  const latestProjectPlanQuery = useLatestProjectPlan(projectId);
  const latestPlanRunQuery = useLatestPlanRun(activePlan.planId, {
    enabled: Boolean(projectId && activePlan.planId && planSource === 'api' && !run.runId),
    refetchInterval: false,
  });
  const readyCount = run.tasks.filter(task => isPRNodeDelivered(task.status)).length;
  const runningCount = run.tasks.filter(task => isPRNodeActive(task.status)).length;
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
  const executionReadiness = useMemo(
    () =>
      executionReadinessForExecutor({
        runtimes,
        executor: 'codex_cli',
        now: runtimeNow,
        allowFallback: useRuntimeFallback,
      }),
    [runtimeNow, runtimes, useRuntimeFallback]
  );

  const progressText = useMemo(() => {
    if (run.status === 'idle') {
      return `Awaiting plan approval; ${executionReadiness.reason}`;
    }
    return `${readyCount} / ${run.tasks.length} PR nodes ready or merged`;
  }, [executionReadiness.reason, readyCount, run.status, run.tasks.length]);

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
      if (projectId) {
        setPlanSource('empty');
        setHasPlan(false);
        setRun({ status: 'idle', selectedPRNodeIds: [], tasks: [] });
        return;
      }
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
    const resetRepoId = initialRepositoryId?.trim() || demoPlan.repoProfile.repositoryId;
    const resetInput = projectId ? '' : defaultIdea;
    setIdea(resetInput);
    setRepoId(resetRepoId);
    const resetPlan = demoPlanForInput(resetInput || defaultIdea, resetRepoId);
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
    return `Prompt type: ${mode}\n\n${buildPromptPreview(activePlan, node)}`;
  }

  const deliveryStages: WorkbenchStage[] = [
    {
      id: 'intake',
      title: 'Idea intake',
      tone: 'bg-bg-surface',
      emptyLabel: 'Waiting for idea',
      items: [
        {
          id: 'intake' as const,
          key: 'IDEA',
          title: 'Capture product intent',
          description: 'Describe the feature outcome, constraints, and acceptance boundaries.',
          status: idea.trim() ? 'Ready for planning' : 'Needs input',
          icon: Sparkles,
        },
      ],
    },
    {
      id: 'context',
      title: 'Repo intelligence',
      tone: 'bg-bg-subtle/70',
      emptyLabel: 'No repo selected',
      items: [
        {
          id: 'context' as const,
          key: 'CTX',
          title: 'Analyze repos and skills',
          description: `${activePlan.repoProfile.stack.slice(0, 3).join(', ')} · ${repoId}`,
          status:
            planSource === 'api'
              ? 'API context'
              : planSource === 'empty'
                ? 'Awaiting plan'
                : 'Demo fallback',
          icon: GitBranch,
        },
      ],
    },
    {
      id: 'planning',
      title: 'Planning',
      tone: 'bg-warning-subtle',
      emptyLabel: 'Plan not generated',
      items: [
        {
          id: 'plan' as const,
          key: 'PLAN',
          title: 'Approve product and tech plan',
          description: hasPlan
            ? `${activePlan.prNodes.length} PR nodes · one approval checkpoint`
            : 'Generate a project-scoped plan to continue',
          status: hasPlan ? (approved ? 'Approved' : 'Needs review') : 'No plan',
          icon: ScrollText,
        },
        {
          id: 'dag' as const,
          key: 'PROMPT',
          title: 'Compile PR DAG and prompts',
          description: 'Check dependencies, file scope, tests, and prompt contracts.',
          status: hasPlan ? `${activePlan.prNodes.length} nodes` : 'No plan',
          icon: GitMerge,
        },
      ],
    },
    {
      id: 'execution',
      title: 'Execution',
      tone: 'bg-success-subtle',
      emptyLabel: 'No run started',
      items: [
        {
          id: 'run' as const,
          key: 'RUN',
          title: 'Run Codex and deliver PRs',
          description: progressText,
          status: hasPlan ? (run.status === 'idle' ? 'Not started' : run.status) : 'No plan',
          icon: Play,
        },
      ],
    },
    {
      id: 'delivery',
      title: 'PR delivery',
      tone: 'bg-info-subtle',
      emptyLabel: 'PRs appear here after execution',
      items: [],
    },
    {
      id: 'blocked',
      title: 'Decision needed',
      tone: 'bg-error-subtle',
      emptyLabel: 'No escalation',
      items: [],
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-surface">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
        <div className="flex items-center gap-3">
          <ListChecks className="h-4 w-4 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Project command center</h1>
            <p className="text-xs text-text-muted">
              {projectLabel ? `${projectLabel} · ` : ''}Idea to plan, prompts, Codex run, and PR
              delivery
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{runningCount} active runs</Badge>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('context')}>
            Analyze repo
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('plan')}>
            Manual plan
          </Button>
          <Button variant="outline" size="sm" onClick={() => setSelectedWorkItem('dag')}>
            Pipeline
          </Button>
        </div>
      </header>

      {!projectId && <WorkspaceProjectLaunchPanel />}

      <WorkbenchModeTabs
        selectedWorkItem={selectedWorkItem}
        onSelectWorkItem={setSelectedWorkItem}
      />

      <section className="grid min-h-0 flex-1 grid-rows-[minmax(360px,1fr)_minmax(340px,42vh)] overflow-hidden xl:grid-cols-[minmax(0,1fr)_420px] xl:grid-rows-1">
        <WorkbenchDeliveryBoard
          stages={deliveryStages}
          selectedWorkItem={selectedWorkItem}
          onSelectWorkItem={setSelectedWorkItem}
        />

        <aside className="min-h-0 overflow-y-auto border-t border-border-subtle bg-bg-subtle/60 p-4 xl:border-l xl:border-t-0">
          {selectedWorkItem === 'intake' && (
            <DetailPanel title="IDEA" heading="Capture product intent">
              <div className="space-y-4">
                <Textarea
                  value={idea}
                  onChange={event => setIdea(event.target.value)}
                  className="min-h-40 bg-bg-surface"
                  aria-label="Describe the feature CodingCTO should turn into reviewable PRs"
                  placeholder="Describe the product outcome, constraints, and implementation boundaries..."
                />
                <Input
                  value={repoId}
                  onChange={event => setRepoId(event.target.value)}
                  aria-label="Repository ID"
                  placeholder="Repository ID"
                  disabled={repositoryLocked}
                  className="bg-bg-surface"
                />
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
                      ? 'Generating'
                      : 'Generate plan'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button variant="outline" onClick={resetIdea}>
                    Reset
                  </Button>
                </div>
              </div>
            </DetailPanel>
          )}

          {selectedWorkItem === 'context' && (
            <DetailPanel title="CTX" heading="Repo intelligence and skills">
              <RepoContextPanel
                repoId={repoId.trim()}
                repoProfile={activePlan.repoProfile}
                planSource={planSource}
                projectId={projectId}
                onProfileSaved={profile => {
                  setActivePlan(current => ({
                    ...current,
                    repoProfile: profile,
                  }));
                }}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && hasPlan && (
            <DetailPanel title="PLAN" heading="Review and approve plan">
              <PlanReview
                plan={activePlan}
                decisionOverrides={decisionOverrides}
                selectedExecutionNodeIds={selectedExecutionNodeIds}
                approved={approved}
                isStarting={isStartingRun}
                executionReadiness={executionReadiness}
                onDecisionOverrideChange={(key, value) =>
                  setDecisionOverrides(current => ({ ...current, [key]: value }))
                }
                onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
                onApprove={approveAndStart}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'plan' && !hasPlan && (
            <DetailPanel title="PLAN" heading="No project plan yet">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                onCreate={() => setSelectedWorkItem('intake')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && hasPlan && (
            <DetailPanel title="PROMPT" heading="PR DAG and prompt contracts">
              <PRDag
                nodes={activePlan.prNodes}
                repositoryId={activePlan.repoProfile.repositoryId}
                isCompilingPrompt={compilePrompt.isPending}
                onCompilePrompt={compileNodePrompt}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'dag' && !hasPlan && (
            <DetailPanel title="PROMPT" heading="No prompt contract yet">
              <EmptyProjectPlanPanel
                isLoading={latestProjectPlanQuery.isLoading}
                onCreate={() => setSelectedWorkItem('intake')}
              />
            </DetailPanel>
          )}

          {selectedWorkItem === 'run' && (
            <DetailPanel title="RUN" heading="Execution and PR delivery">
              <div className="space-y-4">
                <RunSummary progressText={progressText} approved={approved} run={run} />
                <RuntimeReadiness
                  onlineCount={runtimeSummary.online}
                  recentlyLostCount={runtimeSummary.recently_lost}
                  runtimes={runtimes}
                  isLoading={runtimesQuery.isLoading}
                  isFallback={useRuntimeFallback}
                  readinessReason={executionReadiness.reason}
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
        `Marked ${result.offline_runtimes.length} runtimes offline and failed ${result.failed_tasks.length} tasks.`
      );
    } catch {
      setMaintenanceMessage('Runtime sweep requires the CodingCTO backend.');
    }
  }

  async function sweepStaleExecutionTasks() {
    setMaintenanceMessage('');
    try {
      const result = await sweepTasks.mutateAsync({
        dispatch_timeout_seconds: 900,
        running_timeout_seconds: 3600,
      });
      setMaintenanceMessage(`Failed ${result.failed_tasks.length} stale tasks.`);
    } catch {
      setMaintenanceMessage('Task sweep requires the CodingCTO backend.');
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
            <div className="text-sm font-medium">Executor readiness</div>
            <div className="mt-1 text-sm text-text-muted">
              {isLoading ? 'Checking executor runtime heartbeats.' : readinessReason}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={onlineCount > 0 ? statusClassName('completed') : ''}>
            {onlineCount} online
          </Badge>
          <Badge
            variant="outline"
            className={recentlyLostCount > 0 ? statusClassName('waiting_on_dependencies') : ''}
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
                    <Badge variant="outline">sandbox: {runtime.sandbox.mode}</Badge>
                  ) : null}
                  <Badge variant="outline">{runtime.localSkillCount} skills</Badge>
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
            {sweepRuntimes.isPending ? 'Sweeping' : 'Sweep runtimes'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sweepStaleExecutionTasks}
            disabled={sweepRuntimes.isPending || sweepTasks.isPending}
          >
            {sweepTasks.isPending ? 'Sweeping' : 'Sweep tasks'}
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

function WorkspaceProjectLaunchPanel() {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [message, setMessage] = useState('');

  const {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId: effectiveWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace();
  const projectsQuery = useProjects(effectiveWorkspaceId);
  const projects = projectsQuery.data?.projects ?? [];
  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(effectiveWorkspaceId);

  function updateWorkspaceName(value: string) {
    setWorkspaceName(value);
    setWorkspaceSlug(current => current || slugFromProjectName(value));
  }

  function updateProjectName(value: string) {
    setProjectName(value);
    setProjectSlug(current => current || slugFromProjectName(value));
  }

  async function createNewWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = workspaceName.trim();
    const slug = slugFromProjectName(workspaceSlug || workspaceName);
    if (!name || !slug) {
      setMessage('Workspace name and slug are required.');
      return;
    }
    setMessage('');
    try {
      const response = await createWorkspace.mutateAsync({
        name,
        slug,
        description: workspaceDescription.trim(),
      });
      setSelectedWorkspaceId(response.workspace.workspace_id);
      setWorkspaceName('');
      setWorkspaceSlug('');
      setWorkspaceDescription('');
      setMessage(`Workspace "${response.workspace.name}" created. Create or open a project next.`);
    } catch {
      setMessage('Workspace could not be created. Try another slug or check backend auth.');
    }
  }

  async function createNewProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim();
    const slug = slugFromProjectName(projectSlug || projectName);
    if (!effectiveWorkspaceId) {
      setMessage('Create or select a workspace before creating a project.');
      return;
    }
    if (!name || !slug) {
      setMessage('Project name and slug are required.');
      return;
    }
    setMessage('');
    try {
      const response = await createProject.mutateAsync({
        workspace_id: effectiveWorkspaceId,
        name,
        slug,
        description: projectDescription.trim(),
      });
      setProjectName('');
      setProjectSlug('');
      setProjectDescription('');
      setMessage(
        `Project "${response.project.name}" created. Open it to continue with Git binding.`
      );
    } catch {
      setMessage('Project could not be created. Try another slug or check the selected workspace.');
    }
  }

  return (
    <div className="border-b border-border-subtle bg-bg-canvas px-4 py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" />
              Workspace setup
            </CardTitle>
            <CardDescription>
              Global CodingCTO is for experiments. Enterprise work should start from a workspace and
              project so GitHub bindings, skills, and execution history stay scoped.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Label>Select workspace</Label>
              {workspaces.length > 0 ? (
                <Select value={effectiveWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map(workspace => (
                      <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                        {workspace.name} ({workspace.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
                  No workspace yet. Create one here to unlock project flows.
                </div>
              )}
              {selectedWorkspace && (
                <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
                  <div className="font-medium text-text-main">{selectedWorkspace.name}</div>
                  <div>{selectedWorkspace.description || 'No workspace description yet.'}</div>
                  <div className="mt-1 text-xs">ID: {selectedWorkspace.workspace_id}</div>
                </div>
              )}
              {projects.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    Projects
                  </div>
                  {projects.slice(0, 4).map(project => (
                    <div
                      key={project.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{project.name}</div>
                        <div className="text-xs text-text-muted">{project.slug}</div>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={projectSpecForgeHref(project.id)}>Open</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form className="space-y-3" onSubmit={createNewWorkspace}>
              <div className="text-sm font-medium">Create workspace</div>
              <Input
                value={workspaceName}
                onChange={event => updateWorkspaceName(event.target.value)}
                placeholder="Acme Platform"
                aria-label="Workspace name"
              />
              <Input
                value={workspaceSlug}
                onChange={event => setWorkspaceSlug(slugFromProjectName(event.target.value))}
                placeholder="acme-platform"
                aria-label="Workspace slug"
              />
              <Textarea
                value={workspaceDescription}
                onChange={event => setWorkspaceDescription(event.target.value)}
                placeholder="Who owns this product portfolio?"
                aria-label="Workspace description"
                rows={3}
              />
              <Button type="submit" disabled={createWorkspace.isPending} className="w-full">
                {createWorkspace.isPending ? 'Creating workspace' : 'Create workspace'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Boxes className="h-4 w-4 text-primary" />
              Project setup
            </CardTitle>
            <CardDescription>
              Create the project boundary, then open it for repository binding and enterprise
              CodingCTO runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={createNewProject}>
              <Input
                value={projectName}
                onChange={event => updateProjectName(event.target.value)}
                placeholder="CodingCTO"
                aria-label="Project name"
                disabled={!effectiveWorkspaceId}
              />
              <Input
                value={projectSlug}
                onChange={event => setProjectSlug(slugFromProjectName(event.target.value))}
                placeholder="codingcto"
                aria-label="Project slug"
                disabled={!effectiveWorkspaceId}
              />
              <Textarea
                value={projectDescription}
                onChange={event => setProjectDescription(event.target.value)}
                placeholder="What product or system does this project represent?"
                aria-label="Project description"
                rows={3}
                disabled={!effectiveWorkspaceId}
              />
              <Button
                type="submit"
                disabled={!effectiveWorkspaceId || createProject.isPending}
                className="w-full"
              >
                {createProject.isPending ? 'Creating project' : 'Create project'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </form>
            {message && (
              <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-5 text-text-muted">
                {message}
              </div>
            )}
            {workspacesQuery.isError && (
              <div className="mt-3 rounded-lg border border-error/30 bg-error-subtle p-3 text-sm text-error">
                Workspace API unavailable. Sign in with backend auth and confirm the API is running.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
