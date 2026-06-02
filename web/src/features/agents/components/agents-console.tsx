'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  BookOpen,
  Bot,
  Check,
  Circle,
  ClipboardList,
  Copy,
  ExternalLink,
  KeyRound,
  type LucideIcon,
  Server,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROUTES, buildRoute } from '@/constants/routes';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  useGitHubRepositories,
  useSpecForgeRuntimes,
  useSpecForgeSkills,
  useUpsertSpecForgeSkill,
} from '@/features/specforge/hooks/use-specforge';
import type {
  SpecForgeRuntimeDTO,
  SpecForgeSkillDTO,
} from '@/features/specforge/services/specforge-service';
import { useT } from '@/i18n';
import { cn } from '@/utils';

interface AgentsConsoleProps {
  selectedAgentId?: string;
}

interface RuntimeCapability {
  id: string;
  label: string;
  command: string;
  version?: string;
  dispatchable: boolean;
}

interface LocalRuntime {
  id: string;
  label: string;
  description: string;
  runtimeId: string;
  hostname: string;
  executor: string;
  skillTarget: string;
  capabilities: RuntimeCapability[];
  dispatchableCapabilityCount: number;
  status: string;
  version?: string;
  lastSeenAt?: string;
}

const ALL_AGENT_TARGETS = new Set(['*', 'all']);
const ONLINE_RUNTIME_STALE_MS = 5 * 60 * 1000;

