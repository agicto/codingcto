'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  GitPullRequest,
  GitMerge,
  ShieldAlert,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { ApiError } from '@/http/request';
import {
  useApproveSpecForgeReviewDecision,
  useRejectSpecForgeReviewDecision,
  useRequestSpecForgeReviewMerge,
  useSpecForgeEscalationSummary,
  useSpecForgeFixAttempts,
  useSpecForgeReviewDecision,
} from '@/features/specforge/hooks/use-specforge';
import type {
  SpecForgeEscalationSummaryDTO,
  SpecForgeFixAttemptDTO,
} from '@/features/specforge/services/specforge-service';
import {
  mergeRequestResultFromDTO,
  reviewDecisionStateFromDTO,
} from '@/features/review/review-adapter';
import type {
  ReviewCheckStatus,
  ReviewDecisionCheck,
  ReviewDecisionState,
  ReviewDecisionStatus,
} from '@/features/review/types';
import {
  projectOverviewHref,
  projectPlanHref,
  projectSpecForgeHref,
} from '@/features/project/project-utils';

export function ProjectPRReviewPage() {
  const params = useParams<{ projectId: string; prNodeId: string }>();
  const projectId = Number(params.projectId);
  const prNodeId = Number(params.prNodeId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const validPRNodeId = Number.isFinite(prNodeId) ? prNodeId : 0;
  const reviewQuery = useSpecForgeReviewDecision(validPRNodeId);
  const fixAttemptsQuery = useSpecForgeFixAttempts(validPRNodeId);
  const escalationSummaryQuery = useSpecForgeEscalationSummary(validPRNodeId);
  const approveDecision = useApproveSpecForgeReviewDecision();
  const rejectDecision = useRejectSpecForgeReviewDecision();
  const requestMerge = useRequestSpecForgeReviewMerge();
  const [decisionNote, setDecisionNote] = useState('');
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge');
  const [commitTitle, setCommitTitle] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; message: string }>();

  const reviewState = useMemo(
    () => (reviewQuery.data ? reviewDecisionStateFromDTO(reviewQuery.data) : undefined),
    [reviewQuery.data]
  );

  if (!validProjectId || !validPRNodeId) {
    return (
      <ReviewPageState
        title="Invalid PR node"
        description="Open a valid project PR review route from CodingCTO."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!reviewState && reviewQuery.isLoading) {
    return <ReviewLoadingState />;
  }

  if (reviewQuery.isError || !reviewState) {
    return (
      <ReviewPageState
        title="PR review unavailable"
        description="The PR review state could not be loaded. Confirm backend auth and try again."
        actionHref={projectSpecForgeHref(validProjectId)}
        actionLabel="Back to delivery board"
      />
    );
  }

  const prNode = reviewState.prNode;
  const fixAttempts = fixAttemptsQuery.data ?? [];
  const escalationSummary = escalationSummaryQuery.data;
  const actionPending =
    approveDecision.isPending || rejectDecision.isPending || requestMerge.isPending;

  async function handleApprove() {
    setFeedback(undefined);
    try {
      const response = await approveDecision.mutateAsync({
        prNodeId: validPRNodeId,
        payload: decisionNote.trim() ? { reason: decisionNote.trim() } : undefined,
      });
      const updated = reviewDecisionStateFromDTO(response);
      setDecisionNote('');
      setFeedback({
        tone: 'success',
        message: updated.summary,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Approval failed. Refresh the review decision and try again.',
      });
    }
  }

  async function handleReject() {
    if (!decisionNote.trim()) {
      setFeedback({
        tone: 'error',
        message: 'Enter a rejection note before blocking merge approval.',
      });
      return;
    }
    setFeedback(undefined);
    try {
      const response = await rejectDecision.mutateAsync({
        prNodeId: validPRNodeId,
        payload: { reason: decisionNote.trim() },
      });
      const updated = reviewDecisionStateFromDTO(response);
      setFeedback({
        tone: 'success',
        message: updated.summary,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Rejecting merge approval failed. Try again after refreshing the page.',
      });
    }
  }

  async function handleMerge() {
    setFeedback(undefined);
    try {
      const response = await requestMerge.mutateAsync({
        prNodeId: validPRNodeId,
        payload: {
          merge_method: mergeMethod,
          commit_title: commitTitle.trim() || undefined,
          commit_message: commitMessage.trim() || undefined,
        },
      });
      const result = mergeRequestResultFromDTO(response);
      setFeedback({
        tone: 'success',
        message: `${result.mergeMessage}${result.mergeSha ? ` (${result.mergeSha})` : ''}`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof ApiError
            ? error.message
            : 'Merge request failed. Confirm the PR is still approved for the current head SHA.',
      });
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <header className="border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={nodeStatusBadgeClass(prNode.status)}>
            {nodeStatusLabel(prNode.status)}
          </Badge>
          <Badge variant="outline" className={decisionStatusBadgeClass(reviewState.decisionStatus)}>
            {decisionStatusLabel(reviewState.decisionStatus)}
          </Badge>
          {reviewState.mergeReady ? (
            <Badge variant="outline" className="border-success/30 text-success">
              Merge ready
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-main">
              {prNode.nodeKey}: {prNode.title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {reviewState.summary}
            </p>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
              {reviewState.nextAction}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href={projectOverviewHref(validProjectId)}>Project overview</Link>
            </Button>
            {prNode.planId ? (
              <Button asChild variant="outline">
                <Link href={projectPlanHref(validProjectId, prNode.planId)}>Open plan</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={projectSpecForgeHref(validProjectId)}>Delivery board</Link>
            </Button>
            {prNode.githubPrUrl ? (
              <Button asChild>
                <Link href={prNode.githubPrUrl} target="_blank" rel="noreferrer">
                  Open GitHub PR
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {feedback ? (
        <Alert
          className={
            feedback.tone === 'error'
              ? 'border-error/30 bg-error-subtle'
              : 'border-success/30 bg-success-subtle'
          }
        >
          <AlertTitle>{feedback.tone === 'error' ? 'Action failed' : 'Action recorded'}</AlertTitle>
          <AlertDescription className="mt-2">{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetaTile label="Repository" value={prNode.repositoryId ?? 'Unknown'} />
        <MetaTile
          label="GitHub PR"
          value={prNode.githubPrNumber ? `#${prNode.githubPrNumber}` : 'Not opened'}
        />
        <MetaTile label="Branch" value={prNode.branchName || 'Unknown'} />
        <MetaTile label="Head SHA" value={prNode.headSha || 'Unavailable'} mono />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-5">
          <ReviewChecklistSection checks={reviewState.checks} />
          <ReviewSignalsSection
            fixAttempts={fixAttempts}
            escalationSummary={escalationSummary}
            reviewState={reviewState}
          />
        </div>

        <div className="space-y-5">
          <DecisionStateSection state={reviewState} />
          <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-center gap-2 text-base font-medium text-text-main">
              <GitMerge className="h-4 w-4 text-primary" />
              Approve and merge
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              Record an explicit CodingCTO decision for the current head SHA, then request merge
              through the GitHub transport once every required check is ready.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm font-medium text-text-main">Decision note</div>
                <Textarea
                  className="mt-2 min-h-28"
                  placeholder="Optional for approval. Required for rejection."
                  value={decisionNote}
                  disabled={actionPending}
                  onChange={event => setDecisionNote(event.target.value)}
                />
              </div>

              <div>
                <div className="text-sm font-medium text-text-main">Merge method</div>
                <ToggleGroup
                  type="single"
                  className="mt-2 justify-start"
                  value={mergeMethod}
                  onValueChange={value => {
                    if (value === 'merge' || value === 'squash' || value === 'rebase') {
                      setMergeMethod(value);
                    }
                  }}
                >
                  <ToggleGroupItem value="merge" aria-label="Merge commit">
                    Merge
                  </ToggleGroupItem>
                  <ToggleGroupItem value="squash" aria-label="Squash and merge">
                    Squash
                  </ToggleGroupItem>
                  <ToggleGroupItem value="rebase" aria-label="Rebase and merge">
                    Rebase
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-2">
                <Input
                  placeholder="Optional merge commit title"
                  value={commitTitle}
                  disabled={actionPending}
                  onChange={event => setCommitTitle(event.target.value)}
                />
                <Textarea
                  className="min-h-24"
                  placeholder="Optional merge commit message"
                  value={commitMessage}
                  disabled={actionPending}
                  onChange={event => setCommitMessage(event.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={handleApprove}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Approve current head
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={actionPending}
                onClick={handleReject}
              >
                Block merge
              </Button>
              <Button
                type="button"
                disabled={actionPending || !reviewState.mergeReady}
                onClick={handleMerge}
              >
                Request merge
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>

            {!reviewState.mergeReady ? (
              <p className="mt-3 text-xs leading-5 text-text-muted">
                Merge stays disabled until every required checklist item is ready.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}

function ReviewChecklistSection({ checks }: { checks: ReviewDecisionCheck[] }) {
  return (
    <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center gap-2 text-base font-medium text-text-main">
        <ShieldAlert className="h-4 w-4 text-primary" />
        Merge readiness checklist
      </div>
      <div className="mt-4 space-y-2">
        {checks.map(check => (
          <div
            key={check.key}
            className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">{check.label}</div>
              <Badge variant="outline" className={checkStatusBadgeClass(check.status)}>
                {checkStatusLabel(check.status)}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">{check.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReviewSignalsSection({
  fixAttempts,
  escalationSummary,
  reviewState,
}: {
  fixAttempts: SpecForgeFixAttemptDTO[];
  escalationSummary?: SpecForgeEscalationSummaryDTO;
  reviewState: ReviewDecisionState;
}) {
  return (
    <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center gap-2 text-base font-medium text-text-main">
        <GitPullRequest className="h-4 w-4 text-primary" />
        Review and CI signals
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MetaTile label="Decision status" value={decisionStatusLabel(reviewState.decisionStatus)} />
        <MetaTile label="Fix attempts" value={String(fixAttempts.length)} />
      </div>
      {escalationSummary ? (
        <div className="mt-4 rounded-md border border-border-subtle bg-bg-subtle px-3 py-3">
          <div className="text-sm font-medium text-text-main">Escalation summary</div>
          <p className="mt-2 text-sm leading-6 text-text-muted">{escalationSummary.reason}</p>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Attempts used {escalationSummary.attempts_used} / {escalationSummary.max_attempts}.{' '}
            {escalationSummary.recommended_option}
          </p>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {fixAttempts.slice(0, 3).map(attempt => (
          <div
            key={attempt.id}
            className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium text-text-main">
                Attempt #{attempt.attempt_number} · {attempt.failure_type}
              </div>
              <Badge variant="outline" className={fixAttemptBadgeClass(attempt.status)}>
                {attempt.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              {attempt.blocked_reason ||
                attempt.recommended_action ||
                'No additional detail recorded.'}
            </p>
          </div>
        ))}
        {fixAttempts.length === 0 ? (
          <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-3 text-sm leading-6 text-text-muted">
            No fix attempts are recorded for this PR node yet.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DecisionStateSection({ state }: { state: ReviewDecisionState }) {
  return (
    <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-base font-medium text-text-main">Decision state</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{state.summary}</p>
        </div>
        <Badge variant="outline" className={decisionStatusBadgeClass(state.decisionStatus)}>
          {decisionStatusLabel(state.decisionStatus)}
        </Badge>
      </div>
      {state.decision ? (
        <div className="mt-4 space-y-2 rounded-md border border-border-subtle bg-bg-subtle px-3 py-3">
          <MetaLine label="Approved head" value={state.decision.headSha} mono />
          <MetaLine label="Decided at" value={formatTimestamp(state.decision.decidedAt)} />
          {state.decision.reason ? (
            <div className="text-sm leading-6 text-text-muted">{state.decision.reason}</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-border-subtle bg-bg-subtle px-3 py-3 text-sm leading-6 text-text-muted">
          No CodingCTO decision is recorded for this PR node yet.
        </div>
      )}
    </section>
  );
}

function MetaTile({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-3">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={
          mono
            ? 'mt-2 text-sm font-medium text-text-main font-mono'
            : 'mt-2 text-sm font-medium text-text-main'
        }
      >
        {value}
      </div>
    </div>
  );
}

function MetaLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <div className="text-xs uppercase tracking-wide text-text-muted">{label}</div>
      <div
        className={
          mono
            ? 'text-sm font-medium text-text-main font-mono'
            : 'text-sm font-medium text-text-main'
        }
      >
        {value}
      </div>
    </div>
  );
}

function ReviewPageState({
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

function ReviewLoadingState() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 md:px-8">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    </div>
  );
}

function decisionStatusLabel(status: ReviewDecisionStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'expired':
      return 'Expired';
    default:
      return 'Pending';
  }
}

function decisionStatusBadgeClass(status: ReviewDecisionStatus): string {
  switch (status) {
    case 'approved':
      return 'border-success/30 text-success';
    case 'rejected':
      return 'border-error/30 text-error';
    case 'expired':
      return 'border-warning/30 text-warning';
    default:
      return 'border-border-subtle text-text-muted';
  }
}

function checkStatusLabel(status: ReviewCheckStatus): string {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'blocked':
      return 'Blocked';
    default:
      return 'Attention';
  }
}

function checkStatusBadgeClass(status: ReviewCheckStatus): string {
  switch (status) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'blocked':
      return 'border-error/30 text-error';
    default:
      return 'border-warning/30 text-warning';
  }
}

function nodeStatusLabel(status: string): string {
  switch (status) {
    case 'ready_for_review':
      return 'Ready for review';
    case 'ci_running':
      return 'CI running';
    case 'pr_opened':
      return 'PR opened';
    case 'merged':
      return 'Merged';
    case 'blocked':
      return 'Blocked';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

function nodeStatusBadgeClass(status: string): string {
  switch (status) {
    case 'ready_for_review':
    case 'merged':
      return 'border-success/30 text-success';
    case 'blocked':
    case 'closed':
      return 'border-error/30 text-error';
    case 'ci_running':
      return 'border-warning/30 text-warning';
    default:
      return 'border-border-subtle text-text-muted';
  }
}

function fixAttemptBadgeClass(status: string): string {
  switch (status) {
    case 'success':
      return 'border-success/30 text-success';
    case 'failed':
      return 'border-error/30 text-error';
    default:
      return 'border-warning/30 text-warning';
  }
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}
