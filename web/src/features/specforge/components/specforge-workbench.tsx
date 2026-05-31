'use client';

import Link from 'next/link';
import { startTransition, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Info,
  ListChecks,
  ScrollText,
  Play,
  ShieldAlert,
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/utils';
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
  prNodeFromDTO,
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
import {
  ExecutionStatus,
  RunSummary,
} from '@/features/specforge/components/workbench-execution';
import {
  formatTimestamp,
  maxFixAttemptsPerNode,
  promptModeLabel,
  promptModes,
  repoProfileSourceLabel,
  riskClassName,
  statusClassName,
  type PromptMode,
} from '@/features/specforge/components/workbench-utils';
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
  useGitHubWebhookEvents,
  useLatestPlanRun,
  useLatestProjectPlan,
  useInferRepoProfile,
  usePrepareSpecForgePRNodeBranch,
  useRepoProfile,
  useRepoArchitectureStatus,
  useReindexRepoArchitecture,
  useRefreshSpecForgePRNodeCI,
  useReadSpecForgePRNodeFailureLog,
  useSpecForgeEscalationSummary,
  useSpecForgeFixAttempts,
  useSpecForgeProjectSkills,
  useSpecForgeSkills,
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
import {
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import { executionReadinessForExecutor } from '@/features/specforge/execution-readiness';
import type {
  SpecForgeFixAttemptDTO,
  SpecForgeEscalationSummaryDTO,
  SpecForgeExecutionBundleDTO,
  GitHubWebhookEventDTO,
  SpecForgePRNodeFailureLogDTO,
  SpecForgeRepoArchitectureStatusDTO,
  SpecForgeRepoProfileDTO,
  SpecForgeSkillDTO,
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
          Repo profile
        </div>
        <Badge
          variant="outline"
          className={planSource === 'api' ? statusClassName('completed') : ''}
        >
          {planSource === 'api'
            ? 'API plan'
            : planSource === 'empty'
              ? 'Awaiting plan'
              : 'Demo fallback'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
        <Badge variant="outline">{repoProfileSourceLabel(effectiveProfile.source)}</Badge>
        {effectiveProfile.lastIndexedAt ? (
          <span>Indexed {formatTimestamp(effectiveProfile.lastIndexedAt)}</span>
        ) : (
          <span>Not indexed yet</span>
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
          aria-label="Default branch"
          placeholder="Default branch"
        />
        <Input
          value={ciProvider}
          onChange={event => setCIProvider(event.target.value)}
          aria-label="CI provider"
          placeholder="CI provider"
        />
      </div>
      <Input
        value={stack}
        onChange={event => setStack(event.target.value)}
        aria-label="Repository stack"
        placeholder="Stack: Go, Next.js, TypeScript"
      />
      <Input
        value={testCommands}
        onChange={event => setTestCommands(event.target.value)}
        aria-label="Test commands"
        placeholder="Test commands: go test ./..., pnpm lint"
      />
      <Input
        value={codingConventions}
        onChange={event => setCodingConventions(event.target.value)}
        aria-label="Coding conventions"
        placeholder="Coding conventions"
      />
      <Input
        value={riskAreas}
        onChange={event => setRiskAreas(event.target.value)}
        aria-label="Risk areas"
        placeholder="Risk areas: auth, migrations"
      />
      <Textarea
        value={summary}
        onChange={event => setSummary(event.target.value)}
        className="min-h-24"
        aria-label="Repo profile summary"
        placeholder="Summarize the repository structure and implementation conventions."
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-text-muted">
          {isOffline
            ? 'Start the CodingCTO backend to save profile changes.'
            : 'Profile context feeds planning, PR DAG, and prompt compilation.'}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={inferFromRepositoryHints}
            disabled={!repoId || isOffline || inferProfile.isPending}
          >
            {inferProfile.isPending ? 'Inferring' : 'Infer profile'}
          </Button>
          <Button onClick={saveProfile} disabled={!repoId || isOffline || upsertProfile.isPending}>
            {upsertProfile.isPending ? 'Saving' : 'Save profile'}
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
    ? 'Offline'
    : status?.stale
      ? 'Reindex needed'
      : snapshot
        ? 'Architecture fresh'
        : 'No snapshot';

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          Architecture snapshot
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
            <span>{snapshot.commit_sha || 'unknown ref'}</span>
            <span className="mx-2">·</span>
            <span>{snapshot.modules.length} modules</span>
            <span className="mx-2">·</span>
            <span>{snapshot.ci_workflows.length} CI workflows</span>
          </>
        ) : (
          <span>Generate a snapshot to make repo analysis traceable before planning.</span>
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
          {isReindexing ? 'Reindexing' : 'Reindex'}
        </Button>
      </div>
    </div>
  );
}

function RepoSkillsPanel({ repoId, projectId }: { repoId: string; projectId?: number }) {
  const [name, setName] = useState('Repo coding guidelines');
  const [description, setDescription] = useState('Instructions injected into CodingCTO prompts.');
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
            Repo skills
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Store repository instructions for planning, prompt compilation, and project skill runs.
          </p>
        </div>
        <Badge
          variant="outline"
          className={savedCount > 0 || savedSkill ? statusClassName('completed') : ''}
        >
          {skillsQuery.isLoading || projectSkillsQuery.isLoading
            ? 'Checking'
            : savedCount > 0
              ? `${savedCount} saved`
              : savedSkill
                ? 'Saved'
                : 'No skills'}
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
          aria-label="Skill name"
          placeholder="Skill name"
        />
        <Input
          value={description}
          onChange={event => setDescription(event.target.value)}
          aria-label="Skill description"
          placeholder="Skill description"
        />
        <Textarea
          value={content}
          onChange={event => setContent(event.target.value)}
          className="min-h-24"
          aria-label="Skill content"
          placeholder="Use service layer for data access. Keep API routes thin. Run pnpm type-check before UI PRs."
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="flex items-center gap-2">
            <Switch checked={active} onCheckedChange={setActive} />
            Active
          </Label>
          <Button
            onClick={saveSkill}
            disabled={!repoId || !name.trim() || !content.trim() || isSaving}
          >
            {isSaving ? 'Saving' : projectId ? 'Save project skill' : 'Save skill'}
          </Button>
        </div>
        {(skillsQuery.isError || projectSkillsQuery.isError) && (
          <p className="text-xs leading-5 text-text-muted">
            Skills will save when the CodingCTO backend is available.
          </p>
        )}
        {latestSkill && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
            Latest: {latestSkill.name}
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
          GitHub webhooks
        </div>
        <Badge variant="outline">{events.length} recent</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {eventsQuery.isLoading && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            Loading webhook events.
          </div>
        )}
        {eventsQuery.isError && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            Webhook events will load when the CodingCTO backend is available.
          </div>
        )}
        {!eventsQuery.isLoading && !eventsQuery.isError && events.length === 0 && (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            No webhook events recorded yet.
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
            Open source
          </a>
        )}
      </div>
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
      setDeliveryError('Live GitHub delivery requires a persisted repository and PR node.');
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
        'GitHub delivery controls require the CodingCTO backend and GitHub App setup.'
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
        ci_log_excerpt: 'No live CI log is available in demo mode.',
        attempt_number: 1,
        status: 'queued',
        confidence: 0.7,
        likely_cause: 'CI diagnostics require a GitHub workflow run for this PR node.',
        recommended_action: 'Run CI for the branch, then inspect the failed job logs.',
        can_auto_fix: false,
        created_by: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
  }

  async function readSelectedFailureLog() {
    if (!selectedFixNode || !repositoryId) {
      setFailureLogError('Failure logs require a selected PR node and repository.');
      return;
    }

    const prNodeId = Number(selectedFixNode.id);
    if (!Number.isFinite(prNodeId) || prNodeId <= 0) {
      setFailureLogError('Failure logs require a persisted PR node.');
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
        'Failure logs require a failed GitHub workflow run and GitHub App access.'
      );
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">Prompt mode</div>
          <div className="mt-1 text-text-muted">
            Compile implementation, CI fix, or review feedback prompts for the selected PR node.
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
            <ToggleGroupItem key={mode} value={mode} aria-label={`${promptModeLabel[mode]} prompt`}>
              {promptModeLabel[mode]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">Auto-fix guardrail</div>
          <div className="mt-1 text-text-muted">
            Each PR node can use up to {maxFixAttemptsPerNode} automatic fix attempts before
            CodingCTO escalates with a decision summary.
          </div>
        </div>
        <Badge variant="outline">3 attempts max</Badge>
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
                    {node.estimatedRisk} risk
                  </Badge>
                  {node.githubPrUrl && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={node.githubPrUrl} target="_blank" rel="noreferrer">
                        PR #{node.githubPrNumber ?? 'open'}
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
                    Branch
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
                      ? 'Compiling'
                      : promptModeLabel[promptMode]}
                    <ScrollText className="ml-1.5 h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inspectFailure(node)}
                    disabled={verifyCI.isPending && selectedFixNode?.id === node.id}
                  >
                    {verifyCI.isPending && selectedFixNode?.id === node.id ? 'Checking' : 'Fixes'}
                    <ShieldAlert className="ml-1.5 h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <CompactList
                title="Depends on"
                items={node.dependsOn.length ? node.dependsOn : ['None']}
              />
              <CompactList title="Expected files" items={node.expectedFiles} />
              <CompactList title="Tests" items={node.testCommands} />
            </CardContent>
          </Card>
        </div>
      ))}
      {selectedFixNode && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-base">Fix attempts</CardTitle>
                <CardDescription>{selectedFixNode.title}</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={readSelectedFailureLog}
                disabled={readFailureLog.isPending}
              >
                {readFailureLog.isPending ? 'Reading' : 'Read failure log'}
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
                <div className="font-medium text-text-main">Auto-fix retry budget</div>
                <div className="mt-1 text-text-muted">
                  {highestFixAttempt} / {maxFixAttemptsPerNode} attempts used
                  {fixBudgetExhausted
                    ? '; escalate with a decision summary before retrying.'
                    : `; ${remainingFixAttempts} automatic ${remainingFixAttempts === 1 ? 'retry' : 'retries'} remaining.`}
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  fixBudgetExhausted ? statusClassName('blocked') : statusClassName('running')
                }
              >
                {fixBudgetExhausted ? 'Escalation needed' : 'Auto-fix available'}
              </Badge>
            </div>
            {failureLog && <FailureLogSummary failureLog={failureLog} />}
            {fixAttempts.length === 0 && (
              <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
                {fixAttemptsQuery.isLoading ? 'Checking CI diagnostics.' : 'No fix attempts yet.'}
              </div>
            )}
            {fixAttempts.map(attempt => (
              <div
                key={`${attempt.id}-${attempt.attempt_number}`}
                className="rounded-lg border border-border-subtle bg-bg-subtle p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    Attempt {attempt.attempt_number}: {attempt.failure_type}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {attempt.workflow_run_url ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={attempt.workflow_run_url} target="_blank" rel="noreferrer">
                          Run {attempt.workflow_run_id || 'CI'}
                          <ExternalLink className="ml-1.5 h-4 w-4" />
                        </a>
                      </Button>
                    ) : attempt.workflow_run_id ? (
                      <Badge variant="outline">run {attempt.workflow_run_id}</Badge>
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
                Live fix attempts will load when the CodingCTO backend is available.
              </p>
            )}
            {escalationSummaryQuery.isError && (
              <p className="text-xs leading-5 text-text-muted">
                Escalation summaries require the CodingCTO backend.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {promptText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Compiled prompt</CardTitle>
            <CardDescription>Implementation prompt for the selected PR node.</CardDescription>
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
        <div className="font-medium text-text-main">Escalation summary</div>
        <Badge
          variant="outline"
          className={needsDecision ? statusClassName('blocked') : statusClassName('running')}
        >
          {needsDecision ? 'Needs decision' : 'Auto-fix can continue'}
        </Badge>
      </div>
      <p className="mt-2 leading-6">{summary.reason}</p>
      <p className="mt-2 leading-6 text-text-main">{summary.recommended_option}</p>
      {summary.latest_likely_cause && (
        <p className="mt-2 leading-6">Latest cause: {summary.latest_likely_cause}</p>
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

function FailureLogSummary({ failureLog }: { failureLog: SpecForgePRNodeFailureLogDTO }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{failureLog.job_name}</div>
        <Badge variant="outline">run {failureLog.workflow_run_id}</Badge>
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
        {failureLog.log_excerpt || 'No log excerpt returned.'}
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
