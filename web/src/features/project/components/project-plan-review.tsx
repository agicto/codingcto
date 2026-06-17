'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FileText,
  GitPullRequest,
  ScrollText,
  ShieldAlert,
  Terminal,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ProjectPlanningFlowCard } from '@/features/project/components/project-planning-flow-card';
import { projectPlanningStages } from '@/features/project/project-planning-flow';
import {
  projectContextHref,
  projectPRReviewHref,
  projectSpecForgeHref,
} from '@/features/project/project-utils';
import { executionRunFromDTO, planBundleFromDTO } from '@/features/specforge/plan-adapter';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';
import {
  defaultDecisionOverrides,
  normalizeDecisionOverrides,
} from '@/features/specforge/plan-decisions';
import { executionReadinessForExecutor } from '@/features/specforge/execution-readiness';
import { PlanReview } from '@/features/specforge/components/workbench-plan';
import { runtimeFromDTO } from '@/features/specforge/runtime-health';
import {
  buildRuntimeSetupCommand,
  runtimeSetupChecklist,
} from '@/features/specforge/runtime-setup';
import { verificationReviewForNodes } from '@/features/specforge/verification-review';
import {
  useApproveSpecForgePlan,
  useCompileSpecForgePrompt,
  useDispatchExecutionRun,
  useSpecForgePlanSkillRuns,
  useSpecForgePlan,
  useSpecForgeRuntimes,
  useStartExecutionRun,
} from '@/features/specforge/hooks/use-specforge';
import type {
  SpecForgeCompiledPromptDTO,
  SpecForgePlanBundleDTO,
  SpecForgeSkillRunDTO,
} from '@/features/specforge/services/specforge-service';
import {
  skillEvidenceRefs,
  skillNamesFromRuns,
  skillRunStageLabel,
} from '@/features/specforge/skill-pipeline';
import {
  promptModeLabel,
  promptModes,
  riskClassName,
  type PromptMode,
} from '@/features/specforge/components/workbench-utils';
import type { PlanBundle, PRNode } from '@/features/specforge/types';

const supportedExecutors = ['codex_cli', 'kimi_cli', 'claude_code_cli'] as const;
type SupportedExecutor = (typeof supportedExecutors)[number];

