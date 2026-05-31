'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Download,
  HardDriveDownload,
  Info,
  LinkIcon,
  Plus,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/constants/routes';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  useGitHubRepositories,
  useSpecForgeRuntimes,
  useSpecForgeSkills,
  useUpsertSpecForgeSkill,
} from '@/features/specforge/hooks/use-specforge';
import type { SpecForgeSkillDTO } from '@/features/specforge/services/specforge-service';
import { useT } from '@/i18n';
import { cn } from '@/utils';

type SkillDialogMode = 'choose' | 'manual' | 'url' | 'runtime';

export function SkillsConsole() {
  const t = useT('dashboard.skills');
  const { selectedWorkspaceId } = useSelectedWorkspace();
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
  const runtimesQuery = useSpecForgeRuntimes({ limit: 20 });
  const runtimes = useMemo(
    () => runtimesQuery.data?.runtimes ?? [],
    [runtimesQuery.data?.runtimes]
  );
  const skills = skillsQuery.data?.skills ?? [];
  const selectedRepo = repositories.find(
    repository => repository.repository_id === effectiveSelectedRepoId
  );
  const canSaveSkill = Boolean(effectiveSelectedRepoId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<SkillDialogMode>('choose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState('');

  function openNewSkillDialog() {
    setDialogMode('choose');
    setName('');
    setDescription('');
    setContent('');
    setSourceUrl('');
    setActive(true);
    setMessage('');
    setDialogOpen(true);
  }

  function editSkill(skill: SpecForgeSkillDTO) {
    setDialogMode('manual');
    setName(skill.name);
    setDescription(skill.description ?? '');
    setContent(skill.content ?? '');
    setSourceUrl('');
    setActive(skill.active);
    setMessage('');
    setDialogOpen(true);
  }

  async function saveManualSkill() {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedContent =
      content.trim() ||
      `# ${trimmedName}\n\n${trimmedDescription || t('manual.defaultContent')}\n`;

    if (!effectiveSelectedRepoId || !trimmedName) {
      return;
    }

    try {
      await upsertSkill.mutateAsync({
        name: trimmedName,
        description: trimmedDescription,
        content: trimmedContent,
        active,
      });
      setDialogOpen(false);
    } catch {
      setMessage(t('messages.saveFailed'));
    }
  }

  async function importFromUrl() {
    const trimmedUrl = sourceUrl.trim();
    const derivedName = name.trim() || skillNameFromUrl(trimmedUrl);
    if (!effectiveSelectedRepoId || !trimmedUrl || !derivedName) {
      return;
    }

    try {
      await upsertSkill.mutateAsync({
        name: derivedName,
        description: description.trim() || t('url.importedDescription'),
        content: `# ${derivedName}\n\n${t('url.source')}: ${trimmedUrl}\n`,
        active: true,
      });
      setDialogOpen(false);
    } catch {
      setMessage(t('messages.saveFailed'));
    }
  }

  const isLoading = repositoriesQuery.isLoading || skillsQuery.isLoading;
  const hasRepository = repositories.length > 0;
  const hasSkills = skills.length > 0;

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BookOpen className="h-5 w-5 shrink-0 text-text-subtle" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-text-main">{t('title')}</h1>
              <span className="hidden text-sm text-text-muted sm:inline">{t('headerDescription')}</span>
              <Link
                href="https://docs.anthropic.com/en/docs/claude-code/skills"
                target="_blank"
                className="hidden text-sm text-text-muted underline-offset-4 hover:text-text-main hover:underline sm:inline"
              >
                {t('learnMore')}
              </Link>
            </div>
          </div>
        </div>
        <Button size="sm" onClick={openNewSkillDialog}>
          <Plus className="h-4 w-4" />
          {t('actions.new')}
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          {repositories.length > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-main">{t('repository.title')}</div>
                <p className="mt-0.5 text-xs text-text-muted">{t('repository.description')}</p>
              </div>
              <Select value={effectiveSelectedRepoId} onValueChange={setSelectedRepoId}>
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
            </div>
          ) : null}

          {isLoading ? (
            <div className="flex min-h-[420px] items-center justify-center text-sm text-text-muted">
              {t('states.loading')}
            </div>
          ) : hasSkills ? (
            <div className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-bg-surface">
              {skills.map(skill => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => editSkill(skill)}
                  className="flex w-full items-start justify-between gap-4 px-4 py-4 text-left hover:bg-bg-subtle"
                >
                  <span className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-muted">
                      <BookOpen className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text-main">{skill.name}</span>
                        <Badge
                          variant="outline"
                          className={cn(skill.active ? 'text-success' : 'text-text-muted')}
                        >
                          {skill.active ? t('badges.active') : t('badges.inactive')}
                        </Badge>
                      </span>
                      <span className="mt-1 line-clamp-2 text-sm leading-6 text-text-muted">
                        {skill.description || t('states.noDescription')}
                      </span>
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-text-muted sm:block">
                    {selectedRepo?.github_owner}/{selectedRepo?.github_repo}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptySkillsState
              hasRepository={hasRepository}
              onCreate={openNewSkillDialog}
              t={t}
            />
          )}
        </div>
      </main>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="gap-0 p-0 sm:max-w-[510px]">
          {dialogMode === 'choose' ? (
            <ChooseSkillMode onSelect={setDialogMode} t={t} />
          ) : null}

          {dialogMode === 'manual' ? (
            <ManualSkillForm
              name={name}
              description={description}
              content={content}
              active={active}
              canSave={canSaveSkill && Boolean(name.trim()) && !upsertSkill.isPending}
              isSaving={upsertSkill.isPending}
              message={message}
              onBack={() => setDialogMode('choose')}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onContentChange={setContent}
              onActiveChange={setActive}
              onSave={saveManualSkill}
              t={t}
            />
          ) : null}

          {dialogMode === 'url' ? (
            <UrlImportForm
              sourceUrl={sourceUrl}
              name={name}
              description={description}
              canSave={canSaveSkill && Boolean(sourceUrl.trim()) && !upsertSkill.isPending}
              isSaving={upsertSkill.isPending}
              message={message}
              onBack={() => setDialogMode('choose')}
              onSourceUrlChange={setSourceUrl}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onSave={importFromUrl}
              t={t}
            />
          ) : null}

          {dialogMode === 'runtime' ? (
            <RuntimeImportView
              runtimes={runtimes}
              isLoading={runtimesQuery.isLoading}
              onBack={() => setDialogMode('choose')}
              t={t}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptySkillsState({
  hasRepository,
  onCreate,
  t,
}: {
  hasRepository: boolean;
  onCreate: () => void;
  t: ReturnType<typeof useT<'dashboard.skills'>>;
}) {
  return (
    <div className="flex min-h-[560px] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-bg-subtle text-text-muted">
          <BookOpen className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-text-main">{t('empty.title')}</h2>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          {hasRepository ? t('empty.description') : t('empty.noRepository')}
        </p>
        <div className="mt-6 flex justify-center">
          {hasRepository ? (
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" />
              {t('actions.new')}
            </Button>
          ) : (
            <Link
              href={`${ROUTES.CONSOLE.SETTINGS}?tab=repositories`}
              className={buttonVariants()}
            >
              {t('repository.connect')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function ChooseSkillMode({
  onSelect,
  t,
}: {
  onSelect: (mode: SkillDialogMode) => void;
  t: ReturnType<typeof useT<'dashboard.skills'>>;
}) {
  const options = [
    {
      mode: 'manual' as const,
      icon: Plus,
      title: t('choose.manual.title'),
      description: t('choose.manual.description'),
    },
    {
      mode: 'url' as const,
      icon: Download,
      title: t('choose.url.title'),
      description: t('choose.url.description'),
    },
    {
      mode: 'runtime' as const,
      icon: HardDriveDownload,
      title: t('choose.runtime.title'),
      description: t('choose.runtime.description'),
    },
  ];

  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-6 py-5">
        <DialogTitle>{t('dialog.title')}</DialogTitle>
        <DialogDescription>{t('dialog.description')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 px-6 py-5">
        {options.map(option => (
          <button
            key={option.mode}
            type="button"
            onClick={() => onSelect(option.mode)}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-border-subtle p-4 text-left hover:border-border-main hover:bg-bg-subtle"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-muted">
                <option.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-medium text-text-main">{option.title}</span>
                <span className="mt-1 block text-sm leading-5 text-text-muted">
                  {option.description}
                </span>
              </span>
            </span>
            <span className="text-lg text-text-muted">›</span>
          </button>
        ))}
      </div>
    </>
  );
}

function ManualSkillForm({
  name,
  description,
  content,
  active,
  canSave,
  isSaving,
  message,
  onBack,
  onNameChange,
  onDescriptionChange,
  onContentChange,
  onActiveChange,
  onSave,
  t,
}: {
  name: string;
  description: string;
  content: string;
  active: boolean;
  canSave: boolean;
  isSaving: boolean;
  message: string;
  onBack: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSave: () => void;
  t: ReturnType<typeof useT<'dashboard.skills'>>;
}) {
  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-6 py-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-text-muted hover:text-text-main">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <DialogTitle>{t('manual.title')}</DialogTitle>
            <DialogDescription>{t('manual.description')}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto px-6 py-5">
        <div className="space-y-2">
          <Label htmlFor="skill-name">{t('fields.name')}</Label>
          <Input
            id="skill-name"
            value={name}
            onChange={event => onNameChange(event.target.value)}
            placeholder={t('fields.namePlaceholder')}
            maxLength={80}
          />
          <p className="text-xs text-text-muted">{t('fields.nameHint')}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-description">{t('fields.description')}</Label>
          <Textarea
            id="skill-description"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
            placeholder={t('fields.descriptionPlaceholder')}
            className="min-h-20"
            maxLength={240}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-content">{t('fields.content')}</Label>
          <Textarea
            id="skill-content"
            value={content}
            onChange={event => onContentChange(event.target.value)}
            placeholder={t('fields.contentPlaceholder')}
            className="min-h-28 font-mono text-xs leading-5"
          />
        </div>
        <Label className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
          <span>
            <span className="block text-sm font-medium">{t('fields.active')}</span>
            <span className="text-xs font-normal text-text-muted">{t('fields.activeHint')}</span>
          </span>
          <Switch checked={active} onCheckedChange={onActiveChange} />
        </Label>
        {message ? (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            {message}
          </div>
        ) : null}
      </div>
      <DialogFooter className="shrink-0 flex-row justify-end border-t border-border-subtle px-6 py-4">
        <Button variant="ghost" onClick={onBack}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={onSave} disabled={!canSave}>
          {isSaving ? t('actions.creating') : t('actions.create')}
        </Button>
      </DialogFooter>
    </>
  );
}

function UrlImportForm({
  sourceUrl,
  name,
  description,
  canSave,
  isSaving,
  message,
  onBack,
  onSourceUrlChange,
  onNameChange,
  onDescriptionChange,
  onSave,
  t,
}: {
  sourceUrl: string;
  name: string;
  description: string;
  canSave: boolean;
  isSaving: boolean;
  message: string;
  onBack: () => void;
  onSourceUrlChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSave: () => void;
  t: ReturnType<typeof useT<'dashboard.skills'>>;
}) {
  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-6 py-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-text-muted hover:text-text-main">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <DialogTitle>{t('url.title')}</DialogTitle>
            <DialogDescription>{t('url.description')}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto px-6 py-5">
        <div className="space-y-2">
          <Label htmlFor="skill-url">{t('url.field')}</Label>
          <Input
            id="skill-url"
            value={sourceUrl}
            onChange={event => onSourceUrlChange(event.target.value)}
            placeholder="https://github.com/org/repo/tree/main/skill"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-url-name">{t('fields.name')}</Label>
          <Input
            id="skill-url-name"
            value={name}
            onChange={event => onNameChange(event.target.value)}
            placeholder={t('url.namePlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="skill-url-description">{t('fields.description')}</Label>
          <Textarea
            id="skill-url-description"
            value={description}
            onChange={event => onDescriptionChange(event.target.value)}
            placeholder={t('url.descriptionPlaceholder')}
            className="min-h-20"
          />
        </div>
        <div className="flex gap-2 rounded-lg bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
          <Info className="mt-1 h-4 w-4 shrink-0" />
          <span>{t('url.note')}</span>
        </div>
        {message ? (
          <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            {message}
          </div>
        ) : null}
      </div>
      <DialogFooter className="shrink-0 flex-row justify-end border-t border-border-subtle px-6 py-4">
        <Button variant="ghost" onClick={onBack}>
          {t('actions.cancel')}
        </Button>
        <Button onClick={onSave} disabled={!canSave}>
          <LinkIcon className="h-4 w-4" />
          {isSaving ? t('actions.importing') : t('actions.import')}
        </Button>
      </DialogFooter>
    </>
  );
}

function RuntimeImportView({
  runtimes,
  isLoading,
  onBack,
  t,
}: {
  runtimes: { runtime_id: string; hostname?: string; executor?: string; status?: string }[];
  isLoading: boolean;
  onBack: () => void;
  t: ReturnType<typeof useT<'dashboard.skills'>>;
}) {
  const selectedRuntime = runtimes[0];

  return (
    <>
      <DialogHeader className="border-b border-border-subtle px-6 py-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="text-text-muted hover:text-text-main">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <DialogTitle>{t('runtime.title')}</DialogTitle>
            <DialogDescription>{t('runtime.description')}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className="min-h-[380px] space-y-4 px-6 py-5">
        <div className="space-y-2">
          <Label>{t('runtime.field')}</Label>
          <div className="flex h-9 items-center justify-between rounded-md border border-border-subtle bg-bg-surface px-3 text-sm">
            <span className="truncate">
              {selectedRuntime
                ? `${selectedRuntime.executor ?? 'runtime'} (${selectedRuntime.hostname ?? selectedRuntime.runtime_id})`
                : isLoading
                  ? t('states.loading')
                  : t('runtime.none')}
            </span>
            <Badge variant="outline" className={selectedRuntime?.status === 'online' ? 'text-success' : ''}>
              {selectedRuntime?.status ?? t('runtime.unknown')}
            </Badge>
          </div>
        </div>
        <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-2 text-sm text-text-muted">
          <span className="flex items-center gap-2">
            <Box className="h-4 w-4" />
            {selectedRuntime
              ? `${selectedRuntime.executor ?? t('runtime.provider')} (${selectedRuntime.runtime_id})`
              : t('runtime.noRuntime')}
          </span>
        </div>
        <div className="flex gap-2 rounded-lg bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
          <Info className="mt-1 h-4 w-4 shrink-0" />
          <span>{t('runtime.unsupported')}</span>
        </div>
        <p className="text-sm leading-6 text-text-muted">{t('runtime.note')}</p>
      </div>
      <DialogFooter className="border-t border-border-subtle px-6 py-4">
        <Button variant="ghost" onClick={onBack}>
          {t('actions.cancel')}
        </Button>
        <Button disabled>
          <Download className="h-4 w-4" />
          {t('actions.importToWorkspace')}
        </Button>
      </DialogFooter>
    </>
  );
}

function skillNameFromUrl(value: string) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return parts.at(-1) || url.hostname;
  } catch {
    return value.split('/').filter(Boolean).at(-1) ?? '';
  }
}
