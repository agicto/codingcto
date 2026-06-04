'use client';

import { useState } from 'react';
import { GitBranch, GitPullRequest, Info, ListChecks } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/utils';
import {
  useGitHubWebhookEvents,
  useInferRepoProfile,
  useRepoArchitectureStatus,
  useReindexRepoArchitecture,
  useRepoProfile,
  useSpecForgeProjectSkills,
  useSpecForgeSkills,
  useUpsertRepoProfile,
  useUpsertSpecForgeProjectSkill,
  useUpsertSpecForgeSkill,
} from '@/features/specforge/hooks/use-specforge';
import {
  profileListValue,
  repoProfileFromDTO,
  repoProfilePayloadFromForm,
} from '@/features/specforge/repo-profile-form';
import { githubTreeProfileInferencePayload } from '@/features/specforge/repo-profile-inference';
import {
  sortWebhookEvents,
  webhookEventDetails,
  webhookEventLabel,
  webhookEventRepo,
  webhookEventRisk,
} from '@/features/specforge/webhook-events';
import {
  formatTimestamp,
  repoProfileSourceLabel,
  statusClassName,
} from '@/features/specforge/components/workbench-utils';
import {
  specForgeSkillTemplates,
  type SpecForgeSkillTemplate,
} from '@/features/specforge/skill-templates';
import type {
  GitHubWebhookEventDTO,
  SpecForgeRepoArchitectureStatusDTO,
  SpecForgeRepoProfileDTO,
  SpecForgeSkillDTO,
} from '@/features/specforge/services/specforge-service';
import type { RepoProfile } from '@/features/specforge/types';

export function RepoContextPanel({
  repoId,
  repoProfile,
  planSource,
  projectId,
  onProfileSaved,
}: {
  repoId: string;
  repoProfile: RepoProfile;
  planSource: 'api' | 'demo' | 'empty';
  projectId?: number;
  onProfileSaved: (profile: RepoProfile) => void;
}) {
  return (
    <div className="space-y-4">
      <RepoProfileSummary
        repoId={repoId}
        repoProfile={repoProfile}
        planSource={planSource}
        onProfileSaved={onProfileSaved}
      />
      <RepoSkillsPanel repoId={repoId} projectId={projectId} />
      <GitHubWebhookEventsPanel />
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
  const [targetAgents, setTargetAgents] = useState<string[]>(['all']);
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
  const skillScopeLabel = projectId ? 'Project skills' : 'Repo skills';
  const skillScopeDescription = projectId
    ? 'Store project-level role and delivery instructions; the primary repository remains the execution target.'
    : 'Store repository instructions for planning, prompt compilation, and project skill runs.';

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
        target_agents: targetAgents,
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
      target_agents: targetAgents,
    });
    setSavedSkill(response.skill);
  }

  function applySkillTemplate(template: SpecForgeSkillTemplate) {
    setName(template.name);
    setDescription(template.description);
    setContent(template.content);
    setTargetAgents(template.targetAgents?.length ? template.targetAgents : ['all']);
    setActive(true);
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <ListChecks className="h-4 w-4 text-primary" />
            {skillScopeLabel}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {skillScopeDescription}
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
