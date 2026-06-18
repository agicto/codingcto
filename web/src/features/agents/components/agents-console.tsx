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
  GitPullRequest,
  KeyRound,
  Play,
  RefreshCw,
  Square,
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
import { Textarea } from '@/components/ui/textarea';
import { ROUTES, buildRoute } from '@/constants/routes';
import { useLocale } from '@/hooks/use-locale';
import {
  useCodingCTODirectAgentTask,
  useCodingCTODirectAgentTasks,
  useCodingCTODirectTaskEvents,
  useCodingCTORuntimes,
  useCancelCodingCTODirectAgentTask,
  useCreateCodingCTODirectAgentTask,
} from '@/features/codingcto/hooks/use-codingcto';
import type {
  CodingCTODirectAgentTaskDTO,
  CodingCTODirectTaskEventDTO,
  CodingCTORuntimeDTO,
} from '@/features/codingcto/services/codingcto-service';
import { primaryRepositoryContext } from '@/features/project/project-context';
import { useProject, useProjectContext, useProjects } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { projectPlanHref, projectPRReviewHref } from '@/features/project/project-utils';
import {
  useLatestPlanRun,
  useLatestProjectPlan,
  useSpecForgeProjectSkills,
  useUpsertSpecForgeProjectSkill,
} from '@/features/specforge/hooks/use-specforge';
import { executionRunFromDTO, planBundleFromDTO } from '@/features/specforge/plan-adapter';
import type { SpecForgeSkillDTO } from '@/features/specforge/services/specforge-service';
import type { ExecutionRun, PlanBundle, PRNode } from '@/features/specforge/types';
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
  logo: AgentLogoKey;
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
  logo: AgentLogoKey;
  dispatchableCapabilityCount: number;
  maxConcurrency: number;
  runningCount: number;
  status: string;
  version?: string;
  lastSeenAt?: string;
}

type AgentLogoKey = 'codex' | 'kimi' | 'claude' | 'cursor' | 'opencode' | 'terminal';
type TaskEventLogEntry = CodingCTODirectTaskEventDTO & {
  displayId: string;
};
type AgentRuntimeCopy = ReturnType<typeof agentRuntimeCopy>;

const ALL_AGENT_TARGETS = new Set(['*', 'all']);
const ONLINE_RUNTIME_STALE_MS = 5 * 60 * 1000;

