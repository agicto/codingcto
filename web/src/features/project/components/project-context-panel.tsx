'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, KeyRound, RefreshCw, ScrollText } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { ApiError } from '@/http/request';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  useBindProjectRepository,
  useCreateProjectExpertPolicy,
  useProjectExpertPolicy,
  useRefreshProjectContextSnapshot,
  useUnbindProjectRepository,
  useUpdateProjectExpertPolicy,
  projectKeys,
} from '@/features/project/hooks/use-projects';
import {
  projectContextContract,
  projectContextMissingEvidence,
  projectContextReadiness,
  projectContextSnapshotState,
  projectSkillContract,
} from '@/features/project/project-context';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useGitHubRepositories,
  useReindexRepoArchitecture,
} from '@/features/specforge/hooks/use-specforge';
import { projectOverviewHref, projectSpecForgeHref } from '@/features/project/project-utils';
import { useT } from '@/i18n';

export function ProjectContextPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;

  if (!validProjectId) {
    return (
      <ProjectContextState
        title="Invalid project"
        description="Open a valid project from the project list."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return <ProjectContextState title="Loading context" description="Reading project context." />;
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectContextState
        title="Project context unavailable"
        description="The project context could not be loaded. Confirm backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 md:px-8">
      <ProjectContextHeader context={context} />
      <ProjectContextPanel context={context} />
    </main>
  );
}

export function ProjectContextPanel({ context }: { context: ProjectContextDTO }) {
  const workspaceId = context.project.workspace_id;

  return (
    <div className="space-y-5">
      <ProjectRepositoryBindPanel
        id="repository-binding"
        projectId={context.project.id}
        workspaceId={workspaceId}
        boundRepositoryIds={(context.repository_contexts ?? []).map(
          item => item.repository.repository_id
        )}
      />
      <ProjectContextSnapshotPanel context={context} />
      <ProjectExpertPolicyPanel projectId={context.project.id} />
      <ProjectSkillContractPanel context={context} />
      <ProjectContextReadiness context={context} />
    </div>
  );
}