const executorLabels: Record<SupportedExecutor, string> = {
  codex_cli: 'Codex CLI',
  kimi_cli: 'Kimi CLI',
  claude_code_cli: 'Claude Code CLI',
};

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
  const [selectedPromptNodeId, setSelectedPromptNodeId] = useState(
    () => initialPlan.prNodes[0]?.id ?? ''
  );
  const [promptMode, setPromptMode] = useState<PromptMode>('implementation');
  const [selectedExecutor, setSelectedExecutor] = useState<SupportedExecutor>('codex_cli');
  const [compiledPrompt, setCompiledPrompt] = useState<SpecForgeCompiledPromptDTO>();
  const [promptMessage, setPromptMessage] = useState('');
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
        executor: selectedExecutor,
        now: runtimeNow,
        allowFallback: false,
        repositoryId: plan.repoProfile.repositoryId,
      }),
    [plan.repoProfile.repositoryId, runtimeNow, runtimes, selectedExecutor]
  );
  const executorOptions = useMemo(
    () =>
      supportedExecutors.map(executor => {
        const readiness = executionReadinessForExecutor({
          runtimes,
          executor,
          now: runtimeNow,
          allowFallback: false,
          repositoryId: plan.repoProfile.repositoryId,
        });
        const suffix =
          readiness.healthyRuntimeCount > 0
            ? ` (${readiness.healthyRuntimeCount} online)`
            : ' (not ready)';
        return {
          value: executor,
          label: `${executorLabels[executor]}${suffix}`,
        };
      }),
    [plan.repoProfile.repositoryId, runtimeNow, runtimes]
  );
  const approvePlan = useApproveSpecForgePlan();
  const compilePrompt = useCompileSpecForgePrompt();
  const skillRunsQuery = useSpecForgePlanSkillRuns(plan.planId);
  const skillRuns = skillRunsQuery.data?.skill_runs ?? [];
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const isStarting = approvePlan.isPending || startRun.isPending || dispatchRun.isPending;
  const approved = plan.implementationPlan.status === 'approved';
  const boardHref = `${projectSpecForgeHref(projectId)}#project-delivery`;
  const selectedPromptNode =
    plan.prNodes.find(node => node.id === selectedPromptNodeId) ?? plan.prNodes[0];
  const planningStages = projectPlanningStages({
    hasPrimaryRepository: Boolean(plan.repoProfile.repositoryId),
    hasRequirementInput: Boolean(plan.idea.trim()),
    hasPlan: Boolean(plan.planId),
    prNodeCount: plan.prNodes.length,
    hasCompiledPrompt: Boolean(compiledPrompt),
  });

  function selectPromptNode(nodeId: string) {
    setSelectedPromptNodeId(nodeId);
    setCompiledPrompt(undefined);
    setPromptMessage('');
  }

  async function compileSelectedPrompt() {
    if (!selectedPromptNode) {
      return;
    }
    const prNodeId = Number(selectedPromptNode.id);
    if (!Number.isFinite(prNodeId) || prNodeId <= 0) {
      setPromptMessage('Prompt compilation requires a persisted PR node.');
      return;
    }

    setPromptMessage('');
    try {
      const response = await compilePrompt.mutateAsync({
        prNodeId,
        payload: { type: promptMode },
      });
      setCompiledPrompt(response.prompt);
      setPromptMessage(
        `Compiled ${promptModeLabel[promptMode].toLowerCase()} prompt ${response.prompt.version}.`
      );
    } catch {
      setCompiledPrompt(undefined);
      setPromptMessage('Live prompt compilation failed. The grounded preview is still available.');
    }
  }

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
          executor: selectedExecutor,
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

        <ProjectPlanningFlowCard
          stages={planningStages}
          title="Requirement-to-prompt flow"
          description="Project ready -> create requirement -> generate plan -> review PR DAG -> preview prompts."
        />
        <PlanMetaCard plan={plan} runtimeCount={executionReadiness.healthyRuntimeCount} />
        <PRDagReviewCard nodes={plan.prNodes} />
        <PromptPreviewWorkbench
          plan={plan}
          node={selectedPromptNode}
          promptMode={promptMode}
          selectedExecutor={selectedExecutor}
          runtimeReady={executionReadiness.canDispatch}
          compiledPrompt={compiledPrompt}
          message={promptMessage}
          skillRuns={skillRuns}
          isSkillRunsLoading={skillRunsQuery.isLoading}
          isCompiling={compilePrompt.isPending}
          onPromptModeChange={mode => {
            setPromptMode(mode);
            setCompiledPrompt(undefined);
            setPromptMessage('');
          }}
          onNodeChange={selectPromptNode}
          onCompilePrompt={compileSelectedPrompt}
        />

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
          selectedExecutor={selectedExecutor}
          executorOptions={executorOptions}
          approved={approved}
          isStarting={isStarting}
          executionReadiness={executionReadiness}
          onDecisionOverrideChange={(key, value) =>
            setDecisionOverrides(current => ({ ...current, [key]: value }))
          }
          onExecutionNodeSelectionChange={setSelectedExecutionNodeIds}
          onExecutorChange={setSelectedExecutor}
          onApprove={approveAndStart}
          showPromptPreview={false}
          showSkillPipeline={false}
        />

        <RuntimeSetupCard
          plan={plan}
          readyRuntimeCount={executionReadiness.healthyRuntimeCount}
          readinessReason={executionReadiness.reason}
        />
        <VerificationReviewCard plan={plan} projectId={projectId} />
      </div>
    </main>
  );
}