export function AgentsConsole({ selectedAgentId }: AgentsConsoleProps) {
  const t = useT('dashboard.agents');
  const searchParams = useSearchParams();
  const projectIdFromSearch = useMemo(() => {
    const parsed = Number(searchParams.get('projectId') ?? '');
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }, [searchParams]);
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
  const projectsQuery = useProjects(selectedWorkspaceId ?? '');
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects]
  );
  const projectFromSearchQuery = useProject(projectIdFromSearch ?? 0);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const effectiveSelectedProjectId = projectIdFromSearch
    ? String(projectIdFromSearch)
    : selectedProjectId;
  const selectedProject = useMemo(
    () =>
      projects.find(project => String(project.id) === effectiveSelectedProjectId) ??
      projects.find(project => project.id === projectIdFromSearch) ??
      projectFromSearchQuery.data?.project ??
      projects.find(project => project.status === 'active') ??
      projects[0],
    [effectiveSelectedProjectId, projectFromSearchQuery.data?.project, projectIdFromSearch, projects]
  );
  const projectContextQuery = useProjectContext(selectedProject?.id ?? 0);
  const projectContext = projectContextQuery.data?.context;
  const primaryRepository = primaryRepositoryContext(projectContext);
  const executionRepositoryId =
    primaryRepository?.repository.repository_id ??
    projectContext?.execution_repository_id ??
    projectContext?.primary_repository_id ??
    '';
  const selectedRepository = executionRepositoryId
    ? {
        repository_id: executionRepositoryId,
        full_name: executionRepositoryId,
      }
    : undefined;
  const skillsQuery = useSpecForgeProjectSkills(selectedProject?.id);
  const upsertSkill = useUpsertSpecForgeProjectSkill(selectedProject?.id);
  const [setupCommand, setSetupCommand] = useState('');
  const [setupCommandCopied, setSetupCommandCopied] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const query = executionRepositoryId
      ? `?repository_id=${encodeURIComponent(executionRepositoryId)}`
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
  }, [executionRepositoryId]);
  const selectedAgent = useMemo(
    () =>
      localAgents.find(agent => agent.id === selectedAgentId) ??
      localAgents.find(agent => agent.id === decodeURIComponent(selectedAgentId ?? '')) ??
      localAgents.find(agent => agent.runtimeId === runtimeIdFromRouteParam(selectedAgentId)) ??
      localAgents[0],
    [localAgents, selectedAgentId]
  );
  const skills = useMemo(
    () =>
      (skillsQuery.data?.project_skills ?? [])
        .map(projectSkill => projectSkill.skill)
        .filter((skill): skill is SpecForgeSkillDTO => Boolean(skill)),
    [skillsQuery.data?.project_skills]
  );
  const assignedSkills = selectedAgent
    ? skills.filter(skill => skillAssignedToAgent(skill, selectedAgent.skillTarget))
    : [];
  const isLoading =
    runtimesQuery.isLoading ||
    projectsQuery.isLoading ||
    projectFromSearchQuery.isLoading ||
    projectContextQuery.isLoading;

  async function setSkillAssigned(skill: SpecForgeSkillDTO, assigned: boolean) {
    if (!selectedAgent || !selectedProject?.id || !executionRepositoryId) {
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
      repository_id: executionRepositoryId,
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
                    <span className="shrink-0">
                      <AgentLogo logo={runtime.logo} label={runtime.label} size="md" />
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
                            <AgentLogo logo={capability.logo} label={capability.label} size="xs" />
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
                key={selectedAgent.id}
                runtime={selectedAgent}
                projects={projects}
                selectedProjectId={String(selectedProject?.id ?? '')}
                selectedProjectName={selectedProject?.name}
                selectedRepository={selectedRepository}
                skills={skills}
                assignedSkillCount={assignedSkills.length}
                skillsLoading={skillsQuery.isLoading}
                saving={upsertSkill.isPending}
                onProjectChange={setSelectedProjectId}
                onSetSkillAssigned={setSkillAssigned}
                t={t}
              />
            ) : (
              <RuntimeSetupPanel
                command={setupCommand}
                copied={setupCommandCopied}
                isLoading={isLoading}
                hasRepository={Boolean(executionRepositoryId)}
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
  projects,
  selectedProjectId,
  selectedProjectName,
  selectedRepository,
  skills,
  assignedSkillCount,
  skillsLoading,
  saving,
  onProjectChange,
  onSetSkillAssigned,
  t,
}: {
  runtime: LocalRuntime;
  projects: Array<{
    id: number;
    name: string;
    status?: string;
  }>;
  selectedProjectId: string;
  selectedProjectName?: string;
  selectedRepository?: {
    repository_id: string;
    github_owner?: string;
    github_repo?: string;
    full_name?: string;
  };
  skills: SpecForgeSkillDTO[];
  assignedSkillCount: number;
  skillsLoading: boolean;
  saving: boolean;
  onProjectChange: (value: string) => void;
  onSetSkillAssigned: (skill: SpecForgeSkillDTO, assigned: boolean) => void;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const { locale } = useLocale();
  const copy = useMemo(() => agentRuntimeCopy(locale), [locale]);
  const [directPrompt, setDirectPrompt] = useState('');
  const [selectedDirectTaskId, setSelectedDirectTaskId] = useState<number | undefined>();
  const selectedProjectNumber = Number(selectedProjectId);
  const selectedProjectIdNumber = Number.isFinite(selectedProjectNumber) && selectedProjectNumber > 0
    ? selectedProjectNumber
    : undefined;
  const latestPlanQuery = useLatestProjectPlan(selectedProjectIdNumber);
  const latestPlan = useMemo<PlanBundle | undefined>(
    () => (latestPlanQuery.data ? planBundleFromDTO(latestPlanQuery.data) : undefined),
    [latestPlanQuery.data]
  );
  const latestPlanRunQuery = useLatestPlanRun(latestPlan?.planId, {
    enabled: Boolean(latestPlan?.planId),
    refetchInterval: latestPlan?.implementationPlan.status === 'approved' ? 3000 : false,
  });
  const latestExecutionRun = useMemo<ExecutionRun | undefined>(() => {
    if (!latestPlanRunQuery.data) {
      return undefined;
    }
    return executionRunFromDTO(latestPlanRunQuery.data, latestPlan).run;
  }, [latestPlan, latestPlanRunQuery.data]);
  const runtimeExecutionTasks = useMemo(
    () => executionTasksForRuntime(latestExecutionRun, runtime),
    [latestExecutionRun, runtime]
  );
  const directTasksQuery = useCodingCTODirectAgentTasks({
    limit: 8,
    repository_id: selectedRepository?.repository_id,
    executor: runtime.executor,
    runtime_id: runtime.runtimeId,
  });
  const createDirectTask = useCreateCodingCTODirectAgentTask();
  const recentDirectTasks = directTasksQuery.data?.tasks ?? [];
  const selectedDirectTask =
    directTasksQuery.data?.tasks.find(task => task.id === selectedDirectTaskId) ??
    recentDirectTasks[0];
  const liveDirectTaskQuery = useCodingCTODirectAgentTask(selectedDirectTask?.id);
  const liveDirectTask = liveDirectTaskQuery.data ?? selectedDirectTask;
  const directTaskEventsQuery = useCodingCTODirectTaskEvents(liveDirectTask?.id);
  const directEvents = directTaskEventsQuery.data?.events ?? [];
  const cancelDirectTask = useCancelCodingCTODirectAgentTask();
  const activeDirectTask = recentDirectTasks.find(task => !isDirectTaskTerminal(task.status));
  const activityLoading =
    latestPlanQuery.isLoading || latestPlanRunQuery.isLoading || directTasksQuery.isLoading;

  async function submitDirectTask() {
    const prompt = directPrompt.trim();
    if (!prompt || !selectedRepository?.repository_id || runtime.dispatchableCapabilityCount === 0) {
      return;
    }
    const task = await createDirectTask.mutateAsync({
      repository_id: selectedRepository.repository_id,
      prompt,
      executor: runtime.executor,
      runtime_id: runtime.runtimeId,
    });
    setSelectedDirectTaskId(task.id);
    setDirectPrompt('');
  }

  async function cancelSelectedDirectTask(taskId: number) {
    const task = await cancelDirectTask.mutateAsync(taskId);
    setSelectedDirectTaskId(task.id);
  }

  return (
    <div className="flex h-full min-h-[620px] flex-col">
      <div className="grid gap-4 border-b border-border-subtle p-5 md:grid-cols-[1fr_auto]">
        <div className="flex min-w-0 gap-4">
          <div className="shrink-0">
            <AgentLogo logo={runtime.logo} label={runtime.label} size="lg" />
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
              <MetaRow icon={BookOpen} label="Project" value={selectedProjectName ?? 'No project'} />
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
                    <span className="flex min-w-0 items-center gap-2">
                      <AgentLogo logo={capability.logo} label={capability.label} size="sm" />
                      <span className="truncate text-sm font-medium text-text-main">
                        {capability.label}
                      </span>
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
        defaultValue={runtime.dispatchableCapabilityCount > 0 ? 'tasks' : 'activity'}
        className="min-h-0 flex-1 gap-0"
      >
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
          <AgentActivityPanel
            runtime={runtime}
            latestPlan={latestPlan}
            latestRun={latestExecutionRun}
            executionTasks={runtimeExecutionTasks}
            activeDirectTask={activeDirectTask}
            isLoading={activityLoading}
            projectId={selectedProjectIdNumber}
            copy={copy}
            t={t}
          />
        </TabsContent>
        <TabsContent value="tasks" className="m-0 p-5">
          <div className="grid gap-4">
            <PlanExecutionTaskPanel
              latestPlan={latestPlan}
              latestRun={latestExecutionRun}
              tasks={runtimeExecutionTasks}
              runtime={runtime}
              isLoading={latestPlanQuery.isLoading || latestPlanRunQuery.isLoading}
              projectId={selectedProjectIdNumber}
              copy={copy}
              t={t}
            />
            <DirectTaskPanel
              prompt={directPrompt}
              onPromptChange={setDirectPrompt}
              selectedRepository={selectedRepository}
              runtime={runtime}
              tasks={recentDirectTasks}
              selectedTask={liveDirectTask}
              selectedTaskId={selectedDirectTaskId}
              events={directEvents}
              isCreating={createDirectTask.isPending}
              isLoading={directTasksQuery.isLoading}
              isRefreshing={liveDirectTaskQuery.isFetching || directTaskEventsQuery.isFetching}
              isCancelling={cancelDirectTask.isPending}
              onSubmit={submitDirectTask}
              onCancel={cancelSelectedDirectTask}
              onSelectTask={setSelectedDirectTaskId}
              t={t}
            />
          </div>
        </TabsContent>
        <TabsContent value="skills" className="m-0 min-h-0 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-text-main">{t('skills.title')}</h3>
              <p className="mt-1 text-sm text-text-muted">{t('skills.description')}</p>
            </div>
            {projects.length > 1 ? (
              <Select value={selectedProjectId} onValueChange={onProjectChange}>
                <SelectTrigger className="w-full bg-bg-surface sm:w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border-subtle">
            <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3 text-xs font-medium uppercase tracking-wide text-text-muted">
              <span>
                {selectedProjectName ?? t('skills.noRepository')}
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

function AgentActivityPanel({
  runtime,
  latestPlan,
  latestRun,
  executionTasks,
  activeDirectTask,
  isLoading,
  projectId,
  copy,
  t,
}: {
  runtime: LocalRuntime;
  latestPlan?: PlanBundle;
  latestRun?: ExecutionRun;
  executionTasks: PRNode[];
  activeDirectTask?: CodingCTODirectAgentTaskDTO;
  isLoading: boolean;
  projectId?: number;
  copy: AgentRuntimeCopy;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const activeExecutionTask = executionTasks.find(isExecutionTaskActive);
  const latestExecutionTask = executionTasks[0];
  const displayedExecutionTask = activeExecutionTask ?? latestExecutionTask;
  const hasVisibleActivity = Boolean(activeExecutionTask || activeDirectTask || latestExecutionTask);
  const planHref =
    projectId && latestPlan?.planId ? projectPlanHref(projectId, latestPlan.planId) : undefined;

  if (isLoading && !hasVisibleActivity) {
    return <EmptyPanel title={t('states.loading')} description={copy.activityLoading} />;
  }

  if (!hasVisibleActivity) {
    return (
      <EmptyPanel
        title={copy.noCurrentTitle}
        description={
          latestRun
            ? copy.noRuntimeTasks(runtime.runtimeId)
            : copy.noRunDescription
        }
      />
    );
  }

  const headline = activeExecutionTask
    ? copy.currentDeliveryTitle
    : activeDirectTask
      ? copy.currentDirectTitle
      : copy.recentDeliveryTitle;
  const description = activeExecutionTask
    ? copy.currentDeliveryDescription(taskDisplayName(activeExecutionTask))
    : activeDirectTask
      ? copy.currentDirectDescription(activeDirectTask.title)
      : copy.recentDeliveryDescription(
          latestExecutionTask ? taskDisplayName(latestExecutionTask) : ''
        );

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-medium text-text-main">{headline}</h3>
              {latestRun?.runId ? (
                <Badge variant="outline" className="text-info">
                  Run #{latestRun.runId}
                </Badge>
              ) : null}
              {latestPlan?.planId ? (
                <Badge variant="outline" className="text-text-muted">
                  Plan #{latestPlan.planId}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
          </div>
          {planHref ? (
            <Link
              href={planHref}
              className="focus-ring inline-flex h-8 shrink-0 items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-xs font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle"
            >
              <GitPullRequest className="h-4 w-4" />
              {copy.openPlan}
            </Link>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <InfoBlock
            label={copy.deliveryTasks}
            value={String(executionTasks.length)}
          />
          <InfoBlock
            label={copy.claimedTasks}
            value={String(executionTasks.filter(task => task.runtimeId === runtime.runtimeId).length)}
          />
          <InfoBlock
            label={copy.currentSlot}
            value={t('tasks.slotUsage', {
              running: runtime.runningCount,
              max: runtime.maxConcurrency,
            })}
          />
        </div>
      </section>

      {displayedExecutionTask ? (
        <ExecutionTaskCard
          task={displayedExecutionTask}
          projectId={projectId}
          copy={copy}
          t={t}
        />
      ) : null}

      {activeDirectTask ? (
        <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-text-main">{activeDirectTask.title}</div>
              <p className="mt-1 truncate text-xs text-text-muted">
                #{activeDirectTask.id} · {activeDirectTask.executor} · {activeDirectTask.runtime_id}
              </p>
            </div>
            <TaskStatusBadge status={activeDirectTask.status} t={t} />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PlanExecutionTaskPanel({
  latestPlan,
  latestRun,
  tasks,
  runtime,
  isLoading,
  projectId,
  copy,
  t,
}: {
  latestPlan?: PlanBundle;
  latestRun?: ExecutionRun;
  tasks: PRNode[];
  runtime: LocalRuntime;
  isLoading: boolean;
  projectId?: number;
  copy: AgentRuntimeCopy;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const planHref =
    projectId && latestPlan?.planId ? projectPlanHref(projectId, latestPlan.planId) : undefined;

  return (
    <section className="overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-medium text-text-main">{copy.deliveryTitle}</h3>
            {latestRun?.runId ? (
              <Badge variant="outline" className="text-info">
                Run #{latestRun.runId}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {copy.deliveryDescription(runtime.runtimeId)}
          </p>
        </div>
        {planHref ? (
          <Link
            href={planHref}
            className="focus-ring inline-flex h-8 shrink-0 items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 text-xs font-medium text-text-main shadow-xs transition-colors hover:bg-bg-subtle"
          >
            <GitPullRequest className="h-4 w-4" />
            {copy.openPlan}
          </Link>
        ) : null}
      </div>

      {isLoading && tasks.length === 0 ? (
        <div className="px-4 py-8 text-sm text-text-muted">{t('states.loading')}</div>
      ) : tasks.length > 0 ? (
        <div className="grid gap-3 p-4">
          {tasks.map(task => (
            <ExecutionTaskCard
              key={`${task.id}-${task.taskId ?? 'node'}`}
              task={task}
              projectId={projectId}
              copy={copy}
              t={t}
            />
          ))}
        </div>
      ) : (
        <div className="px-4 py-8 text-sm leading-6 text-text-muted">
          {latestRun
            ? copy.deliveryNoRuntimeTasks(runtime.runtimeId)
            : copy.deliveryEmpty}
        </div>
      )}
    </section>
  );
}

function ExecutionTaskCard({
  task,
  projectId,
  copy,
  t,
}: {
  task: PRNode;
  projectId?: number;
  copy: AgentRuntimeCopy;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const reviewHref =
    projectId && Number.isFinite(Number(task.id))
      ? projectPRReviewHref(projectId, Number(task.id))
      : undefined;
  const planHref = projectId && task.planId ? projectPlanHref(projectId, task.planId) : undefined;
  const output = task.failureReason || task.outputLog || task.errorLog;

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <GitPullRequest className="h-4 w-4 shrink-0 text-text-muted" />
            <span className="shrink-0 text-xs font-medium uppercase text-text-muted">
              {task.nodeKey}
            </span>
            <h4 className="truncate text-sm font-medium text-text-main">{task.title}</h4>
          </div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {task.taskId ? `task #${task.taskId} · ` : ''}
            {task.executor ?? t('states.unknown')}
            {task.runtimeId ? ` · ${task.runtimeId}` : ` · ${copy.awaitingRuntime}`}
          </p>
        </div>
        <ExecutionTaskStatusBadge status={task.status} copy={copy} />
      </div>

      <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
        <InfoBlock
          label={copy.phase}
          value={task.currentPhase || task.processStatus || task.status}
        />
        <InfoBlock
          label={copy.lastProgressShort}
          value={formatRelativeTime(task.lastProgressAt, t)}
        />
        {task.workdir ? <InfoBlock label={copy.workdir} value={task.workdir} /> : null}
        {task.branchName ? (
          <InfoBlock label={copy.branch} value={task.branchName} />
        ) : null}
      </div>

      {output ? (
        <pre className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-bg-subtle p-3 text-xs leading-5 text-text-main">
          {output}
        </pre>
      ) : null}

      {planHref || reviewHref || task.githubPrUrl ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {planHref ? (
            <Link
              href={planHref}
              className="focus-ring inline-flex h-8 items-center gap-2 rounded-[4px] border border-border-subtle px-3 text-xs font-medium text-text-main hover:bg-bg-subtle"
            >
              {copy.openPlan}
            </Link>
          ) : null}
          {reviewHref ? (
            <Link
              href={reviewHref}
              className="focus-ring inline-flex h-8 items-center gap-2 rounded-[4px] border border-border-subtle px-3 text-xs font-medium text-text-main hover:bg-bg-subtle"
            >
              {copy.openReview}
            </Link>
          ) : null}
          {task.githubPrUrl ? (
            <a
              href={task.githubPrUrl}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex h-8 items-center gap-2 rounded-[4px] border border-border-subtle px-3 text-xs font-medium text-text-main hover:bg-bg-subtle"
            >
              GitHub PR
              <ExternalLink className="h-3.5 w-3.5 text-text-muted" />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function DirectTaskPanel({
  prompt,
  onPromptChange,
  selectedRepository,
  runtime,
  tasks,
  selectedTask,
  selectedTaskId,
  events,
  isCreating,
  isLoading,
  isRefreshing,
  isCancelling,
  onSubmit,
  onCancel,
  onSelectTask,
  t,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  selectedRepository?: {
    repository_id: string;
    github_owner?: string;
    github_repo?: string;
    full_name?: string;
  };
  runtime: LocalRuntime;
  tasks: CodingCTODirectAgentTaskDTO[];
  selectedTask?: CodingCTODirectAgentTaskDTO;
  selectedTaskId?: number;
  events: CodingCTODirectTaskEventDTO[];
  isCreating: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  isCancelling: boolean;
  onSubmit: () => void;
  onCancel: (taskId: number) => void;
  onSelectTask: (taskId: number) => void;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const canDispatch =
    Boolean(prompt.trim()) &&
    Boolean(selectedRepository?.repository_id) &&
    runtime.dispatchableCapabilityCount > 0 &&
    !isCreating;
  const dispatchAgentName =
    runtime.capabilities.find(capability => capability.dispatchable)?.label ||
    displayAgentName(runtime.executor);
  const dispatchBlockReason = !selectedRepository?.repository_id
    ? t('tasks.blocked.noRepository')
    : runtime.dispatchableCapabilityCount === 0
      ? t('tasks.blocked.notDispatchable')
      : !prompt.trim()
        ? t('tasks.blocked.noPrompt', { agent: dispatchAgentName })
        : '';
  const repositoryLabel = selectedRepository
    ? selectedRepository.full_name ||
      `${selectedRepository.github_owner ?? ''}/${selectedRepository.github_repo ?? ''}`.replace(
        /^\/|\/$/g,
        ''
      ) ||
      selectedRepository.repository_id
    : t('tasks.noRepository');
  const canCancelSelectedTask = Boolean(
    selectedTask?.id && !isDirectTaskTerminal(selectedTask.status)
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-text-main">
              {t('tasks.runTitle', { agent: dispatchAgentName })}
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('tasks.runDescription', { agent: dispatchAgentName })}
            </p>
          </div>
          <Badge
            variant="outline"
            className={runtime.dispatchableCapabilityCount > 0 ? 'text-success' : 'text-text-muted'}
          >
            {runtime.dispatchableCapabilityCount > 0
              ? t('status.dispatchReady')
              : t('status.detectOnly')}
          </Badge>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-text-muted sm:grid-cols-2">
          <InfoBlock label={t('tasks.targetRepository')} value={repositoryLabel} />
          <InfoBlock label={t('fields.runtime')} value={runtime.runtimeId} />
          <InfoBlock
            label={t('tasks.slots')}
            value={t('tasks.slotUsage', {
              running: runtime.runningCount,
              max: runtime.maxConcurrency,
            })}
          />
          <InfoBlock label={t('fields.executor')} value={runtime.executor} />
        </div>
        <Textarea
          className="mt-4 min-h-28"
          value={prompt}
          placeholder={t('tasks.promptPlaceholder')}
          onChange={event => onPromptChange(event.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-text-muted">
            {dispatchBlockReason || t('tasks.promptHint')}
          </p>
          <Button disabled={!canDispatch} onClick={onSubmit}>
            {isCreating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {isCreating ? t('tasks.dispatching') : t('tasks.dispatch', { agent: dispatchAgentName })}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="border-b border-border-subtle bg-bg-subtle px-4 py-3">
            <div className="text-sm font-medium text-text-main">{t('tasks.recentTitle')}</div>
            <p className="mt-1 text-xs text-text-muted">{t('tasks.recentDescription')}</p>
          </div>
          {isLoading ? (
            <div className="px-4 py-8 text-sm text-text-muted">{t('states.loading')}</div>
          ) : tasks.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {tasks.map(task => (
                <button
                  key={task.id}
                  type="button"
                  className={cn(
                    'block w-full px-4 py-3 text-left hover:bg-bg-subtle',
                    (selectedTaskId ?? selectedTask?.id) === task.id && 'bg-bg-subtle'
                  )}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-text-main">{task.title}</span>
                    <TaskStatusBadge status={task.status} t={t} />
                  </div>
                  <div className="mt-1 truncate text-xs text-text-muted">
                    #{task.id} · {task.executor}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-sm leading-6 text-text-muted">
              {t('tasks.emptyDescription')}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle bg-bg-subtle px-4 py-3">
            <div>
              <div className="text-sm font-medium text-text-main">
                {selectedTask ? selectedTask.title : t('tasks.noTaskTitle')}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                {selectedTask ? `#${selectedTask.id} · ${selectedTask.repository_id}` : t('tasks.noTaskDescription')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedTask ? <TaskStatusBadge status={selectedTask.status} t={t} /> : null}
              {selectedTask && canCancelSelectedTask ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isCancelling}
                  onClick={() => onCancel(selectedTask.id)}
                >
                  {isCancelling ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {isCancelling ? t('tasks.cancelling') : t('tasks.cancel')}
                </Button>
              ) : null}
            </div>
          </div>
          {selectedTask ? (
            <div className="grid gap-4 p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                {isRefreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
                <span>{formatRelativeTime(selectedTask.updated_at, t)}</span>
                {selectedTask.runtime_id ? <span>· {selectedTask.runtime_id}</span> : null}
                {selectedTask.started_at && !selectedTask.finished_at ? (
                  <span>
                    · {t('tasks.elapsed', { elapsed: formatElapsedTime(selectedTask.started_at) })}
                  </span>
                ) : null}
                {selectedTask.last_progress_at ? (
                  <span>
                    · {t('tasks.lastProgress', {
                      time: formatRelativeTime(selectedTask.last_progress_at, t),
                    })}
                  </span>
                ) : null}
                {typeof selectedTask.exit_code === 'number' ? (
                  <span>· exit {selectedTask.exit_code}</span>
                ) : null}
              </div>
              {selectedTask.failure_reason ? (
                <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs text-text-muted">
                  {t('tasks.failureReason')}: {selectedTask.failure_reason}
                </div>
              ) : null}
              <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
                <div className="text-xs font-medium uppercase text-text-muted">{t('tasks.promptLabel')}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text-main">
                  {selectedTask.prompt}
                </p>
              </div>
              <TaskEventLog events={events} selectedTask={selectedTask} t={t} />
            </div>
          ) : (
            <div className="px-4 py-8 text-sm leading-6 text-text-muted">
              {t('tasks.noTaskDescription')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TaskStatusBadge({
  status,
  t,
}: {
  status: string;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const normalized = status || 'unknown';
  const tone =
    normalized === 'completed'
      ? 'text-success'
      : normalized === 'failed' || normalized === 'cancelled'
        ? 'text-error'
        : normalized === 'running'
          ? 'text-info'
          : 'text-text-muted';
  return (
    <Badge variant="outline" className={tone}>
      {directTaskStatusLabel(normalized, t)}
    </Badge>
  );
}

function ExecutionTaskStatusBadge({
  status,
  copy,
}: {
  status: PRNode['status'];
  copy: AgentRuntimeCopy;
}) {
  return (
    <Badge variant="outline" className={executionTaskStatusClassName(status)}>
      {executionTaskStatusLabel(status, copy)}
    </Badge>
  );
}

function executionTaskStatusClassName(status: PRNode['status']) {
  if (['completed', 'pr_opened', 'ready_for_review', 'merged'].includes(status)) {
    return 'text-success';
  }
  if (['failed', 'cancelled', 'blocked'].includes(status)) {
    return 'text-error';
  }
  if (['running', 'ci_running'].includes(status)) {
    return 'text-info';
  }
  return 'text-text-muted';
}

function executionTaskStatusLabel(
  status: PRNode['status'],
  copy: AgentRuntimeCopy
) {
  return copy.executionStatus[status] ?? copy.unknown;
}

function directTaskStatusLabel(
  status: string,
  t: ReturnType<typeof useT<'dashboard.agents'>>
) {
  switch (status) {
    case 'dispatched':
      return t('tasks.status.dispatched');
    case 'running':
      return t('tasks.status.running');
    case 'completed':
      return t('tasks.status.completed');
    case 'failed':
      return t('tasks.status.failed');
    case 'cancelled':
      return t('tasks.status.cancelled');
    default:
      return t('tasks.status.unknown');
  }
}

function TaskEventLog({
  events,
  selectedTask,
  t,
}: {
  events: CodingCTODirectTaskEventDTO[];
  selectedTask: CodingCTODirectAgentTaskDTO;
  t: ReturnType<typeof useT<'dashboard.agents'>>;
}) {
  const hasResult = selectedTask.output_log || selectedTask.error_log;
  const displayEvents = useMemo(() => compactTaskEventsForDisplay(events), [events]);
  return (
    <div className="overflow-hidden rounded-md border border-border-subtle">
      <div className="border-b border-border-subtle bg-bg-subtle px-3 py-2 text-xs font-medium uppercase text-text-muted">
        {t('tasks.eventsTitle')}
      </div>
      {displayEvents.length > 0 ? (
        <div className="max-h-72 divide-y divide-border-subtle overflow-y-auto">
          {displayEvents.map(event => (
            <div key={event.displayId} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                <span>
                  #{event.seq} · {event.type}
                  {event.tool ? ` · ${event.tool}` : ''}
                </span>
                <span>{formatRelativeTime(event.created_at, t)}</span>
              </div>
              {event.content || event.output ? (
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-text-main">
                  {event.content || event.output}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-8 text-sm text-text-muted">{t('tasks.noEvents')}</div>
      )}
      {hasResult ? (
        <div className="border-t border-border-subtle bg-bg-surface p-3">
          <div className="text-xs font-medium uppercase text-text-muted">{t('tasks.resultTitle')}</div>
          <pre className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-text-main">
            {selectedTask.output_log || selectedTask.error_log}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function compactTaskEventsForDisplay(events: CodingCTODirectTaskEventDTO[]): TaskEventLogEntry[] {
  const visibleEvents: TaskEventLogEntry[] = [];
  const suppressedCounts = new Map<string, number>();
  let firstSuppressedEvent: CodingCTODirectTaskEventDTO | undefined;
  let totalSuppressed = 0;

  for (const event of events) {
    const noiseKey = noisyTaskEventKey(event);
    if (noiseKey) {
      suppressedCounts.set(noiseKey, (suppressedCounts.get(noiseKey) ?? 0) + 1);
      firstSuppressedEvent ??= event;
      totalSuppressed += 1;
      continue;
    }
    visibleEvents.push({ ...event, displayId: String(event.id) });
  }

  if (!firstSuppressedEvent || totalSuppressed === 0) {
    return visibleEvents;
  }

  const output = Array.from(suppressedCounts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => `${key}: ${count}`)
    .join('\n');

  visibleEvents.push({
    ...firstSuppressedEvent,
    id: -firstSuppressedEvent.id,
    seq: firstSuppressedEvent.seq,
    type: 'executor_log_suppressed',
    tool: firstSuppressedEvent.tool,
    content: `Suppressed ${totalSuppressed} noisy CLI warning lines.`,
    output,
    displayId: `suppressed-${firstSuppressedEvent.id}-${totalSuppressed}`,
  });

  return visibleEvents;
}

function noisyTaskEventKey(event: CodingCTODirectTaskEventDTO) {
  if (event.type !== 'executor_stderr') {
    return '';
  }
  const output = event.output ?? event.content ?? '';
  if (output.includes('codex_core_plugins::manifest: ignoring interface.defaultPrompt')) {
    return 'codex plugin manifest defaultPrompt warning';
  }
  if (output.includes('codex_core_skills::loader: ignoring interface.icon_small')) {
    return 'codex skill icon_small warning';
  }
  if (output.includes('codex_core_skills::loader: ignoring interface.icon_large')) {
    return 'codex skill icon_large warning';
  }
  return '';
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

function AgentLogo({
  logo,
  label,
  size = 'md',
}: {
  logo: AgentLogoKey;
  label: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}) {
  const sizeClassName = {
    xs: 'h-4 w-4 rounded-[4px] p-0.5',
    sm: 'h-6 w-6 rounded-md p-1',
    md: 'h-10 w-10 rounded-md p-2',
    lg: 'h-14 w-14 rounded-lg p-2.5',
  }[size];
  const logoSource = agentLogoSource(logo);

  return (
    <span
      aria-label={`${label} logo`}
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border-subtle bg-white shadow-sm',
        sizeClassName,
        logo === 'terminal' && 'bg-bg-subtle font-semibold text-text-muted'
      )}
    >
      {logoSource ? (
        <img src={logoSource} alt="" className="h-full w-full object-contain" draggable={false} />
      ) : (
        'CLI'
      )}
    </span>
  );
}

function agentLogoSource(logo: AgentLogoKey) {
  switch (logo) {
    case 'codex':
      return '/agent-logos/openai.svg';
    case 'kimi':
      return '/agent-logos/kimi.ico';
    case 'claude':
      return '/agent-logos/claude.png';
    case 'cursor':
      return '/agent-logos/cursor.svg';
    case 'opencode':
      return '/agent-logos/opencode.png';
    default:
      return '';
  }
}

function agentRuntimeCopy(locale: string) {
  if (locale === 'zh-Hans') {
    return {
      unknown: '未知',
      activityLoading: '正在读取计划执行和 direct task 状态。',
      noCurrentTitle: '当前没有进行中的工作',
      noRunDescription: '这个智能体还没有关联到最近一次计划执行。',
      noRuntimeTasks: (runtime: string) => `最近的计划执行里没有分配给 ${runtime} 的任务。`,
      currentDeliveryTitle: '正在执行计划任务',
      currentDirectTitle: '正在执行 direct task',
      recentDeliveryTitle: '最近的计划任务',
      currentDeliveryDescription: (task: string) => `${task} 正在由这个智能体处理。`,
      currentDirectDescription: (task: string) => `${task} 正在由这个智能体直接执行。`,
      recentDeliveryDescription: (task: string) => `${task} 已经记录到这个智能体的执行历史。`,
      openPlan: '打开计划',
      openReview: '打开评审',
      deliveryTasks: '计划任务',
      claimedTasks: '已认领',
      currentSlot: '当前槽位',
      deliveryTitle: '计划交付任务',
      deliveryDescription: (runtime: string) =>
        `显示最近一次审批计划中由 ${runtime} 已认领或可认领的 PR 节点任务。`,
      deliveryEmpty: '最近还没有计划执行 run。审批计划后，runtime 领取的任务会出现在这里。',
      deliveryNoRuntimeTasks: (runtime: string) =>
        `最近的计划执行里暂时没有分配给 ${runtime} 的任务。`,
      awaitingRuntime: '等待 runtime 认领',
      phase: '阶段',
      lastProgressShort: '最近进度',
      workdir: '工作目录',
      branch: '分支',
      executionStatus: {
        planned: '已计划',
        queued: '排队中',
        running: '执行中',
        waiting_on_dependencies: '等待依赖',
        pr_opened: 'PR 已打开',
        ci_running: 'CI 运行中',
        ready_for_review: '可评审',
        blocked: '已阻塞',
        merged: '已合并',
        closed: '已关闭',
        completed: '已完成',
        failed: '失败',
        cancelled: '已取消',
      },
    };
  }

  return {
    unknown: 'unknown',
    activityLoading: 'Reading plan execution and direct task status.',
    noCurrentTitle: 'No current work',
    noRunDescription: 'This agent is not attached to the latest plan execution yet.',
    noRuntimeTasks: (runtime: string) => `The latest plan execution has no task assigned to ${runtime}.`,
    currentDeliveryTitle: 'Running plan task',
    currentDirectTitle: 'Running direct task',
    recentDeliveryTitle: 'Recent plan task',
    currentDeliveryDescription: (task: string) => `${task} is being handled by this agent.`,
    currentDirectDescription: (task: string) => `${task} is being executed directly by this agent.`,
    recentDeliveryDescription: (task: string) =>
      `${task} is recorded in this agent execution history.`,
    openPlan: 'Open plan',
    openReview: 'Open review',
    deliveryTasks: 'Plan tasks',
    claimedTasks: 'Claimed',
    currentSlot: 'Current slots',
    deliveryTitle: 'Plan delivery tasks',
    deliveryDescription: (runtime: string) =>
      `Shows PR node tasks from the latest approved plan that ${runtime} claimed or can claim.`,
    deliveryEmpty: 'No plan execution run yet. After plan approval, runtime-claimed work appears here.',
    deliveryNoRuntimeTasks: (runtime: string) =>
      `The latest plan execution has no task assigned to ${runtime} yet.`,
    awaitingRuntime: 'awaiting runtime claim',
    phase: 'Phase',
    lastProgressShort: 'Last progress',
    workdir: 'Workdir',
    branch: 'Branch',
    executionStatus: {
      planned: 'planned',
      queued: 'queued',
      running: 'running',
      waiting_on_dependencies: 'waiting on dependencies',
      pr_opened: 'PR opened',
      ci_running: 'CI running',
      ready_for_review: 'ready for review',
      blocked: 'blocked',
      merged: 'merged',
      closed: 'closed',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    },
  };
}

function skillAssignedToAgent(skill: SpecForgeSkillDTO, agentId: string) {
  const targets = skill.target_agents ?? [];
  return targets.some(target => {
    const normalized = target.trim().toLowerCase();
    return normalized === agentId || ALL_AGENT_TARGETS.has(normalized);
  });
}

function localAgentsFromRuntimes(runtimes: CodingCTORuntimeDTO[], now: number): LocalRuntime[] {
  return runtimes
    .filter(runtime => isFreshOnlineRuntime(runtime, now))
    .map(runtime => {
      const capabilities = runtimeCapabilities(runtime);
      const executorId = normalizeAgentId(runtime.executor || '');
      const dispatchableCapability =
        capabilities.find(capability => capability.dispatchable) ??
        capabilities.find(capability => capability.id === executorId) ??
        capabilities[0];
      const hostname = runtime.hostname || runtime.runtime_id;
      const dispatchableCapabilityCount = capabilities.filter(capability => capability.dispatchable).length;
      return {
        id: runtime.runtime_id,
        label: agentLabel(dispatchableCapability, runtime),
        description: `${dispatchableCapability.command} · ${hostname} · ${runtime.runtime_id}`,
        runtimeId: runtime.runtime_id,
        hostname,
        executor: runtime.executor || dispatchableCapability.id,
        skillTarget: dispatchableCapability.id,
        capabilities: dispatchableCapability ? [dispatchableCapability] : [],
        logo: dispatchableCapability.logo,
        dispatchableCapabilityCount,
        maxConcurrency: Math.max(1, runtime.max_concurrency ?? 1),
        runningCount: Math.max(0, runtime.running_count ?? 0),
        status: runtime.status,
        version: dispatchableCapability.version || runtime.version,
        lastSeenAt: runtime.last_seen_at,
      };
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

function runtimeIdFromRouteParam(value: string | undefined) {
  const decoded = decodeURIComponent(value ?? '');
  return decoded.split(':')[0];
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
        logo: agentLogoForExecutor(executor),
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
      logo: agentLogoForExecutor(command || cli.name),
    };
  });
}

function runtimeCanDispatchCLI(runtime: CodingCTORuntimeDTO, command: string) {
  return (
    (runtime.executor === 'codex_cli' && command === 'codex') ||
    (runtime.executor === 'kimi_cli' && command === 'kimi')
  );
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
    kimi: 'kimi_cli',
    kimi_cli: 'kimi_cli',
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
    kimi_cli: 'Kimi',
    claude: 'Claude',
    cursor_agent: 'Cursor Agent',
    cursor: 'Cursor',
    hermes: 'Hermes',
    opencode: 'OpenCode',
  };
  return labels[normalized] ?? value.replace(/[_-]+/g, ' ');
}

function agentLogoForExecutor(value: string): AgentLogoKey {
  const normalized = normalizeAgentId(value);
  if (normalized === 'codex_cli') {
    return 'codex';
  }
  if (normalized === 'kimi_cli') {
    return 'kimi';
  }
  if (normalized === 'claude') {
    return 'claude';
  }
  if (normalized === 'cursor' || normalized === 'cursor_agent') {
    return 'cursor';
  }
  if (normalized === 'opencode') {
    return 'opencode';
  }
  return 'terminal';
}

function isDirectTaskTerminal(status: string) {
  return ['completed', 'failed', 'cancelled'].includes(status);
}

function executionTasksForRuntime(run: ExecutionRun | undefined, runtime: LocalRuntime) {
  if (!run) {
    return [];
  }
  const normalizedRuntimeExecutor = normalizeAgentId(runtime.executor);
  return [...run.tasks]
    .filter(task => {
      if (task.runtimeId === runtime.runtimeId) {
        return true;
      }
      if (task.runtimeId) {
        return false;
      }
      return normalizeAgentId(task.executor ?? '') === normalizedRuntimeExecutor;
    })
    .sort((a, b) => executionTaskSortScore(a) - executionTaskSortScore(b));
}

function executionTaskSortScore(task: PRNode) {
  if (isExecutionTaskActive(task)) {
    return 0;
  }
  if (task.runtimeId && !isExecutionTaskTerminal(task)) {
    return 1;
  }
  if (!task.runtimeId) {
    return 2;
  }
  return 3;
}

function isExecutionTaskActive(task: PRNode) {
  return (
    task.status === 'running' ||
    task.status === 'ci_running' ||
    task.processStatus === 'running' ||
    task.processStatus === 'started'
  );
}

function isExecutionTaskTerminal(task: PRNode) {
  return ['completed', 'failed', 'cancelled', 'merged', 'closed'].includes(task.status);
}

function taskDisplayName(task: PRNode) {
  return `${task.nodeKey} ${task.title}`;
}

function formatElapsedTime(value: string | undefined) {
  if (!value) {
    return '0m';
  }
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '0m';
  }
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (elapsedSeconds < 60) {
    return `${elapsedSeconds}s`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${elapsedHours}h ${elapsedMinutes % 60}m`;
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