function ProjectContextSnapshotPanel({ context }: { context: ProjectContextDTO }) {
  const queryClient = useQueryClient();
  const snapshotState = projectContextSnapshotState(context);
  const refreshSnapshot = useRefreshProjectContextSnapshot(context.project.id);
  const snapshot = snapshotState.snapshot;
  const [message, setMessage] = useState('');

  async function handleRefreshSnapshot() {
    setMessage('');
    try {
      await refreshSnapshot.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: projectKeys.context(context.project.id) });
      setMessage('Unified context snapshot refreshed.');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Context snapshot refresh failed: ${error.message}`
          : 'Context snapshot refresh failed.'
      );
    }
  }

  const badgeClass =
    snapshotState.status === 'ready'
      ? 'border-success/30 text-success'
      : snapshotState.status === 'blocked'
        ? 'border-warning/30 text-warning'
        : 'border-primary/30 text-primary';
  const badgeLabel =
    snapshotState.status === 'missing'
      ? 'Not generated'
      : snapshotState.status === 'ready'
        ? 'Ready'
        : snapshotState.status === 'blocked'
          ? 'Blocked'
          : 'Attention';

  return (
    <Card id="context-snapshot" className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Unified context snapshot</CardTitle>
            <CardDescription className="mt-1">
              Normalize RepoContext and DeepWiki evidence into one stable project-scoped packet
              before planning.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={badgeClass}>
              {badgeLabel}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshSnapshot}
              disabled={refreshSnapshot.isPending}
            >
              {refreshSnapshot.isPending ? 'Refreshing' : 'Refresh snapshot'}
              <RefreshCw
                className={
                  refreshSnapshot.isPending
                    ? 'ml-1.5 h-3.5 w-3.5 animate-spin'
                    : 'ml-1.5 h-3.5 w-3.5'
                }
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-text-muted">
          {snapshot?.summary ??
            'No snapshot has been generated yet. Refresh after binding repositories or updating architecture evidence.'}
        </p>
        <div className="grid gap-2 text-xs sm:grid-cols-5">
          <ReadinessMetric label="Repositories" value={snapshotState.repositoryCount} />
          <ReadinessMetric label="DeepWiki" value={snapshotState.deepWikiCount} />
          <ReadinessMetric label="Missing evidence" value={snapshotState.missingEvidenceCount} />
          <ReadinessMetric label="Warnings" value={snapshotState.warningCount} />
          <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
            <div className="text-sm font-semibold text-text-main">
              {snapshot?.updated_at ? new Date(snapshot.updated_at).toLocaleString() : 'Pending'}
            </div>
            <div className="mt-1 text-text-muted">Updated</div>
          </div>
        </div>
        {snapshot ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <div className="font-medium text-text-main">Primary repository</div>
                  <div className="mt-1 text-text-muted">
                    {snapshot.primary_repository_id || 'Missing'}
                  </div>
                </div>
                <div>
                  <div className="font-medium text-text-main">Evidence refs</div>
                  <div className="mt-1 text-text-muted">{snapshot.evidence_refs?.length ?? 0}</div>
                </div>
                <div>
                  <div className="font-medium text-text-main">Snapshot ID</div>
                  <div className="mt-1 text-text-muted">{snapshot.id}</div>
                </div>
              </div>
            </div>
            {snapshot.repositories?.length ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {snapshot.repositories.map(repository => (
                  <div
                    key={repository.repository_id}
                    className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-main">
                          {repository.repository_id}
                        </div>
                        <div className="mt-1 text-text-muted">
                          {repository.profile_summary ||
                            repository.architecture_summary ||
                            'No compact summary yet.'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{repository.role}</Badge>
                        {repository.deepwiki?.index_id ? (
                          <Badge variant="outline" className="border-success/30 text-success">
                            DeepWiki linked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/30 text-warning">
                            DeepWiki missing
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-text-muted">
                      <div>Skills: {repository.skill_names?.length ?? 0}</div>
                      <div>Warnings: {repository.warning_count}</div>
                      <div>
                        Architecture: {repository.architecture_snapshot_commit || 'Missing'}
                      </div>
                      <div>Pages: {repository.deepwiki?.page_count ?? 0}</div>
                    </div>
                    {repository.deepwiki ? (
                      <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-text-muted">
                        <div>
                          Frameworks:{' '}
                          {(repository.deepwiki.frameworks ?? []).slice(0, 3).join(', ') || 'None'}
                        </div>
                        <div className="mt-1">
                          Top pages:{' '}
                          {(repository.deepwiki.top_pages ?? []).slice(0, 3).join(', ') || 'None'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
            {message}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type ExpertPolicyFormState = {
  goalBoundary: string;
  allowedPaths: string;
  forbiddenPaths: string;
  requiredTestCommands: string;
  requiredApprovals: string;
  allowAuthorApproval: boolean;
  blockOnChangesRequested: boolean;
  requireCIGreen: boolean;
  strategy: 'squash' | 'rebase' | 'merge';
  requireManualApproval: boolean;
  allowAutoMerge: boolean;
};

function emptyExpertPolicyForm(): ExpertPolicyFormState {
  return {
    goalBoundary: '',
    allowedPaths: '',
    forbiddenPaths: '',
    requiredTestCommands: '',
    requiredApprovals: '1',
    allowAuthorApproval: false,
    blockOnChangesRequested: true,
    requireCIGreen: true,
    strategy: 'squash',
    requireManualApproval: true,
    allowAutoMerge: false,
  };
}

function projectExpertPolicyForm(
  policy?: {
    goal_boundary?: string;
    allowed_paths?: string[];
    forbidden_paths?: string[];
    required_test_commands?: string[];
    review_policy?: {
      required_approvals?: number;
      allow_author_approval?: boolean;
      block_on_changes_requested?: boolean;
      require_ci_green?: boolean;
    };
    merge_policy?: {
      strategy?: string;
      require_manual_approval?: boolean;
      allow_auto_merge?: boolean;
    };
  } | null
): ExpertPolicyFormState {
  if (!policy) {
    return emptyExpertPolicyForm();
  }
  return {
    goalBoundary: policy.goal_boundary ?? '',
    allowedPaths: (policy.allowed_paths ?? []).join('\n'),
    forbiddenPaths: (policy.forbidden_paths ?? []).join('\n'),
    requiredTestCommands: (policy.required_test_commands ?? []).join('\n'),
    requiredApprovals: String(policy.review_policy?.required_approvals ?? 1),
    allowAuthorApproval: Boolean(policy.review_policy?.allow_author_approval),
    blockOnChangesRequested: policy.review_policy?.block_on_changes_requested ?? true,
    requireCIGreen: policy.review_policy?.require_ci_green ?? true,
    strategy:
      policy.merge_policy?.strategy === 'merge' || policy.merge_policy?.strategy === 'rebase'
        ? policy.merge_policy.strategy
        : 'squash',
    requireManualApproval: policy.merge_policy?.require_manual_approval ?? true,
    allowAutoMerge: Boolean(policy.merge_policy?.allow_auto_merge),
  };
}

function projectPolicyLines(value: string) {
  return value
    .split('\n')
    .map(entry => entry.trim())
    .filter(Boolean);
}

function ProjectExpertPolicyPanel({ projectId }: { projectId: number }) {
  const policyQuery = useProjectExpertPolicy(projectId);
  const createPolicy = useCreateProjectExpertPolicy(projectId);
  const updatePolicy = useUpdateProjectExpertPolicy(projectId);
  const policy = policyQuery.data?.policy ?? null;
  const policyKey = policy ? `${policy.id}:${policy.updated_at}` : 'empty';

  return (
    <ProjectExpertPolicyForm
      key={policyKey}
      policy={policy}
      policyQueryError={policyQuery.isError}
      createPolicy={createPolicy}
      updatePolicy={updatePolicy}
    />
  );
}

function ProjectExpertPolicyForm({
  policy,
  policyQueryError,
  createPolicy,
  updatePolicy,
}: {
  policy: NonNullable<ReturnType<typeof useProjectExpertPolicy>['data']>['policy'] | null;
  policyQueryError: boolean;
  createPolicy: ReturnType<typeof useCreateProjectExpertPolicy>;
  updatePolicy: ReturnType<typeof useUpdateProjectExpertPolicy>;
}) {
  const [form, setForm] = useState<ExpertPolicyFormState>(() => projectExpertPolicyForm(policy));
  const [message, setMessage] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const payload = {
      goal_boundary: form.goalBoundary.trim(),
      allowed_paths: projectPolicyLines(form.allowedPaths),
      forbidden_paths: projectPolicyLines(form.forbiddenPaths),
      required_test_commands: projectPolicyLines(form.requiredTestCommands),
      review_policy: {
        required_approvals: Number.parseInt(form.requiredApprovals, 10) || 0,
        allow_author_approval: form.allowAuthorApproval,
        block_on_changes_requested: form.blockOnChangesRequested,
        require_ci_green: form.requireCIGreen,
      },
      merge_policy: {
        strategy: form.strategy,
        require_manual_approval: form.requireManualApproval,
        allow_auto_merge: form.allowAutoMerge,
      },
    };

    try {
      const response = policy
        ? await updatePolicy.mutateAsync({ policyId: policy.id, payload })
        : await createPolicy.mutateAsync(payload);
      setForm(projectExpertPolicyForm(response.policy));
      setMessage(`Expert policy v${response.policy.version} is now active for this project.`);
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Expert policy save failed: ${error.message}`
          : 'Expert policy save failed.'
      );
    }
  }

  const saving = createPolicy.isPending || updatePolicy.isPending;

  return (
    <Card id="expert-policy" className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="text-base">Expert policy</CardTitle>
            <CardDescription className="mt-1">
              Persist project-level scope, review, and merge rules before later workflow steps
              consume them.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                policy ? 'border-success/30 text-success' : 'border-warning/30 text-warning'
              }
            >
              {policy ? `Active v${policy.version}` : 'Missing'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="expert-goal-boundary">Goal boundary</Label>
            <Textarea
              id="expert-goal-boundary"
              value={form.goalBoundary}
              onChange={event =>
                setForm(current => ({ ...current, goalBoundary: event.target.value }))
              }
              placeholder="Define what the project-level experts may and may not change."
              rows={4}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="expert-allowed-paths">Allowed paths</Label>
              <Textarea
                id="expert-allowed-paths"
                value={form.allowedPaths}
                onChange={event =>
                  setForm(current => ({ ...current, allowedPaths: event.target.value }))
                }
                placeholder="api/internal/modules/project"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expert-forbidden-paths">Forbidden paths</Label>
              <Textarea
                id="expert-forbidden-paths"
                value={form.forbiddenPaths}
                onChange={event =>
                  setForm(current => ({ ...current, forbiddenPaths: event.target.value }))
                }
                placeholder="api/internal/modules/execution"
                rows={5}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expert-required-tests">Required test commands</Label>
              <Textarea
                id="expert-required-tests"
                value={form.requiredTestCommands}
                onChange={event =>
                  setForm(current => ({ ...current, requiredTestCommands: event.target.value }))
                }
                placeholder="cd api && go test ./..."
                rows={5}
              />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-sm font-medium text-text-main">Review policy</div>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="expert-required-approvals">Required approvals</Label>
                  <Input
                    id="expert-required-approvals"
                    type="number"
                    min={0}
                    max={10}
                    value={form.requiredApprovals}
                    onChange={event =>
                      setForm(current => ({ ...current, requiredApprovals: event.target.value }))
                    }
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <Checkbox
                    checked={form.allowAuthorApproval}
                    onCheckedChange={checked =>
                      setForm(current => ({ ...current, allowAuthorApproval: Boolean(checked) }))
                    }
                  />
                  Allow author approval
                </label>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <Checkbox
                    checked={form.blockOnChangesRequested}
                    onCheckedChange={checked =>
                      setForm(current => ({
                        ...current,
                        blockOnChangesRequested: Boolean(checked),
                      }))
                    }
                  />
                  Block on changes requested
                </label>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <Checkbox
                    checked={form.requireCIGreen}
                    onCheckedChange={checked =>
                      setForm(current => ({ ...current, requireCIGreen: Boolean(checked) }))
                    }
                  />
                  Require CI green
                </label>
              </div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-sm font-medium text-text-main">Merge policy</div>
              <div className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="expert-merge-strategy">Strategy</Label>
                  <Select
                    value={form.strategy}
                    onValueChange={value =>
                      setForm(current => ({
                        ...current,
                        strategy: value as 'squash' | 'rebase' | 'merge',
                      }))
                    }
                  >
                    <SelectTrigger id="expert-merge-strategy">
                      <SelectValue placeholder="Select strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="squash">Squash</SelectItem>
                      <SelectItem value="rebase">Rebase</SelectItem>
                      <SelectItem value="merge">Merge commit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <Checkbox
                    checked={form.requireManualApproval}
                    onCheckedChange={checked =>
                      setForm(current => ({
                        ...current,
                        requireManualApproval: Boolean(checked),
                      }))
                    }
                  />
                  Require manual approval before merge
                </label>
                <label className="flex items-center gap-2 text-sm text-text-muted">
                  <Checkbox
                    checked={form.allowAutoMerge}
                    onCheckedChange={checked =>
                      setForm(current => ({ ...current, allowAutoMerge: Boolean(checked) }))
                    }
                  />
                  Allow auto-merge when checks pass
                </label>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={saving || !form.goalBoundary.trim()}>
              {saving ? 'Saving' : policy ? 'Create next policy version' : 'Save expert policy'}
            </Button>
            {policy ? (
              <span className="text-xs text-text-muted">
                Last updated {new Date(policy.updated_at).toLocaleString()}
              </span>
            ) : null}
          </div>
          {policyQueryError ? (
            <div className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
              Existing policy could not be loaded. Saving a new version is still available.
            </div>
          ) : null}
          {message ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
              {message}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function ProjectSkillContractPanel({ context }: { context: ProjectContextDTO }) {
  const skillContract = projectSkillContract(context);

  return (
    <Card id="skill-contract" className="scroll-mt-20">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScrollText className="h-4 w-4 text-primary" />
              Skill contract
            </CardTitle>
            <CardDescription className="mt-1">
              Review the instructions that will constrain planning, PR DAG generation, and prompt
              compilation.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={
              skillContract.canPlanWithSkills
                ? 'border-success/30 text-success'
                : 'border-warning/30 text-warning'
            }
          >
            {skillContract.canPlanWithSkills ? 'Complete' : 'Needs skills'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-text-muted">{skillContract.summary}</p>
        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <ReadinessMetric label="Pinned skills" value={skillContract.pinnedSkillCount} />
          <ReadinessMetric label="Repo skills" value={skillContract.repositorySkillCount} />
          <ReadinessMetric label="Evidence refs" value={skillContract.promptEvidenceRefs.length} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-text-main">
              <KeyRound className="h-4 w-4 text-primary" />
              Effective skills
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {skillContract.effectiveSkillNames.map(name => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
              {skillContract.effectiveSkillNames.length === 0 ? (
                <span className="text-xs text-text-muted">No active skill instructions.</span>
              ) : null}
            </div>
          </div>
          <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="text-sm font-medium text-text-main">Repositories missing skills</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {skillContract.repositoriesMissingSkills.map(repositoryID => (
                <Badge
                  key={repositoryID}
                  variant="outline"
                  className="border-warning/30 text-warning"
                >
                  {repositoryID}
                </Badge>
              ))}
              {skillContract.repositoriesMissingSkills.length === 0 ? (
                <span className="text-xs text-text-muted">
                  Every active repository has prompt instructions.
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">Prompt evidence refs</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {skillContract.promptEvidenceRefs.slice(0, 10).map(ref => (
              <Badge key={ref} variant="outline" className="font-mono text-[11px] text-text-muted">
                {ref}
              </Badge>
            ))}
            {skillContract.promptEvidenceRefs.length === 0 ? (
              <span className="text-xs text-text-muted">
                No skill evidence refs will be attached to compiled prompts.
              </span>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProjectContextHeader({ context }: { context: ProjectContextDTO }) {
  const readiness = projectContextReadiness(context);
  const deliveryHref = projectSpecForgeHref(context.project.id);

  return (
    <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Project context</Badge>
          <Badge
            variant="outline"
            className={
              readiness.warningCount > 0
                ? 'border-warning/30 text-warning'
                : 'border-success/30 text-success'
            }
          >
            {readiness.warningCount > 0 ? 'Needs review' : 'Ready signal'}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
          {context.project.name}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
          Verify repositories, architecture snapshots, skills, warnings, and prompt guardrails
          before planning or execution.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={projectOverviewHref(context.project.id)}>Overview</Link>
        </Button>
        <Button asChild>
          <Link href={deliveryHref}>
            Open delivery board
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </header>
  );
}

function ProjectContextState({
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

export function ProjectRepositoryBindPanel({
  id,
  projectId,
  workspaceId,
  boundRepositoryIds = [],
}: {
  id?: string;
  projectId: number;
  workspaceId: string;
  boundRepositoryIds?: string[];
}) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const repositoriesQuery = useGitHubRepositories({ workspace_id: workspaceId });
  const repositories = repositoriesQuery.data?.repositories ?? [];
  const availableRepositories = repositories.filter(
    repository => !boundRepositoryIds.includes(repository.repository_id)
  );
  const allConnectedRepositoriesBound =
    repositories.length > 0 && availableRepositories.length === 0;
  const [repositoryId, setRepositoryId] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');

  async function bindRepositoryToProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRepositoryId = repositoryId.trim();
    if (!nextRepositoryId) {
      setMessage(t('messages.repositoryRequired'));
      return;
    }
    setMessage('');
    try {
      const response = await bindRepository.mutateAsync({
        repository_id: nextRepositoryId,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setRepositoryId('');
      setRole('primary');
      setMessage(
        t('messages.bound', {
          role: t(`roles.${response.repository.role}`),
          repoId: response.repository.repository_id,
        })
      );
    } catch {
      setMessage(t('messages.bindFailed'));
    }
  }

  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={bindRepositoryToProject}
        >
          <div className="space-y-2">
            <Label htmlFor="project-repository-id">{t('repositoryId')}</Label>
            {repositories.length > 0 ? (
              <Select
                value={repositoryId}
                onValueChange={setRepositoryId}
                disabled={allConnectedRepositoriesBound}
              >
                <SelectTrigger id="project-repository-id">
                  <SelectValue
                    placeholder={
                      allConnectedRepositoriesBound
                        ? t('allRepositoriesBound')
                        : t('selectRepository')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableRepositories.map(repository => (
                    <SelectItem key={repository.repository_id} value={repository.repository_id}>
                      {repository.github_owner}/{repository.github_repo} (
                      {repository.default_branch})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="project-repository-id"
                value={repositoryId}
                onChange={event => setRepositoryId(event.target.value)}
                placeholder="github_multica_ai__multica"
              />
            )}
            {repositoriesQuery.isFetching && (
              <p className="text-xs leading-5 text-text-muted">{t('loadingRepositories')}</p>
            )}
            {!repositoriesQuery.isFetching && repositories.length === 0 && (
              <p className="text-xs leading-5 text-text-muted">
                {t('emptyRepositories')}{' '}
                <Link href="/console/settings?tab=github" className="text-primary hover:underline">
                  {t('connectRepository')}
                </Link>
              </p>
            )}
            {!repositoriesQuery.isFetching &&
              repositories.length > 0 &&
              availableRepositories.length === 0 && (
                <p className="text-xs leading-5 text-text-muted">{t('allRepositoriesBound')}</p>
              )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-repository-role">{t('role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="project-repository-role">
                <SelectValue placeholder={t('role')} />
              </SelectTrigger>
              <SelectContent>
                {['primary', 'dependency', 'docs', 'infra'].map(item => (
                  <SelectItem key={item} value={item}>
                    {t(`roles.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                bindRepository.isPending || allConnectedRepositoriesBound || !repositoryId.trim()
              }
            >
              {bindRepository.isPending ? t('binding') : t('submit')}
            </Button>
          </div>
        </form>
        {message && (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-5 text-text-muted">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectContextReadiness({ context }: { context?: ProjectContextDTO }) {
  const t = useT('dashboard.projectDelivery.readiness');
  const readiness = projectContextReadiness(context);
  const contract = projectContextContract(context);
  const missingEvidence = projectContextMissingEvidence(context);
  const repositories = context?.repository_contexts ?? [];
  const unbindRepository = useUnbindProjectRepository(context?.project.id ?? 0);
  const [message, setMessage] = useState('');

  async function handleUnbind(repositoryContext: ProjectRepositoryContextDTO) {
    if (repositoryContext.repository.role === 'primary') {
      setMessage(t('repository.primaryRemoveBlocked'));
      return;
    }
    setMessage('');
    try {
      await unbindRepository.mutateAsync(repositoryContext.repository.repository_id);
      setMessage(t('repository.removed', { repoId: repositoryContext.repository.repository_id }));
    } catch {
      setMessage(t('repository.removeFailed'));
    }
  }

  return (
    <section id="project-context" className="scroll-mt-20">
      <div className="rounded-md border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {t('projectScoped')}
              </Badge>
              <Badge
                variant="outline"
                className={
                  readiness.hasPrimaryRepository
                    ? 'border-success/30 text-success'
                    : 'border-warning/30 text-warning'
                }
              >
                {readiness.hasPrimaryRepository ? t('primaryReady') : t('primaryRequired')}
              </Badge>
            </div>
            <h2 className="mt-3 text-base font-semibold text-text-main">
              {context?.project.name ?? t('projectContext')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{readiness.summary}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <ReadinessMetric label={t('metrics.repos')} value={readiness.activeRepositoryCount} />
            <ReadinessMetric
              label={t('metrics.readOnly')}
              value={readiness.readOnlyRepositoryCount}
            />
            <ReadinessMetric label={t('metrics.skills')} value={readiness.skillCount} />
            <ReadinessMetric label={t('metrics.warnings')} value={readiness.warningCount} />
          </div>
        </div>
        <div className="mt-4 rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm">
          <div className="font-medium text-text-main">{t('nextAction')}</div>
          <div className="mt-1 text-text-muted">{readiness.nextAction}</div>
        </div>
        {contract && (
          <div className="mt-3 grid gap-3 rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="font-medium text-text-main">{t('contract.title')}</div>
              <div className="mt-1 text-text-muted">{contract.version}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="font-medium text-text-main">{t('contract.execution')}</div>
                <div className="mt-1 text-text-muted">
                  {contract.primary_repository_id || t('repository.missing')}
                </div>
              </div>
              <div>
                <div className="font-medium text-text-main">{t('contract.skills')}</div>
                <div className="mt-1 text-text-muted">{contract.skill_names?.length ?? 0}</div>
              </div>
              <div>
                <div className="font-medium text-text-main">{t('contract.missingEvidence')}</div>
                <div className="mt-1 text-text-muted">{missingEvidence.length}</div>
              </div>
            </div>
          </div>
        )}
        {readiness.guardrails.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {readiness.guardrails.map(guardrail => (
              <Badge key={guardrail} variant="outline" className="text-text-muted">
                {guardrail}
              </Badge>
            ))}
          </div>
        )}
        {repositories.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repositories.map(repositoryContext => (
              <ProjectRepositoryCard
                key={repositoryContext.repository.repository_id}
                projectId={context?.project.id ?? 0}
                repositoryContext={repositoryContext}
                t={t}
                onUnbind={() => handleUnbind(repositoryContext)}
                unbinding={unbindRepository.isPending}
              />
            ))}
          </div>
        )}
        {message && (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
            {message}
          </div>
        )}
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-sm font-semibold text-text-main">{value}</div>
      <div className="mt-1 text-text-muted">{label}</div>
    </div>
  );
}

function ProjectRepositoryCard({
  projectId,
  repositoryContext,
  t,
  onUnbind,
  unbinding,
}: {
  projectId: number;
  repositoryContext: ProjectRepositoryContextDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onUnbind: () => void;
  unbinding: boolean;
}) {
  const queryClient = useQueryClient();
  const {
    repository,
    profile,
    architecture_snapshot: architectureSnapshot,
    skills,
    warnings,
  } = repositoryContext;
  const reindexArchitecture = useReindexRepoArchitecture(repository.repository_id);
  const repoWarnings = [
    ...(warnings ?? []),
    ...(repositoryContext.architecture_warnings ?? []),
    ...(profile?.warnings ?? []),
  ];
  const [message, setMessage] = useState('');

  async function handleAnalyzeArchitecture() {
    setMessage('');
    try {
      await reindexArchitecture.mutateAsync({
        default_branch: profile?.default_branch,
      });
      queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      setMessage('Architecture analysis refreshed.');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Architecture analysis failed: ${error.message}`
          : 'Architecture analysis failed.'
      );
    }
  }

  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">
            {repository.repository_id}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {profile?.summary ?? t('repository.noProfile')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t(`roles.${repository.role}`)}</Badge>
          <Badge variant="outline">
            {repository.active ? t('repository.active') : t('repository.inactive')}
          </Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(profile?.stack ?? []).slice(0, 5).map(stack => (
          <Badge key={stack} variant="outline" className="text-text-muted">
            {stack}
          </Badge>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
        <div>{t('repository.testCommands', { count: profile?.test_commands?.length ?? 0 })}</div>
        <div>{t('repository.skills', { count: skills?.length ?? 0 })}</div>
        <div>{t('repository.modules', { count: architectureSnapshot?.modules.length ?? 0 })}</div>
        <div>
          {t('repository.ciWorkflows', { count: architectureSnapshot?.ci_workflows.length ?? 0 })}
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-text-main">{t('repository.architecture')}</span>
          <Badge
            variant="outline"
            className={
              architectureSnapshot && !repositoryContext.architecture_stale
                ? 'border-success/30 text-success'
                : 'border-warning/30 text-warning'
            }
          >
            {architectureSnapshot
              ? repositoryContext.architecture_stale
                ? t('repository.stale')
                : t('repository.fresh')
              : t('repository.missing')}
          </Badge>
        </div>
        <div className="mt-1 truncate">
          {architectureSnapshot?.commit_sha || t('repository.generateSnapshot')}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={reindexArchitecture.isPending}
            onClick={handleAnalyzeArchitecture}
          >
            {reindexArchitecture.isPending ? 'Analyzing' : 'Analyze architecture'}
            <RefreshCw className="ml-1.5 h-3.5 w-3.5" />
          </Button>
          {repository.role !== 'primary' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-text-muted hover:text-text-main"
              disabled={unbinding}
              onClick={onUnbind}
            >
              {unbinding ? t('repository.removing') : t('repository.remove')}
            </Button>
          ) : null}
        </div>
      </div>
      {repoWarnings.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
          {repoWarnings[0]}
        </div>
      )}
      {message && (
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
          {message}
        </div>
      )}
    </div>
  );
}