function PRDagReviewCard({ nodes }: { nodes: PRNode[] }) {
  const dependencyCount = nodes.reduce((count, node) => count + node.dependsOn.length, 0);

  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <GitPullRequest className="h-4 w-4 text-primary" />
              PR DAG review
            </CardTitle>
            <CardDescription className="mt-1 leading-6">
              Review the implementation slices before approving execution. Each node should be
              scoped, testable, and clear enough for a human PR review.
            </CardDescription>
          </div>
          <Badge variant="outline">
            {nodes.length} nodes · {dependencyCount} dependencies
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {nodes.map(node => (
          <div key={node.id} className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {node.nodeKey}
                  </Badge>
                  <Badge variant="outline" className={riskClassName(node.estimatedRisk)}>
                    {node.estimatedRisk}
                  </Badge>
                </div>
                <h2 className="mt-2 text-sm font-semibold leading-5 text-text-main">
                  {node.title}
                </h2>
              </div>
              <Badge variant="outline">{node.type}</Badge>
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-text-muted">{node.goal}</p>
            <div className="mt-3 grid gap-2 text-xs text-text-muted md:grid-cols-3">
              <DagMeta label="Depends" value={node.dependsOn.join(', ') || 'None'} />
              <DagMeta label="Files" value={String(node.expectedFiles.length)} />
              <DagMeta label="Tests" value={String(node.testCommands.length)} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PromptPreviewWorkbench({
  plan,
  node,
  promptMode,
  selectedExecutor,
  runtimeReady,
  compiledPrompt,
  message,
  skillRuns,
  isSkillRunsLoading,
  isCompiling,
  onPromptModeChange,
  onNodeChange,
  onCompilePrompt,
}: {
  plan: PlanBundle;
  node?: PRNode;
  promptMode: PromptMode;
  selectedExecutor: string;
  runtimeReady: boolean;
  compiledPrompt?: SpecForgeCompiledPromptDTO;
  message: string;
  skillRuns: SpecForgeSkillRunDTO[];
  isSkillRunsLoading: boolean;
  isCompiling: boolean;
  onPromptModeChange: (mode: PromptMode) => void;
  onNodeChange: (nodeId: string) => void;
  onCompilePrompt: () => void;
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const previewText = node
    ? (compiledPrompt?.prompt_text ??
      buildPromptPreview(plan, node, {
        skillRuns,
        executor: selectedExecutor,
        runtimeReady,
      }))
    : '';
  const promptSource = compiledPrompt ? 'Compiled by API' : 'Grounded local preview';
  const skillNames = skillNamesFromRuns(skillRuns);
  const promptSkillRefs = skillEvidenceRefs(compiledPrompt?.evidence_refs);

  async function copyPrompt() {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(previewText);
      setCopyMessage('Copied prompt.');
    } catch {
      setCopyMessage('Copy unavailable. Select the prompt manually.');
    }
  }

  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              Prompt preview
            </CardTitle>
            <CardDescription className="mt-1 leading-6">
              Inspect the prompt contract before execution. CodingCTO compiles prompts from the
              project context, product plan, technical plan, PR DAG, and acceptance criteria.
            </CardDescription>
          </div>
          <Badge variant="outline">{promptSource}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium text-text-main">PR node</div>
            <Select value={node?.id ?? ''} onValueChange={onNodeChange}>
              <SelectTrigger className="min-w-0 w-full overflow-hidden bg-background [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:max-w-full [&_[data-slot=select-value]]:truncate">
                <SelectValue placeholder="Select PR node" />
              </SelectTrigger>
              <SelectContent className="max-w-[min(560px,calc(100vw-2rem))]">
                {plan.prNodes.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    <span className="block max-w-[480px] truncate">
                      {item.nodeKey}: {item.title}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {node ? (
              <p className="text-xs leading-5 text-text-muted">
                {node.expectedFiles.length} expected file scopes · {node.testCommands.length} test
                commands
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-text-main">Prompt mode</div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={promptMode}
              onValueChange={value => {
                if (promptModes.includes(value as PromptMode)) {
                  onPromptModeChange(value as PromptMode);
                }
              }}
              className="grid w-full grid-cols-3"
            >
              {promptModes.map(mode => (
                <ToggleGroupItem
                  key={mode}
                  value={mode}
                  aria-label={`${promptModeLabel[mode]} prompt`}
                  className="min-w-0"
                >
                  {promptModeLabel[mode]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row xl:flex-col">
            <Button
              type="button"
              onClick={onCompilePrompt}
              disabled={!node || isCompiling}
              loading={isCompiling}
            >
              {isCompiling ? 'Compiling prompt' : 'Compile prompt'}
              <ScrollText className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" onClick={copyPrompt} disabled={!previewText}>
              Copy prompt
              <Copy className="h-4 w-4" />
            </Button>
          </div>

          {compiledPrompt ? (
            <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
              <div className="font-medium text-text-main">Compiled prompt metadata</div>
              <div className="mt-2 grid gap-1">
                <span>Version: {compiledPrompt.version}</span>
                <span>Type: {compiledPrompt.type}</span>
                <span>Hash: {compiledPrompt.prompt_hash}</span>
              </div>
            </div>
          ) : null}

          <SkillEvidencePanel
            skillRuns={skillRuns}
            skillNames={skillNames}
            promptSkillRefs={promptSkillRefs}
            isLoading={isSkillRunsLoading}
            hasCompiledPrompt={Boolean(compiledPrompt)}
          />

          {(message || copyMessage) && (
            <div className="rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-5 text-text-muted">
              {message || copyMessage}
            </div>
          )}
        </div>

        <pre className="max-h-[540px] overflow-auto rounded-[4px] border border-border-subtle bg-bg-surface p-4 text-xs leading-5 text-text-main">
          {previewText || 'Select a PR node to preview its prompt contract.'}
        </pre>
      </CardContent>
    </Card>
  );
}

function SkillEvidencePanel({
  skillRuns,
  skillNames,
  promptSkillRefs,
  isLoading,
  hasCompiledPrompt,
}: {
  skillRuns: SpecForgeSkillRunDTO[];
  skillNames: string[];
  promptSkillRefs: string[];
  isLoading: boolean;
  hasCompiledPrompt: boolean;
}) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-text-main">Skill evidence</div>
        <Badge variant="outline">
          {isLoading
            ? 'Checking'
            : skillNames.length > 0
              ? `${skillNames.length} skills`
              : 'No skills'}
        </Badge>
      </div>
      <p className="mt-2 text-xs leading-5 text-text-muted">
        CodingCTO injects active project or repository skills into the compiled prompt and tracks
        the planning stages that used them.
      </p>

      {skillNames.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {skillNames.map(skillName => (
            <Badge key={skillName} variant="outline">
              {skillName}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
          No active skills were recorded for this plan. Add repo or project skills before generating
          the next requirement to reduce prompt ambiguity.
        </p>
      )}

      {hasCompiledPrompt ? (
        <div className="mt-3 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2">
          <div className="text-xs font-medium text-text-main">Compiled prompt skill refs</div>
          {promptSkillRefs.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {promptSkillRefs.map(ref => (
                <Badge key={ref} variant="outline" className="font-mono text-[10px]">
                  {ref}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs leading-5 text-text-muted">
              The prompt was compiled without skill evidence refs.
            </p>
          )}
        </div>
      ) : null}

      {skillRuns.length > 0 ? (
        <div className="mt-3 space-y-2">
          {skillRuns.slice(0, 4).map(run => (
            <div
              key={`${run.stage}-${run.id}`}
              className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase text-text-subtle">
                  {skillRunStageLabel(run.stage)}
                </span>
                <Badge variant="outline">{run.status}</Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                {run.output_summary || 'No output recorded yet.'}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DagMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-text-subtle">{label}</div>
      <div className="mt-0.5 truncate text-text-main">{value}</div>
    </div>
  );
}

function VerificationReviewCard({ plan, projectId }: { plan: PlanBundle; projectId: number }) {
  const review = verificationReviewForNodes(plan.prNodes);
  const highlightedNodes =
    review.failedNodes.length > 0
      ? review.failedNodes
      : review.ciNodes.length > 0
        ? review.ciNodes
        : review.reviewableNodes;

  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Verification review
            </CardTitle>
            <CardDescription className="mt-1 leading-6">{review.headline}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              review.state === 'blocked'
                ? 'border-warning/30 text-warning'
                : review.state === 'complete'
                  ? 'border-success/30 text-success'
                  : ''
            }
          >
            {review.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">Next verification action</div>
          <p className="mt-2 text-sm leading-6 text-text-muted">{review.nextAction}</p>
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-text-muted">
            {review.autoFixBudget}
          </div>
        </div>
        <div className="min-w-0 rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">Active PR node signals</div>
          <div className="mt-3 space-y-2">
            {highlightedNodes.slice(0, 3).map(node => (
              <div
                key={node.id}
                className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-text-main">
                    {node.nodeKey}: {node.title}
                  </span>
                  <Badge variant="outline">{node.status}</Badge>
                </div>
                {node.failureReason ? (
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    Failure: {node.failureReason}
                  </p>
                ) : null}
                <div className="mt-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={projectPRReviewHref(projectId, Number(node.id))}>Open review</Link>
                  </Button>
                </div>
              </div>
            ))}
            {highlightedNodes.length === 0 ? (
              <p className="text-sm leading-6 text-text-muted">
                No active CI failures or reviewable PR nodes yet. Verification starts after runtime
                delivery opens PRs.
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RuntimeSetupCard({
  plan,
  readyRuntimeCount,
  readinessReason,
}: {
  plan: PlanBundle;
  readyRuntimeCount: number;
  readinessReason: string;
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const command = buildRuntimeSetupCommand({
    repoDir: '/path/to/local/repo',
    once: true,
  });
  const checklist = runtimeSetupChecklist({
    repositoryId: plan.repoProfile.repositoryId,
    readyRuntimeCount,
  });

  async function copyCommand() {
    setCopyMessage('');
    try {
      await navigator.clipboard.writeText(command);
      setCopyMessage('Copied local agent command.');
    } catch {
      setCopyMessage('Copy unavailable. Select the command manually.');
    }
  }

  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4 text-primary" />
              Runtime setup
            </CardTitle>
            <CardDescription className="mt-1 leading-6">
              {readinessReason} Run the local ccto agent in the target repository before approving
              execution.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              readyRuntimeCount > 0
                ? 'border-success/30 text-success'
                : 'border-warning/30 text-warning'
            }
          >
            {readyRuntimeCount > 0 ? `${readyRuntimeCount} ready` : 'Runtime required'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">Before Approve & Start</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-text-muted">
            {checklist.map(item => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-text-main">Local agent command</div>
            <Button type="button" variant="outline" size="sm" onClick={copyCommand}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border-subtle bg-bg-surface p-3 text-xs leading-5 text-text-muted">
            {command}
          </pre>
          {copyMessage ? (
            <div className="mt-2 text-xs leading-5 text-text-muted">{copyMessage}</div>
          ) : null}
        </div>
      </CardContent>
    </Card>
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
      <CardContent className="grid gap-3 text-sm md:grid-cols-6">
        <MetaItem label="Plan ID" value={plan.planId ? String(plan.planId) : 'Draft'} />
        <MetaItem label="Repository" value={plan.repoProfile.repositoryId} />
        <MetaItem
          label="Context snapshot"
          value={
            plan.implementationPlan.contextSnapshotId
              ? `#${plan.implementationPlan.contextSnapshotId}`
              : 'Unpinned'
          }
        />
        <MetaItem
          label="Expert policy"
          value={plan.expertPolicy ? `v${plan.expertPolicy.version}` : 'Unpinned'}
        />
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