export function AgentsConsole({ selectedAgentId }: AgentsConsoleProps) {
  const t = useT('dashboard.agents');
  const { selectedWorkspaceId } = useSelectedWorkspace();
  const runtimesQuery = useSpecForgeRuntimes({ status: 'online', limit: 50 });
  const runtimes = useMemo(
    () => runtimesQuery.data?.runtimes ?? [],
    [runtimesQuery.data?.runtimes]
  );
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const localRuntimes = useMemo(
    () => localRuntimesFromRuntimes(runtimes, runtimeNow),
    [runtimes, runtimeNow]
  );
  const availableCliCount = useMemo(
    () => localRuntimes.reduce((count, runtime) => count + runtime.capabilities.length, 0),
    [localRuntimes]
  );
  const repositoriesQuery = useGitHubRepositories(
    selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : undefined
  );
  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const effectiveSelectedRepoId =
    selectedRepoId && repositories.some(repository => repository.repository_id === selectedRepoId)
      ? selectedRepoId
      : repositories[0]?.repository_id ?? '';
  const skillsQuery = useSpecForgeSkills(effectiveSelectedRepoId);
  const upsertSkill = useUpsertSpecForgeSkill(effectiveSelectedRepoId);
  const [setupCommand, setSetupCommand] = useState('');
  const [setupCommandCopied, setSetupCommandCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const query = effectiveSelectedRepoId
      ? `?repository_id=${encodeURIComponent(effectiveSelectedRepoId)}`
      : '';
    fetch(`/api/runtime/setup${query}`)
      .then(response => (response.ok ? response.json() : null))
      .then((payload: { command?: string } | null) => {
        if (!cancelled) {
          setSetupCommand(payload?.command ?? '');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSetupCommand('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedRepoId]);
  const selectedAgent = useMemo(
    () =>
      localRuntimes.find(runtime => runtime.id === selectedAgentId) ??
      localRuntimes.find(runtime => runtime.id === decodeURIComponent(selectedAgentId ?? '')) ??
      localRuntimes[0],
    [localRuntimes, selectedAgentId]
  );
  const skills = skillsQuery.data?.skills ?? [];
  const assignedSkills = selectedAgent
    ? skills.filter(skill => skillAssignedToAgent(skill, selectedAgent.skillTarget))
    : [];
  const isLoading = runtimesQuery.isLoading || repositoriesQuery.isLoading;

  async function setSkillAssigned(skill: SpecForgeSkillDTO, assigned: boolean) {
    if (!selectedAgent || !effectiveSelectedRepoId) {
      return;
    }
    const currentTargets = (skill.target_agents ?? []).filter(Boolean);
    const currentWithoutAll = currentTargets.filter(
      target => !ALL_AGENT_TARGETS.has(target.trim().toLowerCase())
    );
    const nextTargets = assigned
      ? Array.from(new Set([...currentWithoutAll, selectedAgent.skillTarget]))
      : currentWithoutAll.filter(target => target !== selectedAgent.skillTarget);

    await upsertSkill.mutateAsync({
      name: skill.name,
      description: skill.description ?? '',
      content: skill.content ?? '',
      active: skill.active,
      target_agents: nextTargets,
    });
  }

  async function copySetupCommand() {
    if (!setupCommand) {
      return;
    }
    await navigator.clipboard.writeText(setupCommand);
    setSetupCommandCopied(true);
    window.setTimeout(() => setSetupCommandCopied(false), 1600);
  }

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Bot className="h-5 w-5 shrink-0 text-text-subtle" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-text-main">{t('title')}</h1>
              <Badge variant="outline" className="hidden text-text-muted sm:inline-flex">
                {t('onlineCount', { count: localRuntimes.length })}
              </Badge>
              <Badge variant="outline" className="hidden text-text-muted sm:inline-flex">
                {t('cliCount', { count: availableCliCount })}
              </Badge>
            </div>
            <p className="hidden truncate text-xs text-text-muted md:block">{t('description')}</p>
          </div>
        </div>
        <Link
          href={ROUTES.CONSOLE.SKILLS}
          className="focus-ring inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-xs font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle hover:text-primary"
        >
          <BookOpen className="h-4 w-4" />
          <span>{t('actions.manageSkills')}</span>
        </Link>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto grid w-full max-w-7xl gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            <div className="border-b border-border-subtle px-4 py-3">
              <div className="text-sm font-medium text-text-main">{t('list.title')}</div>
              <p className="mt-1 text-xs leading-5 text-text-muted">{t('list.description')}</p>
            </div>
            {isLoading ? (
              <div className="p-4 text-sm text-text-muted">{t('states.loading')}</div>
            ) : localRuntimes.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {localRuntimes.map(runtime => (
                  <Link
                    key={runtime.id}
                    href={buildRoute(ROUTES.CONSOLE.AGENT, { agentId: encodeURIComponent(runtime.id) })}
                    className={cn(
                      'flex items-start gap-3 px-4 py-4 hover:bg-bg-subtle',
                      selectedAgent?.id === runtime.id && 'bg-bg-subtle'
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-muted">
                      <Terminal className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-medium text-text-main">{runtime.label}</span>
                        <Circle className="h-2 w-2 shrink-0 fill-success text-success" />
                      </span>
                      <span className="mt-1 block truncate text-sm text-text-muted">
                        {runtime.description}
                      </span>
                      <span className="mt-2 flex flex-wrap gap-1.5">
                        {runtime.capabilities.map(capability => (
                          <Badge
                            key={capability.id}
                            variant="outline"
                            className={cn(
                              'max-w-full',
                              capability.dispatchable ? 'text-success' : 'text-text-muted'
                            )}
                          >
                            <span className="truncate">
                              {capability.label}
                              {capability.dispatchable ? ` · ${t('status.dispatchReady')}` : ''}
                            </span>
                          </Badge>
                        ))}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm leading-6 text-text-muted">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-bg-subtle">
                  <Server className="h-5 w-5" />
                </div>
                <h2 className="mt-4 font-medium text-text-main">{t('empty.title')}</h2>
                <p className="mt-1">{t('empty.description')}</p>
              </div>
            )}
          </section>

          <section className="min-h-[620px] overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
            {selectedAgent ? (
              <AgentDetail
                runtime={selectedAgent}
                repositories={repositories}
                selectedRepoId={effectiveSelectedRepoId}
                skills={skills}
                assignedSkillCount={assignedSkills.length}
                skillsLoading={skillsQuery.isLoading}
                saving={upsertSkill.isPending}
                onRepositoryChange={setSelectedRepoId}
                onSetSkillAssigned={setSkillAssigned}
                t={t}
              />
            ) : (
              <RuntimeSetupPanel
                command={setupCommand}
                copied={setupCommandCopied}
                isLoading={isLoading}
                hasRepository={Boolean(effectiveSelectedRepoId)}
                onCopy={copySetupCommand}
                t={t}
              />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function RuntimeSetupPanel({
  command,
  copied,
  isLoading,
  hasRepository,
  onCopy,
  t,
}: {
  command: string;
  copied: boolean;
  isLoading: boolean;
  hasRepository: boolean;
  onCopy: () => void;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  if (isLoading) {
    return (
      <div className="flex h-full min-h-[620px] items-center justify-center p-6 text-center text-sm text-text-muted">
        {t('states.loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[620px] flex-col p-6">
      <div className="max-w-3xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg-subtle text-text-muted">
          <Server className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text-main">{t('setup.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">{t('setup.description')}</p>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-border-subtle">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
          <div>
            <div className="text-sm font-medium text-text-main">{t('setup.commandTitle')}</div>
            <p className="mt-1 text-xs text-text-muted">{t('setup.commandDescription')}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!command || !hasRepository}
            onClick={onCopy}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('setup.copied') : t('setup.copy')}
          </Button>
        </div>
        <pre className="min-h-40 overflow-x-auto bg-bg-surface p-4 text-xs leading-6 text-text-main">
          {hasRepository
            ? redactRuntimeToken(command) || t('setup.commandLoading')
            : t('setup.noRepositoryCommand')}
        </pre>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoBlock label={t('setup.steps.start.label')} value={t('setup.steps.start.value')} />
        <InfoBlock label={t('setup.steps.detect.label')} value={t('setup.steps.detect.value')} />
        <InfoBlock label={t('setup.steps.claim.label')} value={t('setup.steps.claim.value')} />
      </div>
    </div>
  );
}

function AgentDetail({
  runtime,
  repositories,
  selectedRepoId,
  skills,
  assignedSkillCount,
  skillsLoading,
  saving,
  onRepositoryChange,
  onSetSkillAssigned,
  t,
}: {
  runtime: LocalRuntime;
  repositories: Array<{
    repository_id: string;
    github_owner?: string;
    github_repo?: string;
    full_name?: string;
  }>;
  selectedRepoId: string;
  skills: SpecForgeSkillDTO[];
  assignedSkillCount: number;
  skillsLoading: boolean;
  saving: boolean;
  onRepositoryChange: (value: string) => void;
  onSetSkillAssigned: (skill: SpecForgeSkillDTO, assigned: boolean) => void;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const selectedRepository = repositories.find(
    repository => repository.repository_id === selectedRepoId
  );

  return (
    <div className="flex h-full min-h-[620px] flex-col">
      <div className="grid gap-4 border-b border-border-subtle p-5 md:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-text-muted">
            <Bot className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-text-main">{runtime.label}</h2>
              <Badge variant="outline" className="text-success">
                {t('status.online')}
              </Badge>
              <Badge
                variant="outline"
                className={runtime.dispatchableCapabilityCount > 0 ? 'text-success' : 'text-text-muted'}
              >
                {runtime.dispatchableCapabilityCount > 0
                  ? t('status.dispatchReady')
                  : t('status.detectOnly')}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-text-muted">{runtime.description}</p>
            <div className="mt-3 rounded-md border border-info/20 bg-info-subtle px-3 py-2 text-xs leading-5 text-info">
              {t('runtimeHelp')}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-text-muted sm:grid-cols-2">
              <MetaRow icon={Server} label={t('fields.runtime')} value={runtime.runtimeId} />
              <MetaRow icon={Terminal} label={t('fields.executor')} value={runtime.executor} />
              <MetaRow icon={KeyRound} label={t('fields.skills')} value={String(assignedSkillCount)} />
              <MetaRow
                icon={Activity}
                label={t('fields.lastSeen')}
                value={formatRelativeTime(runtime.lastSeenAt, t)}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {runtime.capabilities.map(capability => (
                <div
                  key={capability.id}
                  className="rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-main">
                      {capability.label}
                    </span>
                    <Badge
                      variant="outline"
                      className={capability.dispatchable ? 'text-success' : 'text-text-muted'}
                    >
                      {capability.dispatchable
                        ? t('status.dispatchReady')
                        : t('status.detectOnly')}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-xs text-text-muted">
                    {capability.command}
                    {capability.version ? ` · ${capability.version}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Link
          href={ROUTES.CONSOLE.SKILLS}
          className="focus-ring inline-flex h-9 shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-sm font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle hover:text-primary"
        >
          <BookOpen className="h-4 w-4" />
          <span>{t('actions.manageSkills')}</span>
          <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
        </Link>
      </div>

      <Tabs defaultValue="skills" className="min-h-0 flex-1 gap-0">
        <div className="border-b border-border-subtle px-5 py-3">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="activity" className="rounded-none border-0 shadow-none">
              <Activity className="h-4 w-4" />
              {t('tabs.activity')}
            </TabsTrigger>
            <TabsTrigger value="tasks" className="rounded-none border-0 shadow-none">
              <ClipboardList className="h-4 w-4" />
              {t('tabs.tasks')}
            </TabsTrigger>
            <TabsTrigger value="skills" className="rounded-none border-0 shadow-none">
              <BookOpen className="h-4 w-4" />
              {t('tabs.skills')}
            </TabsTrigger>
            <TabsTrigger value="environment" className="rounded-none border-0 shadow-none">
              <SlidersHorizontal className="h-4 w-4" />
              {t('tabs.environment')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="activity" className="m-0 p-5">
          <EmptyPanel title={t('activity.title')} description={t('activity.description')} />
        </TabsContent>
        <TabsContent value="tasks" className="m-0 p-5">
          <EmptyPanel title={t('tasks.title')} description={t('tasks.description')} />
        </TabsContent>
        <TabsContent value="skills" className="m-0 min-h-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-main">{t('skills.title')}</h3>
              <p className="mt-1 text-sm text-text-muted">{t('skills.description')}</p>
            </div>
            {repositories.length > 1 ? (
              <Select value={selectedRepoId} onValueChange={onRepositoryChange}>
                <SelectTrigger className="w-full bg-bg-surface sm:w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {repositories.map(repository => (
                    <SelectItem key={repository.repository_id} value={repository.repository_id}>
                      {repository.github_owner}/{repository.github_repo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border-subtle">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-muted">
              <span>
                {selectedRepository
                  ? `${selectedRepository.github_owner}/${selectedRepository.github_repo}`
                  : t('skills.noRepository')}
              </span>
              <span>{t('skills.assignedCount', { count: assignedSkillCount })}</span>
            </div>
            {skillsLoading ? (
              <div className="px-4 py-8 text-sm text-text-muted">{t('states.loading')}</div>
            ) : skills.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {skills.map(skill => {
                  const assigned = skillAssignedToAgent(skill, runtime.skillTarget);
                  return (
                    <div
                      key={skill.id}
                      className="grid gap-4 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-text-main">{skill.name}</span>
                          <Badge
                            variant="outline"
                            className={skill.active ? 'text-success' : 'text-text-muted'}
                          >
                            {skill.active ? t('skills.active') : t('skills.inactive')}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-muted">
                          {skill.description || t('skills.noDescription')}
                        </p>
                      </div>
                      <Label className="flex items-center justify-end gap-3 text-sm text-text-muted">
                        <span>{assigned ? t('skills.assigned') : t('skills.unassigned')}</span>
                        <Switch
                          checked={assigned}
                          disabled={saving}
                          onCheckedChange={checked => onSetSkillAssigned(skill, checked)}
                        />
                      </Label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-sm leading-6 text-text-muted">
                {selectedRepository ? t('skills.empty') : t('skills.noRepositoryHint')}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="environment" className="m-0 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoBlock label={t('fields.hostname')} value={runtime.hostname} />
            <InfoBlock label={t('fields.version')} value={runtime.version || t('states.unknown')} />
            <InfoBlock label={t('fields.runtime')} value={runtime.runtimeId} />
            <InfoBlock label={t('fields.executor')} value={runtime.executor} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="shrink-0">{label}</span>
      <span className="truncate text-text-main">{value}</span>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-border-subtle px-4 py-8">
      <div className="text-sm font-medium text-text-main">{title}</div>
      <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function skillAssignedToAgent(skill: SpecForgeSkillDTO, agentId: string) {
  const targets = skill.target_agents ?? [];
  return targets.some(target => {
    const normalized = target.trim().toLowerCase();
    return normalized === agentId || ALL_AGENT_TARGETS.has(normalized);
  });
}

function localRuntimesFromRuntimes(runtimes: SpecForgeRuntimeDTO[], now: number): LocalRuntime[] {
  return runtimes
    .filter(runtime => isFreshOnlineRuntime(runtime, now))
    .map(runtime => {
      const capabilities = runtimeCapabilities(runtime);
      return {
        id: runtime.runtime_id,
        label: runtimeLabel(runtime),
        description: runtime.hostname || runtime.runtime_id,
        runtimeId: runtime.runtime_id,
        hostname: runtime.hostname || runtime.runtime_id,
        executor: runtime.executor || 'codex_cli',
        skillTarget: runtime.executor || 'codex_cli',
        capabilities,
        dispatchableCapabilityCount: capabilities.filter(capability => capability.dispatchable)
          .length,
        status: runtime.status,
        version: runtime.version,
        lastSeenAt: runtime.last_seen_at,
      };
    })
    .sort((a, b) => {
      if (a.dispatchableCapabilityCount !== b.dispatchableCapabilityCount) {
        return b.dispatchableCapabilityCount - a.dispatchableCapabilityCount;
      }
      return a.label.localeCompare(b.label);
    });
}

function runtimeCapabilities(runtime: SpecForgeRuntimeDTO): RuntimeCapability[] {
  const availableCLIs = (runtime.available_clis ?? []).filter(cli => cli.available);
  if (availableCLIs.length === 0) {
    const executor = runtime.executor || 'codex_cli';
    return [
      {
        id: normalizeAgentId(executor),
        label: displayAgentName(executor),
        command: executor,
        version: runtime.version,
        dispatchable: false,
      },
    ];
  }

  return availableCLIs.map(cli => {
    const command = cli.command || cli.name;
    return {
      id: normalizeAgentId(command || cli.name),
      label: displayAgentName(cli.name || command),
      command,
      version: cli.version,
      dispatchable: runtimeCanDispatchCLI(runtime, command),
    };
  });
}

function runtimeCanDispatchCLI(runtime: SpecForgeRuntimeDTO, command: string) {
  return runtime.executor === 'codex_cli' && command === 'codex';
}

function runtimeLabel(runtime: SpecForgeRuntimeDTO) {
  if (runtime.executor === 'codex_cli') {
    return 'Codex CLI';
  }
  return `${displayAgentName(runtime.executor || runtime.runtime_id)} Runtime`;
}

function isFreshOnlineRuntime(runtime: SpecForgeRuntimeDTO, now: number) {
  if (runtime.status !== 'online') {
    return false;
  }
  const lastSeen = new Date(runtime.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) {
    return false;
  }
  return now - lastSeen <= ONLINE_RUNTIME_STALE_MS;
}

function normalizeAgentId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    codex: 'codex_cli',
    codex_cli: 'codex_cli',
    openai_codex: 'codex_cli',
    claude_code: 'claude',
    claude: 'claude',
    cursor: 'cursor',
    cursor_agent: 'cursor_agent',
    hermes: 'hermes',
    opencode: 'opencode',
  };
  return aliases[normalized] ?? normalized;
}

function displayAgentName(value: string) {
  const normalized = normalizeAgentId(value);
  const labels: Record<string, string> = {
    codex_cli: 'Codex',
    claude: 'Claude',
    cursor_agent: 'Cursor Agent',
    cursor: 'Cursor',
    hermes: 'Hermes',
    opencode: 'OpenCode',
  };
  return labels[normalized] ?? value.replace(/[_-]+/g, ' ');
}

function formatRelativeTime(value: string | undefined, t: ReturnType<typeof useT<'dashboard.agents'>>) {
  if (!value) {
    return t('states.unknown');
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return t('states.unknown');
  }
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) {
    return t('time.justNow');
  }
  if (diffMinutes < 60) {
    return t('time.minutesAgo', { count: diffMinutes });
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return t('time.hoursAgo', { count: diffHours });
  }
  return t('time.daysAgo', { count: Math.round(diffHours / 24) });
}

function redactRuntimeToken(command: string) {
  return command.replace(
    /CODINGCTO_RUNTIME_TOKEN='[^']+'/,
    "CODINGCTO_RUNTIME_TOKEN='<copied-token>'"
  );
}
