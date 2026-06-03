'use client';

import { useMemo, useState } from 'react';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clipboard,
  FileText,
  Loader2,
  Sparkles,
  WandSparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type {
  ExpertImplementationPlanResponse,
  ExpertPlanStreamEvent,
  GenerateExpertImplementationPlanPayload,
} from '@/features/experts/services/experts-service';
import { expertsService } from '@/features/experts/services/experts-service';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  useGitHubRepositories,
  useSpecForgeSkills,
} from '@/features/specforge/hooks/use-specforge';
import type {
  GitHubRepositoryDTO,
  SpecForgeSkillDTO,
} from '@/features/specforge/services/specforge-service';
import { cn } from '@/utils';

type ExpertPlanMode = NonNullable<GenerateExpertImplementationPlanPayload['mode']>;

const modeOptions: Array<{ id: ExpertPlanMode; label: string; hint: string }> = [
  { id: 'standard', label: '标准方案', hint: 'PRD、技术方案、里程碑' },
  { id: 'mvp', label: 'MVP', hint: '更小范围，优先可验证' },
  { id: 'deep', label: '深度方案', hint: '更多风险、边界和测试' },
];

export function ExpertsConsole() {
  const { selectedWorkspaceId } = useSelectedWorkspace();
  const repositoriesQuery = useGitHubRepositories(
    selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : undefined
  );
  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const effectiveRepoId =
    selectedRepoId && repositories.some(repository => repository.repository_id === selectedRepoId)
      ? selectedRepoId
      : repositories[0]?.repository_id ?? '';
  const selectedRepository = repositories.find(
    repository => repository.repository_id === effectiveRepoId
  );
  const skillsQuery = useSpecForgeSkills(effectiveRepoId);
  const skills = useMemo(() => skillsQuery.data?.skills ?? [], [skillsQuery.data?.skills]);
  const planningSkills = useMemo(
    () => skills.filter(skill => skill.active && skillTargets(skill, 'planning')).slice(0, 12),
    [skills]
  );
  const defaultSelectedSkillIds = useMemo(
    () => planningSkills.map(skill => String(skill.id)).slice(0, 8),
    [planningSkills]
  );
  const [skillSelection, setSkillSelection] = useState<{
    repositoryId: string;
    ids: string[];
    touched: boolean;
  }>({ repositoryId: '', ids: [], touched: false });
  const [idea, setIdea] = useState('');
  const [mode, setMode] = useState<ExpertPlanMode>('standard');
  const [result, setResult] = useState<ExpertImplementationPlanResponse | null>(null);
  const [error, setError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamEvents, setStreamEvents] = useState<ExpertPlanStreamEvent[]>([]);
  const [streamBytes, setStreamBytes] = useState(0);

  const selectedSkillIds =
    skillSelection.touched && skillSelection.repositoryId === effectiveRepoId
      ? skillSelection.ids
      : defaultSelectedSkillIds;

  const selectedSkills = planningSkills.filter(skill =>
    selectedSkillIds.includes(String(skill.id))
  );

  async function runExpertPlan() {
    const trimmedIdea = idea.trim();
    setError('');
    setCopyMessage('');
    setStreamBytes(0);
    if (trimmedIdea.length < 10) {
      setError('Idea 至少需要 10 个字符。');
      return;
    }

    setIsGenerating(true);
    setResult(null);
    setStreamEvents([{ type: 'status', message: '准备连接专家模型...' }]);
    try {
      const response = await expertsService.generateImplementationPlanStream(
        {
          idea: trimmedIdea,
          mode,
          repository: repositoryPayload(selectedRepository),
          skills: selectedSkills.map(skillPayload),
        },
        {
          onEvent: event => {
            if (typeof event.arguments_bytes === 'number') {
              setStreamBytes(event.arguments_bytes);
            }
            if (event.type !== 'result') {
              setStreamEvents(events => [...events.slice(-11), event]);
            } else {
              setStreamEvents(events => [
                ...events.slice(-11),
                { ...event, response: undefined },
              ]);
            }
            if (event.type === 'result' && event.response) {
              setResult(event.response);
            }
          },
        }
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : '生成实施方案失败。');
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPlan() {
    if (!result?.markdown) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopyMessage('已复制');
    } catch {
      setCopyMessage('复制失败');
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Brain className="h-5 w-5 shrink-0 text-text-subtle" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-text-main">专家</h1>
              <Badge variant="outline" className="hidden text-primary sm:inline-flex">
                DeepSeek function call
              </Badge>
            </div>
            <p className="hidden truncate text-xs text-text-muted md:block">
              idea + expert skill 转实施方案
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={runExpertPlan}
          disabled={isGenerating}
          loading={isGenerating}
        >
          <WandSparkles className="h-4 w-4" />
          生成方案
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <section className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="grid gap-4 xl:self-start">
            <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-primary">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main">输入</h2>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    选择仓库和 skill，输入要规划的功能 idea。
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                {repositories.length > 0 ? (
                  <label className="grid gap-1.5">
                    <span className="text-xs font-medium text-text-muted">仓库</span>
                    <Select value={effectiveRepoId} onValueChange={setSelectedRepoId}>
                      <SelectTrigger className="w-full bg-bg-surface">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {repositories.map(repository => (
                          <SelectItem
                            key={repository.repository_id}
                            value={repository.repository_id}
                          >
                            {repository.github_owner}/{repository.github_repo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ) : (
                  <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
                    当前工作区没有可选仓库；本次会按纯 idea 生成。
                  </div>
                )}

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-text-muted">方案深度</span>
                  <Select value={mode} onValueChange={value => setMode(value as ExpertPlanMode)}>
                    <SelectTrigger className="w-full bg-bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {modeOptions.map(option => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label} - {option.hint}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <label className="grid gap-1.5">
                  <span className="text-xs font-medium text-text-muted">Idea</span>
                  <Textarea
                    className="min-h-44"
                    value={idea}
                    onChange={event => setIdea(event.target.value)}
                    placeholder="例如：实现专家侧栏，用户输入 idea 后结合项目 skill 生成详细实施方案，并能复制给 Coding Agent。"
                  />
                </label>
              </div>
            </section>

            <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-text-main">Expert skills</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {skillsQuery.isLoading
                      ? '加载中...'
                      : `${selectedSkills.length}/${planningSkills.length} 已选`}
                  </p>
                </div>
                <Badge variant="outline" className="text-text-muted">
                  planning
                </Badge>
              </div>

              <div className="mt-3 grid gap-2">
                {skillsQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    检查 skill...
                  </div>
                ) : null}
                {!skillsQuery.isLoading && planningSkills.length === 0 ? (
                  <div className="rounded-md bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
                    没有 active planning skill。可以先生成，再去技能页补规则。
                  </div>
                ) : null}
                {planningSkills.map(skill => (
                  <SkillToggleRow
                    key={skill.id}
                    skill={skill}
                    checked={selectedSkillIds.includes(String(skill.id))}
                    onChange={checked => {
                      const nextIds = checked
                        ? Array.from(new Set([...selectedSkillIds, String(skill.id)]))
                        : selectedSkillIds.filter(id => id !== String(skill.id));
                      setSkillSelection({
                        repositoryId: effectiveRepoId,
                        ids: nextIds,
                        touched: true,
                      });
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-md border border-border-subtle bg-bg-subtle p-3">
              <div className="text-xs font-medium text-text-main">运行配置</div>
              <div className="mt-2 grid gap-2 text-xs leading-5 text-text-muted">
                <InlineField label="Provider" value="DeepSeek" />
                <InlineField label="Model" value="DEEPSEEK_MODEL 或 deepseek-v4-pro" />
                <InlineField label="Key" value="服务端 DEEPSEEK_API_KEY" />
                <InlineField label="Tool" value="draft_implementation_plan" />
              </div>
            </section>
          </div>

          <section className="min-w-0 rounded-md border border-border-subtle bg-bg-surface">
            <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border-subtle px-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-text-muted" />
                  <h2 className="truncate text-sm font-semibold text-text-main">实施方案</h2>
                </div>
                <p className="mt-0.5 truncate text-xs text-text-muted">
                  {result
                    ? `${result.provider} / ${result.model} / ${result.tool_call.name}`
                    : isGenerating
                      ? `正在流式生成${streamBytes > 0 ? ` / ${streamBytes} bytes` : ''}`
                      : '等待生成'}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={copyPlan}
                disabled={!result}
              >
                <Clipboard className="h-4 w-4" />
                复制
              </Button>
            </div>

            {error ? (
              <div className="m-4 rounded-md bg-error-subtle px-3 py-2 text-sm leading-6 text-error">
                {error}
              </div>
            ) : null}
            {copyMessage ? (
              <div className="mx-4 mt-4 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs text-text-muted">
                {copyMessage}
              </div>
            ) : null}

            {result ? (
              <div className="grid gap-4 p-4">
                <ProcessTrace events={streamEvents} bytes={streamBytes} />
                <PlanSummary result={result} />
                <pre className="max-h-[calc(100vh-18rem)] overflow-auto whitespace-pre-wrap rounded-md bg-bg-subtle p-4 text-sm leading-6 text-text-main">
                  {result.markdown}
                </pre>
              </div>
            ) : isGenerating ? (
              <StreamingPlanState events={streamEvents} bytes={streamBytes} />
            ) : (
              <div className="flex min-h-[520px] items-center justify-center p-8 text-center">
                <div className="max-w-sm">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-bg-subtle text-text-muted">
                    <Brain className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-text-main">还没有方案</h3>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    输入 idea 后生成，结果会保留在当前页面。
                  </p>
                </div>
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}

function SkillToggleRow({
  skill,
  checked,
  onChange,
}: {
  skill: SpecForgeSkillDTO;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2',
        checked ? 'border-primary/30 bg-primary-subtle/40' : 'border-border-subtle bg-bg-subtle'
      )}
    >
      <Checkbox checked={checked} onCheckedChange={value => onChange(value === true)} />
      <span className="min-w-0">
        <span className="flex items-center gap-2">
          <BookOpen className="h-3.5 w-3.5 text-text-muted" />
          <span className="truncate text-xs font-medium text-text-main">{skill.name}</span>
        </span>
        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-text-muted">
          {skill.description || '无描述'}
        </span>
      </span>
    </label>
  );
}

function PlanSummary({ result }: { result: ExpertImplementationPlanResponse }) {
  const metrics = [
    { label: '里程碑', value: result.plan.milestones.length },
    { label: 'Skill', value: result.plan.expert_skills.length },
    { label: '风险', value: result.plan.risks.length },
    { label: '问题', value: result.plan.open_questions.length },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
      <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
          <CheckCircle2 className="h-4 w-4 text-success" />
          {result.plan.title}
        </div>
        <p className="mt-2 text-sm leading-6 text-text-muted">{result.plan.summary}</p>
      </div>
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-2">
        {metrics.map(metric => (
          <div key={metric.label} className="rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="text-xs text-text-muted">{metric.label}</div>
            <div className="mt-1 text-lg font-semibold text-text-main">{metric.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StreamingPlanState({ events, bytes }: { events: ExpertPlanStreamEvent[]; bytes: number }) {
  return (
    <div className="grid gap-4 p-4">
      <div className="rounded-md border border-primary/20 bg-primary-subtle/30 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-text-main">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          正在流式生成实施方案
        </div>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          DeepSeek 正在通过 function call 输出结构化方案，结果会在完成解析后自动显示。
        </p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.min(96, Math.max(12, bytes / 80))}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-text-muted">
          已接收 {bytes.toLocaleString()} bytes 结构化参数
        </div>
      </div>

      <ProcessTrace events={events} bytes={bytes} />
    </div>
  );
}

function ProcessTrace({ events, bytes }: { events: ExpertPlanStreamEvent[]; bytes: number }) {
  const visibleEvents =
    events.length > 0 ? events : [{ type: 'status' as const, message: '等待模型返回...' }];

  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-medium text-text-main">思考与调用过程</div>
        <div className="text-xs text-text-muted">{bytes.toLocaleString()} bytes</div>
      </div>
      <div className="mt-2 grid gap-2">
        {visibleEvents.map((event, index) => (
          <div
            key={`${event.type}-${index}`}
            className="flex items-start gap-2 text-xs leading-5 text-text-muted"
          >
            <span
              className={cn(
                'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                event.type === 'thinking'
                  ? 'bg-success'
                  : event.type === 'tool_call'
                    ? 'bg-primary'
                    : event.type === 'error'
                      ? 'bg-error'
                      : 'bg-text-muted'
              )}
            />
            <span className="min-w-0">
              <span className="font-medium text-text-main">{eventLabel(event)}</span>
              {event.phase ? <span className="text-text-subtle"> / {event.phase}</span> : null}
              <span>：{event.message || event.error || event.type}</span>
              {event.tool_name ? (
                <span className="text-text-subtle"> / tool={event.tool_name}</span>
              ) : null}
              {event.tool_call_id ? (
                <span className="text-text-subtle"> / id={event.tool_call_id}</span>
              ) : null}
              {typeof event.arguments_bytes === 'number' ? (
                <span className="text-text-subtle">
                  {' '}
                  / {event.arguments_bytes.toLocaleString()} bytes
                </span>
              ) : null}
              {event.details?.length ? (
                <span className="mt-1 block text-text-subtle">{event.details.join(' · ')}</span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function eventLabel(event: ExpertPlanStreamEvent) {
  if (event.type === 'thinking') return '思考';
  if (event.type === 'tool_call') return '调用';
  if (event.type === 'progress') return '进度';
  if (event.type === 'result') return '完成';
  if (event.type === 'error') return '错误';
  return '状态';
}

function InlineField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="truncate text-text-main">{value}</span>
    </div>
  );
}

function skillTargets(skill: SpecForgeSkillDTO, target: string) {
  const targets = skill.target_agents ?? [];
  return targets.length === 0 || targets.includes('all') || targets.includes(target);
}

function skillPayload(skill: SpecForgeSkillDTO) {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    target_agents: skill.target_agents,
  };
}

function repositoryPayload(repository?: GitHubRepositoryDTO) {
  if (!repository) {
    return undefined;
  }
  return {
    repository_id: repository.repository_id,
    full_name: `${repository.github_owner}/${repository.github_repo}`,
    default_branch: repository.default_branch,
  };
}
