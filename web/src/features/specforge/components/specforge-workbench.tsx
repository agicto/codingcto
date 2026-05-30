'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  CircleX,
  ExternalLink,
  GitBranch,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  useSpecForgeSkills,
  useSpecForgeTaskEvents,
  useSpecForgeRuntimes,
  useSweepSpecForgeRuntimes,
  useSweepSpecForgeTasks,
  useStartExecutionRun,
  useUpsertRepoProfile,
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
import { executionRangeReview, selectExecutionNode } from '@/features/specforge/execution-range';
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
  SpecForgeTaskEventDTO,
} from '@/features/specforge/services/specforge-service';
import {
  sortWebhookEvents,
  webhookEventLabel,
  webhookEventRepo,
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

const statusLabel: Record<PRNode['status'], string> = {
  planned: 'Planned',
  queued: 'Queued',
  running: 'Running',
  waiting_on_dependencies: 'Waiting',
  pr_opened: 'PR opened',
  ci_running: 'CI running',
  ready_for_review: 'Ready',
  blocked: 'Blocked',
  merged: 'Merged',
  closed: 'Closed',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
const maxFixAttemptsPerNode = 3;
type PromptMode = NonNullable<CompilePromptPayload['type']>;
const promptModes: PromptMode[] = ['implementation', 'fix', 'review_patch'];
const promptModeLabel: Record<PromptMode, string> = {
  implementation: 'Implement',
  fix: 'Fix',
  review_patch: 'Review',
};

function statusClassName(status: PRNode['status']) {
  if (isPRNodeDelivered(status)) {
    return 'border-success/30 bg-success-subtle text-success';
  }
  if (isPRNodeActive(status)) {
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

function repoProfileSourceLabel(source: string) {
  switch (source) {
    case 'github_tree':
      return 'GitHub tree';
    case 'request_hints':
      return 'Request hints';
    case 'manual':
      return 'Manual profile';
    case 'demo':
      return 'Demo profile';
    default:
      return 'Unknown source';
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
  const initialRepoId = initialRepositoryId?.trim() || demoPlan.repoProfile.repositoryId;
  const [idea, setIdea] = useState(defaultIdea);
  const [repoId, setRepoId] = useState(initialRepoId);
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
        ? 'Awaiting plan approval; a healthy executor is ready'
        : 'Awaiting plan approval; no healthy executor is online';
    }
    return `${readyCount} / ${run.tasks.length} PR nodes ready or merged`;
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
    const resetRepoId = initialRepositoryId?.trim() || demoPlan.repoProfile.repositoryId;
    setIdea(defaultIdea);
    setRepoId(resetRepoId);
    const resetPlan = demoPlanForInput(defaultIdea, resetRepoId);
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

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">CodingCTO</h1>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            {projectLabel
              ? `${projectLabel}: describe a feature, review the plan, then start a PR-oriented execution run.`
              : 'Describe a feature, review the product and technical plan, then start a PR-oriented execution run.'}
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
              onChange={event => setIdea(event.target.value)}
              className="min-h-36"
              aria-label="Describe the feature CodingCTO should turn into reviewable PRs"
              placeholder="Describe the product outcome, constraints, and any implementation boundaries..."
            />
            <Input
              value={repoId}
              onChange={event => setRepoId(event.target.value)}
              aria-label="Repository ID"
              placeholder="Repository ID"
              disabled={repositoryLocked}
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
                  ? 'Generating plan'
                  : 'Generate implementation plan'}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={resetIdea}>
                Reset
              </Button>
            </div>
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
            <RepoSkillsPanel repoId={repoId.trim()} />
            <GitHubWebhookEventsPanel />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <RunSummary progressText={progressText} approved={approved} run={run} />
          <RuntimeReadiness
            onlineCount={runtimeSummary.online}
            recentlyLostCount={runtimeSummary.recently_lost}
            runtimes={runtimes}
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
              </TabsContent>
              <TabsContent value="dag">
                <PRDag
                  nodes={activePlan.prNodes}
                  repositoryId={activePlan.repoProfile.repositoryId}
                  isCompilingPrompt={compilePrompt.isPending}
                  onCompilePrompt={compileNodePrompt}
                />
              </TabsContent>
              <TabsContent value="run">
                <ExecutionStatus
                  run={run}
                  isCancelling={cancelRun.isPending}
                  onAdvance={advanceRun}
                  onCancel={cancelActiveRun}
                  onExecutionBundle={applyExecutionBundle}
                />
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
              {isLoading
                ? 'Checking executor runtime heartbeats.'
                : onlineCount > 0
                  ? 'Approved plans can be dispatched to a healthy runtime.'
                  : 'Execution will wait until a runtime heartbeat is online.'}
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
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{runtime.runtimeId}</div>
                <div className="text-xs text-text-muted">
                  {runtime.executor}
                  {runtime.hostname ? ` · ${runtime.hostname}` : ''}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-24 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2">
      <div className="text-lg font-semibold leading-none">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
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
          Repo profile
        </div>
        <Badge
          variant="outline"
          className={planSource === 'api' ? statusClassName('completed') : ''}
        >
          {planSource === 'api' ? 'API plan' : 'Demo fallback'}
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

function RepoSkillsPanel({ repoId }: { repoId: string }) {
  const [name, setName] = useState('Repo coding guidelines');
  const [description, setDescription] = useState('Instructions injected into CodingCTO prompts.');
  const [content, setContent] = useState('');
  const [active, setActive] = useState(true);
  const [savedSkill, setSavedSkill] = useState<SpecForgeSkillDTO>();

  const skillsQuery = useSpecForgeSkills(repoId);
  const upsertSkill = useUpsertSpecForgeSkill(repoId);
  const skills = skillsQuery.data?.skills ?? [];
  const latestSkill = savedSkill ?? skills[0];

  async function saveSkill() {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!repoId || !trimmedName || !trimmedContent) {
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
            Store repository instructions for planning and prompt compilation.
          </p>
        </div>
        <Badge
          variant="outline"
          className={skills.length > 0 || savedSkill ? statusClassName('completed') : ''}
        >
          {skillsQuery.isLoading
            ? 'Checking'
            : skills.length > 0
              ? `${skills.length} saved`
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
            disabled={!repoId || !name.trim() || !content.trim() || upsertSkill.isPending}
          >
            {upsertSkill.isPending ? 'Saving' : 'Save skill'}
          </Button>
        </div>
        {skillsQuery.isError && (
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
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">{webhookEventLabel(event)}</div>
        <Badge variant="outline">{event.status}</Badge>
      </div>
      <div className="mt-1 text-xs text-text-muted">{webhookEventRepo(event)}</div>
      <div className="mt-1 text-xs text-text-muted">{event.delivery_id}</div>
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
        <Badge variant="outline" className={approved ? statusClassName('completed') : ''}>
          {approved ? 'Plan approved' : 'Plan approval required'}
        </Badge>
        <Badge
          variant="outline"
          className={
            run.status === 'running' || run.status === 'blocked' ? statusClassName(run.status) : ''
          }
        >
          {run.status === 'idle' ? 'No run started' : run.status}
        </Badge>
        {run.status !== 'idle' && (
          <Badge variant="outline">{run.selectedPRNodeIds.length} PR nodes selected</Badge>
        )}
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
  const canStartSelectedRange =
    executionRangeNotes.length > 0 &&
    executionRangeNotes.every(note => note.includes('dependencies included'));
  const decisionFields = decisionFieldsForPlan(plan);
  const planAssumptions = productSpec.assumptions.filter(
    item => !item.startsWith('PR DAG review:')
  );

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
          <DecisionOverrideFields
            fields={decisionFields}
            values={decisionOverrides}
            disabled={approved || isStarting}
            onChange={onDecisionOverrideChange}
          />
          <ListBlock title="Acceptance criteria" items={productSpec.acceptanceCriteria} />
          <ListBlock title="Plan assumptions" items={planAssumptions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technical plan</CardTitle>
          <CardDescription>{implementationPlan.technicalSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="Affected areas" items={implementationPlan.affectedAreas} />
          <ListBlock title="PR DAG review" items={plan.prDagReview} />
          <ExecutionRangeSelector
            nodes={plan.prNodes}
            selectedNodeIds={selectedExecutionNodeIds}
            disabled={approved || isStarting}
            onChange={onExecutionNodeSelectionChange}
          />
          <ListBlock title="Execution range review" items={executionRangeNotes} />
          <ListBlock title="Security risks" items={implementationPlan.securityRisks} icon="risk" />
          <ListBlock title="Migration risks" items={implementationPlan.migrationRisks} />
          {!approvalReadiness.canApprove && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              {approvalReadiness.reason}
            </p>
          )}
          {!canStartSelectedRange && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              Select at least one PR node before starting execution.
            </p>
          )}
          <Button
            onClick={onApprove}
            disabled={
              approved || isStarting || !approvalReadiness.canApprove || !canStartSelectedRange
            }
            className="w-full justify-center"
          >
            {approved ? 'Approved' : isStarting ? 'Starting run' : 'Approve & Start'}
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
      <h3 className="text-sm font-medium">Execution range</h3>
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
                Depends on {node.dependsOn.length > 0 ? node.dependsOn.join(', ') : 'none'}
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
      <h3 className="text-sm font-medium">Key decisions</h3>
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
            <span>None recorded.</span>
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
      setTaskActionError('Retry requires a persisted backend task.');
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
        'Retry requires a failed or cancelled task. Dependency-closed tasks need a revised plan.'
      );
    } finally {
      setTaskActionId(undefined);
    }
  }

  async function completeExecutionTask(task: PRNode) {
    if (!task.taskId) {
      setTaskActionError('Complete requires a persisted backend task.');
      return;
    }

    setTaskActionError('');
    setTaskActionId(task.taskId);
    try {
      const bundle = await completeTask.mutateAsync(task.taskId);
      onExecutionBundle(bundle);
    } catch {
      setTaskActionError(
        'Complete requires a dispatched or running task and the CodingCTO backend.'
      );
    } finally {
      setTaskActionId(undefined);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <CardTitle className="text-base">Execution run</CardTitle>
          <CardDescription>
            Delivery state is organized by PR node, not by individual agent workers.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onCancel} disabled={!canCancel || isCancelling} variant="outline">
            {isCancelling ? 'Cancelling' : 'Cancel run'}
            <CircleX className="ml-1.5 h-4 w-4" />
          </Button>
          <Button onClick={onAdvance} disabled={!canAdvance} variant="outline">
            Advance demo run
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {run.status === 'blocked' && (
          <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm leading-6 text-warning">
            This run is waiting for a decision. Retry a failed or cancelled task with a fresh
            session, or cancel the run if the PR DAG needs to be replanned.
            {blockedRecoverableTasks.length > 0 && (
              <span className="ml-1 font-medium text-text-main">
                {blockedRecoverableTasks.length} task
                {blockedRecoverableTasks.length === 1 ? '' : 's'} can be retried.
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
                    <Badge variant="outline">attempt {task.attemptNumber}</Badge>
                  )}
                  {task.taskId && <Badge variant="outline">task #{task.taskId}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={statusClassName(task.status)}>
                  {statusLabel[task.status]}
                </Badge>
                <Button variant="outline" size="sm" onClick={() => setSelectedTask(task)}>
                  Events
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
                  {retryTask.isPending && taskActionId === task.taskId ? 'Retrying' : 'Retry'}
                  <RotateCcw className="ml-1.5 h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => completeExecutionTask(task)}
                  disabled={isTaskActionPending || task.status !== 'running'}
                >
                  {completeTask.isPending && taskActionId === task.taskId
                    ? 'Completing'
                    : 'Complete'}
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
                setTaskActionError('Review patches require a persisted backend task.');
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
                  'Review patches require a completed, failed, or cancelled task and the CodingCTO backend.'
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

function TaskDiagnostics({ task }: { task: PRNode }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
      {task.fixAttemptId && <div>Fix attempt: #{task.fixAttemptId}</div>}
      {task.failureReason && <div>Failure: {task.failureReason}</div>}
      {task.outputLog && <div className="mt-1 truncate">Output: {task.outputLog}</div>}
      {task.errorLog && <div className="mt-1 truncate">Error: {task.errorLog}</div>}
      {task.logsUrl && (
        <a
          href={task.logsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-primary hover:underline"
        >
          Open logs
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
            Task events
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {task.title} {task.taskId ? `#${task.taskId}` : ''}
          </div>
        </div>
        <Badge variant="outline">{events.length} events</Badge>
      </div>
      <div className="mt-3 max-h-72 space-y-2 overflow-auto rounded-lg border border-border-subtle bg-bg-subtle p-3">
        {isLoading && <div className="text-sm text-text-muted">Loading task events.</div>}
        {isError && (
          <div className="text-sm text-text-muted">
            Live task events will load when the CodingCTO backend is available.
          </div>
        )}
        {!task.taskId && (
          <div className="text-sm text-text-muted">
            Live task events require a dispatched backend task.
          </div>
        )}
        {task.taskId && !isLoading && !isError && events.length === 0 && (
          <div className="text-sm text-text-muted">No task events recorded yet.</div>
        )}
        {events.map(event => (
          <TaskEventRow key={event.id} event={event} />
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3">
        <div className="text-sm font-medium text-text-main">Review feedback patch</div>
        <div className="mt-1 text-xs leading-5 text-text-muted">
          Queue a scoped patch task from human PR review feedback after this task reaches a terminal
          state.
        </div>
        <Textarea
          value={reviewFeedback}
          onChange={event => setReviewFeedback(event.target.value)}
          className="mt-3 min-h-24 bg-bg-surface"
          aria-label="Human review feedback"
          placeholder="Paste actionable PR review feedback for this task..."
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">
            {task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'
              ? 'Patchable'
              : 'Wait for terminal task'}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={submitReviewPatch}
            disabled={!canSubmitReviewPatch || isSubmittingReviewPatch}
          >
            {isSubmittingReviewPatch ? 'Queuing' : 'Queue review patch'}
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
        {eventText || 'No event content.'}
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
