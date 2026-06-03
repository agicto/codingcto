'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import {
  useCodingCTORuntimes,
  useCodingCTOSkills,
  useGitHubRepositories,
  useUpsertCodingCTOSkill,
} from '@/features/codingcto/hooks/use-codingcto';
import {
  useCreateDirectAgentTask,
  useDirectAgentTasks,
  useDirectTaskEvents,
} from '@/features/specforge/hooks/use-specforge';
import { summarizeTaskEvents } from '@/features/specforge/task-event-summary';
import type {
  CodingCTORuntimeDTO,
  CodingCTOSkillDTO,
} from '@/features/codingcto/services/codingcto-service';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
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

function safeConsoleReturnHref(value: string | null) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed.startsWith('/console/')) {
    return undefined;
  }
  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return undefined;
  }
  return trimmed;
}

export function AgentsConsole({ selectedAgentId }: AgentsConsoleProps) {
  const t = useT('dashboard.agents');
  const searchParams = useSearchParams();
  const returnHref = safeConsoleReturnHref(searchParams.get('return_to')) ?? ROUTES.CONSOLE.SPECFORGE;
  const initialRepositoryId = searchParams.get('repository_id')?.trim() ?? '';
  const { selectedWorkspaceId } = useSelectedWorkspace();
  const runtimesQuery = useCodingCTORuntimes({ status: 'online', limit: 50 });
  const runtimes = useMemo(
    () => runtimesQuery.data?.runtimes ?? [],
    [runtimesQuery.data?.runtimes]
  );
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const localAgents = useMemo(
    () => localAgentsFromRuntimes(runtimes, runtimeNow),
    [runtimes, runtimeNow]
  );
  const onlineRuntimeCount = useMemo(
    () => runtimes.filter(runtime => isFreshOnlineRuntime(runtime, runtimeNow)).length,
    [runtimes, runtimeNow]
  );
  const availableCliCount = useMemo(
    () => localAgents.length,
    [localAgents]
  );
  const repositoriesQuery = useGitHubRepositories(
    selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : undefined
  );
  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const [selectedRepoId, setSelectedRepoId] = useState(initialRepositoryId);
  const effectiveSelectedRepoId =
    selectedRepoId && repositories.some(repository => repository.repository_id === selectedRepoId)
      ? selectedRepoId
      : repositories[0]?.repository_id ?? '';
  const skillsQuery = useCodingCTOSkills(effectiveSelectedRepoId);
  const upsertSkill = useUpsertCodingCTOSkill(effectiveSelectedRepoId);
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
      localAgents.find(agent => agent.id === selectedAgentId) ??
      localAgents.find(agent => agent.id === decodeURIComponent(selectedAgentId ?? '')) ??
      localAgents.find(agent => agent.runtimeId === decodeURIComponent(selectedAgentId ?? '')) ??
      localAgents[0],
    [localAgents, selectedAgentId]
  );
  const skills = skillsQuery.data?.skills ?? [];
  const assignedSkills = selectedAgent
    ? skills.filter(skill => skillAssignedToAgent(skill, selectedAgent.skillTarget))
    : [];
  const isLoading = runtimesQuery.isLoading || repositoriesQuery.isLoading;

  async function setSkillAssigned(skill: CodingCTOSkillDTO, assigned: boolean) {
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
                {t('onlineCount', { count: availableCliCount })}
              </Badge>
              <Badge variant="outline" className="hidden text-text-muted sm:inline-flex">
                {t('cliCount', { count: onlineRuntimeCount })}
              </Badge>
            </div>
            <p className="hidden truncate text-xs text-text-muted md:block">{t('description')}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={returnHref}
            className="focus-ring inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-xs font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle hover:text-primary"
          >
            <ClipboardList className="h-4 w-4" />
            <span>{t('actions.openBoard')}</span>
          </Link>
          <Link
            href={ROUTES.CONSOLE.SKILLS}
            className="focus-ring inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-xs font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle hover:text-primary"
          >
            <BookOpen className="h-4 w-4" />
            <span>{t('actions.manageSkills')}</span>
          </Link>
        </div>
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
            ) : localAgents.length > 0 ? (
              <div className="divide-y divide-border-subtle">
                {localAgents.map(runtime => (
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
                returnHref={returnHref}
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
  returnHref,
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
  returnHref: string;
  skills: CodingCTOSkillDTO[];
  assignedSkillCount: number;
  skillsLoading: boolean;
  saving: boolean;
  onRepositoryChange: (value: string) => void;
  onSetSkillAssigned: (skill: CodingCTOSkillDTO, assigned: boolean) => void;
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

      <Tabs
        key={runtime.id}
        defaultValue="activity"
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b border-border-subtle px-5 py-3">
          <TabsList className="bg-transparent p-0">
            <TabsTrigger value="activity" className="rounded-none border-0 shadow-none">
              <Activity className="h-4 w-4" />
              {t('tabs.activity')}
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
          <AgentOperationsPanel
            selectedRepository={selectedRepository}
            runtime={runtime}
            assignedSkillCount={assignedSkillCount}
            returnHref={returnHref}
            t={t}
          />
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

function AgentOperationsPanel({
  selectedRepository,
  runtime,
  assignedSkillCount,
  returnHref,
  t,
}: {
  selectedRepository?: {
    repository_id: string;
    github_owner?: string;
    github_repo?: string;
    full_name?: string;
  };
  runtime: LocalRuntime;
  assignedSkillCount: number;
  returnHref: string;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const copy = (
    key: string,
    fallback: string,
    values?: Record<string, string | number | Date>
  ) => {
    const translated = t(key, values);
    return translated.startsWith('dashboard.agents.') ? fallback : translated;
  };
  const repositoryLabel = selectedRepository
    ? selectedRepository.full_name ||
      `${selectedRepository.github_owner ?? ''}/${selectedRepository.github_repo ?? ''}`.replace(
        /^\/|\/$/g,
        ''
      ) ||
      selectedRepository.repository_id
    : copy('operations.unboundRepository', '未绑定仓库');
  const canDispatch = runtime.dispatchableCapabilityCount > 0 && Boolean(selectedRepository);
  const deliveryHref = returnHref;
  const intakeHref = `${ROUTES.CONSOLE.SPECFORGE}?board=intake&new=requirement`;
  const reviewHref = `${ROUTES.CONSOLE.SPECFORGE}?board=review`;
  const bindingHref = selectedRepository
    ? ROUTES.CONSOLE.SKILLS
    : `${ROUTES.CONSOLE.SETTINGS}?tab=repositories`;
  const createSmokeTask = useCreateDirectAgentTask();
  const directTasksQuery = useDirectAgentTasks(
    selectedRepository
      ? {
          repository_id: selectedRepository.repository_id,
          executor: runtime.executor,
          runtime_id: runtime.runtimeId,
          limit: 3,
        }
      : undefined,
    {
      enabled: Boolean(selectedRepository),
      refetchInterval: 3000,
    }
  );
  const directTasks = directTasksQuery.data?.tasks ?? [];
  const latestSmokeTask = directTasks[0];
  const directTaskEventsQuery = useDirectTaskEvents(latestSmokeTask?.id, undefined, {
    enabled: Boolean(latestSmokeTask?.id),
    refetchInterval:
      latestSmokeTask &&
      ['dispatched', 'running', 'queued'].includes(latestSmokeTask.status)
        ? 3000
        : false,
  });
  const directTaskEvents = directTaskEventsQuery.data?.events ?? [];
  const smokeEventSummary = summarizeTaskEvents(directTaskEvents);

  async function runSmokeTest() {
    if (!selectedRepository) {
      return;
    }
    await createSmokeTask.mutateAsync({
      repository_id: selectedRepository.repository_id,
      executor: runtime.executor,
      runtime_id: runtime.runtimeId,
      title: 'CodingCTO Codex smoke test',
      prompt: [
        'Run a read-only CodingCTO smoke test for this local runtime.',
        'Do not modify files. Do not commit. Do not create a branch. Do not open a PR.',
        'Inspect only enough to report the current working directory, repository identity if available, and whether the Codex CLI task execution path is working.',
        'Return a concise result with: status, runtime_check, repository_check, and any blocker.',
      ].join('\n'),
    });
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-main">
              {copy('operations.boundaryTitle', '智能体职责边界')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {copy(
                'operations.boundaryDescription',
                '这里管理执行能力、健康状态和 Skill 绑定；需求、Prompt、队列和 PR 交付在看板里调度。'
              )}
            </p>
          </div>
          <Badge
            variant="outline"
            className={canDispatch ? 'text-success' : 'text-warning'}
          >
            {canDispatch
              ? copy('operations.dispatchable', '可被看板调度')
              : copy('operations.needsBinding', '需要绑定')}
          </Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <InfoBlock label={copy('operations.repository', '绑定仓库')} value={repositoryLabel} />
          <InfoBlock label={copy('operations.runtime', '运行时')} value={runtime.runtimeId} />
          <InfoBlock
            label={copy('operations.dispatchCapability', '调度能力')}
            value={
              runtime.dispatchableCapabilityCount > 0
                ? copy('operations.codexExecutable', 'Codex 可执行')
                : copy('operations.detectOnly', '仅检测')
            }
          />
        </div>
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-main">Codex 调度 Smoke Test</h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              创建一个只读 direct task，验证平台能否让这个 runtime 领取任务并启动 Codex；不会修改文件、提交或创建 PR。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={!canDispatch || createSmokeTask.isPending}
            onClick={runSmokeTest}
          >
            {createSmokeTask.isPending ? '创建中' : '运行只读测试'}
            <Terminal className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          <InfoBlock label="目标 runtime" value={runtime.runtimeId} />
          <InfoBlock label="目标仓库" value={repositoryLabel} />
          <InfoBlock
            label="最近任务"
            value={latestSmokeTask ? `#${latestSmokeTask.id}` : '暂无'}
          />
          <InfoBlock label="状态" value={latestSmokeTask?.status || '未创建'} />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <InfoBlock
            label="Runtime claim"
            value={smokeEventSummary.hasRuntimeClaim ? '有' : '无'}
          />
          <InfoBlock
            label="执行结果"
            value={smokeEventSummary.hasExecutorResult ? '有' : '无'}
          />
          <InfoBlock label="输出事件" value={String(smokeEventSummary.outputEventCount)} />
          <InfoBlock label="最后事件" value={smokeEventSummary.lastEventLabel} />
        </div>
        {latestSmokeTask ? (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-text-main">{latestSmokeTask.title}</div>
              <Badge
                variant="outline"
                className={
                  smokeEventSummary.hasExecutorResult
                    ? 'text-success'
                    : directTaskEvents.length
                      ? 'text-info'
                      : ''
                }
              >
                {smokeEventSummary.proofLabel}
              </Badge>
            </div>
            {latestSmokeTask.runtime_id ? <div>Runtime: {latestSmokeTask.runtime_id}</div> : null}
            {latestSmokeTask.started_at ? <div>Started: {latestSmokeTask.started_at}</div> : null}
            {latestSmokeTask.finished_at ? <div>Finished: {latestSmokeTask.finished_at}</div> : null}
            {latestSmokeTask.output_log ? (
              <div className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap">
                {latestSmokeTask.output_log}
              </div>
            ) : null}
            {latestSmokeTask.failure_reason ? (
              <div className="mt-2 text-warning">{latestSmokeTask.failure_reason}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <ReadinessBlock
          state={selectedRepository ? 'ready' : 'blocked'}
          title={copy('operations.readiness.repository.title', '仓库绑定')}
          description={
            selectedRepository
              ? copy(
                  'operations.readiness.repository.ready',
                  `当前执行器会面向 ${repositoryLabel} 工作。`,
                  { repository: repositoryLabel }
                )
              : copy(
                  'operations.readiness.repository.blocked',
                  '先在仓库设置里绑定目标仓库，运行时才知道在哪个 checkout 执行。'
                )
          }
        />
        <ReadinessBlock
          state={runtime.dispatchableCapabilityCount > 0 ? 'ready' : 'blocked'}
          title={copy('operations.readiness.dispatch.title', 'Codex 调度')}
          description={
            runtime.dispatchableCapabilityCount > 0
              ? copy(
                  'operations.readiness.dispatch.ready',
                  '该 runtime 已上报 codex，并且可由平台按任务启动。'
                )
              : copy(
                  'operations.readiness.dispatch.blocked',
                  '目前只检测到 CLI，尚不能由交付板派发执行。'
                )
          }
        />
        <ReadinessBlock
          state={assignedSkillCount > 0 ? 'ready' : 'waiting'}
          title={copy('operations.readiness.skills.title', 'Skill 注入')}
          description={
            assignedSkillCount > 0
              ? copy(
                  'operations.readiness.skills.ready',
                  `${assignedSkillCount} 个 Skill 会在 Prompt 编译时进入约束和检查清单。`,
                  { count: assignedSkillCount }
                )
              : copy(
                  'operations.readiness.skills.waiting',
                  '还没有绑定 Skill；可以先跑，但 Prompt 会缺少团队沉淀的约束。'
                )
          }
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <BoardRouteCard
          title={copy('operations.routes.binding.title', '绑定与技能')}
          description={copy(
            'operations.routes.binding.description',
            '仓库、runtime 和 Skill 是执行前置条件；这里负责配置，不负责派发任务。'
          )}
          href={bindingHref}
          badge={
            selectedRepository
              ? copy('operations.routes.binding.skills', '调整 Skill')
              : copy('operations.routes.binding.repository', '先绑仓库')
          }
        />
        <BoardRouteCard
          title={copy('operations.routes.delivery.title', '交付看板')}
          description={copy(
            'operations.routes.delivery.description',
            '从 idea、PRD、PR DAG 到 Codex 执行和 PR 交付的主流程。'
          )}
          href={deliveryHref}
          badge={copy('operations.routes.delivery.badge', '主流程')}
          primary
        />
        <BoardRouteCard
          title={copy('operations.routes.intake.title', '新建需求')}
          description={copy(
            'operations.routes.intake.description',
            '把需求先交给产品、架构、UI/UX、QA 专家生成计划，再决定是否调度。'
          )}
          href={intakeHref}
          badge={copy('operations.routes.intake.badge', '从这里开始')}
        />
        <BoardRouteCard
          title={copy('operations.routes.review.title', '评审队列')}
          description={copy(
            'operations.routes.review.description',
            'CI 失败、review patch、升级摘要和人工决策集中在这里处理。'
          )}
          href={reviewHref}
          badge={copy('operations.routes.review.badge', '失败回收')}
        />
      </div>

      <div className="rounded-lg border border-border-subtle bg-bg-subtle p-4">
        <div className="text-sm font-medium text-text-main">
          {copy('operations.noCommandTitle', '为什么不在这里下命令')}
        </div>
        <div className="mt-3 grid gap-2 text-sm leading-6 text-text-muted">
          <ProcessBoundaryLine
            label={copy('operations.boundaries.agents.label', 'Agents 页')}
            value={copy(
              'operations.boundaries.agents.value',
              '回答“有哪些执行器、是否在线、能不能被调度、绑定了哪些 Skill”。'
            )}
          />
          <ProcessBoundaryLine
            label={copy('operations.boundaries.delivery.label', '交付看板')}
            value={copy(
              'operations.boundaries.delivery.value',
              '回答“要做什么、谁审批、哪个 PR 节点正在跑、测试和 PR 是否通过”。'
            )}
          />
          <ProcessBoundaryLine
            label={copy('operations.boundaries.review.label', '评审看板')}
            value={copy(
              'operations.boundaries.review.value',
              '回答“哪里失败、谁要决策、是否需要 fix/review_patch、还能自动重试几次”。'
            )}
          />
        </div>
      </div>
    </div>
  );
}

function ReadinessBlock({
  state,
  title,
  description,
}: {
  state: 'ready' | 'waiting' | 'blocked';
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
            state === 'ready' && 'border-success bg-success/10 text-success',
            state === 'waiting' && 'border-warning bg-warning/10 text-warning',
            state === 'blocked' && 'border-warning bg-warning/10 text-warning'
          )}
        >
          {state === 'ready' ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Circle className="h-2.5 w-2.5 fill-current" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-main">{title}</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}

function BoardRouteCard({
  title,
  description,
  href,
  badge,
  primary = false,
}: {
  title: string;
  description: string;
  href: string;
  badge: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'rounded-lg border border-border-subtle bg-bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-bg-subtle',
        primary && 'border-primary/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <ClipboardList className="h-5 w-5 shrink-0 text-primary" />
        <Badge variant="outline" className={primary ? 'text-primary' : 'text-text-muted'}>
          {badge}
        </Badge>
      </div>
      <div className="mt-3 text-sm font-medium text-text-main">{title}</div>
      <p className="mt-2 text-xs leading-5 text-text-muted">{description}</p>
      <div className="mt-3 flex items-center gap-1 text-xs font-medium text-primary">
        打开
        <ExternalLink className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function ProcessBoundaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md bg-bg-surface px-3 py-2 sm:grid-cols-[96px_minmax(0,1fr)]">
      <span className="font-medium text-text-main">{label}</span>
      <span>{value}</span>
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

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle px-4 py-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 truncate text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function skillAssignedToAgent(skill: CodingCTOSkillDTO, agentId: string) {
  const targets = skill.target_agents ?? [];
  return targets.some(target => {
    const normalized = target.trim().toLowerCase();
    return normalized === agentId || ALL_AGENT_TARGETS.has(normalized);
  });
}

function localAgentsFromRuntimes(runtimes: CodingCTORuntimeDTO[], now: number): LocalRuntime[] {
  return runtimes
    .filter(runtime => isFreshOnlineRuntime(runtime, now))
    .flatMap(runtime => {
      const capabilities = runtimeCapabilities(runtime);
      return capabilities.map(capability => {
        const agentId = `${runtime.runtime_id}:${capability.id}`;
        const hostname = runtime.hostname || runtime.runtime_id;
        return {
          id: agentId,
          label: agentLabel(capability, runtime),
          description: `${capability.command} · ${hostname} · ${runtime.runtime_id}`,
          runtimeId: runtime.runtime_id,
          hostname,
          executor: capability.dispatchable ? runtime.executor || 'codex_cli' : capability.id,
          skillTarget: capability.id,
          capabilities: [capability],
          dispatchableCapabilityCount: capability.dispatchable ? 1 : 0,
          status: runtime.status,
          version: capability.version || runtime.version,
          lastSeenAt: runtime.last_seen_at,
        };
      });
    })
    .sort((a, b) => {
      if (a.dispatchableCapabilityCount !== b.dispatchableCapabilityCount) {
        return b.dispatchableCapabilityCount - a.dispatchableCapabilityCount;
      }
      const aSeen = new Date(a.lastSeenAt ?? '').getTime();
      const bSeen = new Date(b.lastSeenAt ?? '').getTime();
      if (Number.isFinite(aSeen) && Number.isFinite(bSeen) && aSeen !== bSeen) {
        return bSeen - aSeen;
      }
      return a.label.localeCompare(b.label);
    });
}

function runtimeCapabilities(runtime: CodingCTORuntimeDTO): RuntimeCapability[] {
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

function runtimeCanDispatchCLI(runtime: CodingCTORuntimeDTO, command: string) {
  return runtime.executor === 'codex_cli' && command === 'codex';
}

function agentLabel(capability: RuntimeCapability, runtime: CodingCTORuntimeDTO) {
  if (capability.dispatchable && runtime.executor === 'codex_cli') {
    return 'Coding Agent';
  }
  return capability.label;
}

function isFreshOnlineRuntime(runtime: CodingCTORuntimeDTO, now: number) {
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
