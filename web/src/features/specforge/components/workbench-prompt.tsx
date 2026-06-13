'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  ScrollText,
  ShieldAlert,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/utils';
import { prNodeFromDTO } from '@/features/specforge/plan-adapter';
import { hasActiveFixAttempt } from '@/features/specforge/fix-attempts';
import {
  useDeliverSpecForgePRNode,
  usePrepareSpecForgePRNodeBranch,
  useRefreshSpecForgePRNodeCI,
  useReadSpecForgePRNodeFailureLog,
  useSpecForgeEscalationSummary,
  useSpecForgeFixAttempts,
  useVerifySpecForgePRNodeCI,
} from '@/features/specforge/hooks/use-specforge';
import {
  maxFixAttemptsPerNode,
  promptModeLabel,
  promptModes,
  riskClassName,
  statusClassName,
  type PromptMode,
} from '@/features/specforge/components/workbench-utils';
import type {
  SpecForgeEscalationSummaryDTO,
  SpecForgeFixAttemptDTO,
  SpecForgePRNodeFailureLogDTO,
} from '@/features/specforge/services/specforge-service';
import type { PRNode } from '@/features/specforge/types';

export function PRDag({
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
        'GitHub delivery controls require the CodingCTO backend, GitHub connection, and repository permissions.'
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
        risk_level: 'high',
        action_kind: 'user_decision',
        blocked_reason: 'No live CI log is available, so CodingCTO cannot safely patch code.',
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
        'Failure logs require a failed GitHub workflow run and GitHub access.'
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
                    <Badge variant="outline">{attempt.risk_level} risk</Badge>
                    <Badge variant="outline">{attempt.action_kind}</Badge>
                    <Badge variant="outline">{attempt.status}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-text-muted">{attempt.likely_cause}</p>
                <p className="mt-2 text-sm leading-6 text-text-main">
                  {attempt.recommended_action}
                </p>
                {attempt.blocked_reason ? (
                  <p className="mt-2 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
                    Guardrail: {attempt.blocked_reason}
                  </p>
                ) : null}
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
      {(summary.latest_risk_level || summary.latest_action_kind) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {summary.latest_risk_level ? (
            <Badge variant="outline">{summary.latest_risk_level} risk</Badge>
          ) : null}
          {summary.latest_action_kind ? (
            <Badge variant="outline">{summary.latest_action_kind}</Badge>
          ) : null}
        </div>
      )}
      {summary.latest_blocked_reason ? (
        <p className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5">
          Guardrail: {summary.latest_blocked_reason}
        </p>
      ) : null}
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
