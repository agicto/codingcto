'use client';

import { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleX,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  RotateCcw,
  ScrollText,
  ShieldAlert,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils';
import {
  useCompleteExecutionTask,
  useCreateReviewPatchTask,
  useRetryExecutionTask,
  useSpecForgeTaskEvents,
  useVerifySpecForgePRNodeCI,
} from '@/features/specforge/hooks/use-specforge';
import {
  ciReviewActionFromResponse,
  type CIReviewAction,
} from '@/features/specforge/ci-review-actions';
import { prNodeFromDTO } from '@/features/specforge/plan-adapter';
import {
  nextBlockedNode,
  nextReviewableNode,
  summarizeDeliveryRun,
} from '@/features/specforge/delivery-status';
import type {
  SpecForgeExecutionBundleDTO,
  SpecForgeTaskEventDTO,
} from '@/features/specforge/services/specforge-service';
import type { ExecutionRun, PRNode } from '@/features/specforge/types';
import { statusClassName, statusLabel } from '@/features/specforge/components/workbench-utils';

export function RunSummary({
  progressText,
  approved,
  run,
}: {
  progressText: string;
  approved: boolean;
  run: ExecutionRun;
}) {
  const summary = summarizeDeliveryRun(run);
  const blockedNode = nextBlockedNode(run.tasks);
  const reviewableNode = nextReviewableNode(run.tasks);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium">PR delivery</div>
          <div className="mt-1 text-sm text-text-muted">{summary.headline}</div>
          <div className="mt-1 text-xs text-text-muted">{progressText}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={approved ? statusClassName('completed') : ''}>
            {approved ? 'Plan approved' : 'Plan approval required'}
          </Badge>
          <Badge
            variant="outline"
            className={
              run.status === 'running' || run.status === 'blocked'
                ? statusClassName(run.status)
                : ''
            }
          >
            {run.status === 'idle' ? 'No run started' : run.status}
          </Badge>
          {run.status !== 'idle' && (
            <Badge variant="outline">{run.selectedPRNodeIds.length} PR nodes selected</Badge>
          )}
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-bg-subtle">
        <div className="h-full bg-primary" style={{ width: `${summary.progressPercent}%` }} />
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <DeliveryMetric label="Ready" value={summary.ready} status="ready_for_review" />
        <DeliveryMetric label="Active" value={summary.active} status="ci_running" />
        <DeliveryMetric label="Waiting" value={summary.waiting} status="waiting_on_dependencies" />
        <DeliveryMetric label="Blocked" value={summary.blocked} status="blocked" />
        <DeliveryMetric label="Failed" value={summary.failed} status="failed" />
        <DeliveryMetric label="Merged" value={summary.merged} status="merged" />
      </div>
      <div className="mt-4 flex flex-col gap-2 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-text-main">Next action</div>
          <div className="mt-1 text-text-muted">{summary.nextAction}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockedNode && (
            <Badge variant="outline" className={statusClassName('blocked')}>
              {blockedNode.nodeKey} blocked
            </Badge>
          )}
          {reviewableNode && (
            <Badge variant="outline" className={statusClassName('ready_for_review')}>
              {reviewableNode.nodeKey} review
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

function DeliveryMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status: PRNode['status'];
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{label}</span>
        <Badge variant="outline" className={value > 0 ? statusClassName(status) : ''}>
          {value}
        </Badge>
      </div>
    </div>
  );
}

export function ExecutionStatus({
  run,
  repositoryId,
  isCancelling,
  onAdvance,
  onCancel,
  onExecutionBundle,
  onPRNodeUpdate,
}: {
  run: ExecutionRun;
  repositoryId: string;
  isCancelling: boolean;
  onAdvance: () => void;
  onCancel: () => void;
  onExecutionBundle: (bundle: SpecForgeExecutionBundleDTO) => void;
  onPRNodeUpdate: (node: PRNode) => void;
}) {
  const canAdvance = run.status === 'running';
  const canCancel = run.status === 'queued' || run.status === 'running' || run.status === 'blocked';
  const [selectedTask, setSelectedTask] = useState<PRNode>();
  const [taskActionError, setTaskActionError] = useState('');
  const [taskActionId, setTaskActionId] = useState<number>();
  const retryTask = useRetryExecutionTask();
  const completeTask = useCompleteExecutionTask();
  const createReviewPatchTask = useCreateReviewPatchTask();
  const verifyCI = useVerifySpecForgePRNodeCI();
  const [ciReviewActions, setCIReviewActions] = useState<Record<string, CIReviewAction>>({});
  const [ciReviewActionNodeId, setCIReviewActionNodeId] = useState<string>();
  const selectedTaskId = selectedTask?.taskId;
  const taskEventsQuery = useSpecForgeTaskEvents(selectedTaskId);
  const taskEvents = taskEventsQuery.data?.events ?? [];
  const isTaskActionPending =
    retryTask.isPending ||
    completeTask.isPending ||
    createReviewPatchTask.isPending ||
    verifyCI.isPending;
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

  async function reviewTaskCI(task: PRNode) {
    const prNodeId = Number(task.id);
    if (!repositoryId || !Number.isFinite(prNodeId) || prNodeId <= 0) {
      setTaskActionError('CI review requires a persisted repository and PR node.');
      return;
    }

    setTaskActionError('');
    setCIReviewActionNodeId(task.id);
    try {
      const result = await verifyCI.mutateAsync({
        prNodeId,
        payload: { repository_id: repositoryId },
      });
      const updated = prNodeFromDTO(result.pr_node);
      onPRNodeUpdate(updated);
      setCIReviewActions(current => ({
        ...current,
        [task.id]: ciReviewActionFromResponse(result),
      }));
    } catch {
      setTaskActionError(
        'CI review requires GitHub App access and a workflow run for this PR node.'
      );
    } finally {
      setCIReviewActionNodeId(undefined);
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
        <PRDeliveryOverview tasks={run.tasks} />
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
                  onClick={() => reviewTaskCI(task)}
                  disabled={isTaskActionPending || !['blocked', 'failed', 'ci_running'].includes(task.status)}
                >
                  {verifyCI.isPending && ciReviewActionNodeId === task.id ? 'Reviewing' : 'Review CI'}
                  <ShieldAlert className="ml-1.5 h-4 w-4" />
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
            {ciReviewActions[task.id] && <CIReviewActionPanel action={ciReviewActions[task.id]} />}
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

function PRDeliveryOverview({ tasks }: { tasks: PRNode[] }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
        No PR nodes have been selected for execution yet.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-main">
        <GitMerge className="h-4 w-4 text-primary" />
        Delivery graph
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {tasks
          .slice()
          .sort((a, b) => a.order - b.order)
          .map(task => (
            <div
              key={`${task.id}-${task.taskId ?? 'overview'}`}
              className="rounded-lg border border-border-subtle bg-bg-surface p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{task.nodeKey}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                    {task.title}
                  </div>
                </div>
                <Badge variant="outline" className={statusClassName(task.status)}>
                  {statusLabel[task.status]}
                </Badge>
              </div>
              {task.dependsOn.length > 0 && (
                <div className="mt-2 text-xs text-text-muted">
                  Depends on {task.dependsOn.join(', ')}
                </div>
              )}
              {task.githubPrUrl && (
                <a
                  href={task.githubPrUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center text-xs text-primary"
                >
                  Open GitHub PR
                  <ExternalLink className="ml-1 h-3 w-3" />
                </a>
              )}
            </div>
          ))}
      </div>
    </div>
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

function CIReviewActionPanel({ action }: { action: CIReviewAction }) {
  const toneClassName =
    action.tone === 'warning'
      ? 'border-warning/30 bg-warning-subtle text-warning'
      : action.tone === 'success'
        ? 'border-success/30 bg-success-subtle text-success'
        : action.tone === 'info'
          ? 'border-info/30 bg-info-subtle text-info'
          : 'border-border-subtle bg-bg-subtle text-text-muted';

  return (
    <div className={cn('rounded-lg border p-3 text-sm leading-6', toneClassName)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-text-main">{action.headline}</div>
        <Badge variant="outline">{action.label}</Badge>
      </div>
      <p className="mt-2">{action.nextAction}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {action.fixAttempt ? (
          <>
            <Badge variant="outline">attempt {action.fixAttempt.attempt_number}</Badge>
            <Badge variant="outline">{action.fixAttempt.risk_level} risk</Badge>
            <Badge variant="outline">{action.fixAttempt.action_kind}</Badge>
          </>
        ) : null}
        {action.escalationSummary ? (
          <Badge variant="outline">
            {action.escalationSummary.attempts_used}/{action.escalationSummary.max_attempts}{' '}
            attempts
          </Badge>
        ) : null}
      </div>
      {action.fixAttempt?.blocked_reason ? (
        <p className="mt-2 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
          Guardrail: {action.fixAttempt.blocked_reason}
        </p>
      ) : null}
      {action.escalationSummary?.latest_blocked_reason ? (
        <p className="mt-2 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
          Guardrail: {action.escalationSummary.latest_blocked_reason}
        </p>
      ) : null}
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
