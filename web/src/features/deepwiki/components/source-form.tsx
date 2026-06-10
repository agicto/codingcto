'use client';

import { FormEvent, useState } from 'react';
import { FolderOpen, Github, HardDrive, Play } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LocalDirectoryPicker } from '@/features/deepwiki/components/local-directory-picker';
import { useT } from '@/i18n';
import type { CreateDeepWikiSourcePayload, DeepWikiSourceType } from '@/features/deepwiki/types';

export interface SourceFormProps {
  isPending?: boolean;
  onSubmit: (payload: CreateDeepWikiSourcePayload, autoIndex: boolean) => Promise<void> | void;
}

/**
 * @component SourceForm
 * @category Feature
 * @status Beta
 * @description Captures a GitHub URL or local path for DeepWiki indexing.
 * @usage Use inside DeepWikiConsole when users add a repository source.
 * @example
 * <SourceForm onSubmit={handleCreate} />
 */
export function SourceForm({ isPending = false, onSubmit }: SourceFormProps) {
  const t = useT('dashboard.deepwiki.sourceForm');
  const [sourceType, setSourceType] = useState<DeepWikiSourceType>('local_path');
  const [repoURL, setRepoURL] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [branch, setBranch] = useState('');
  const [pat, setPat] = useState('');
  const [message, setMessage] = useState('');
  const [directoryPickerOpen, setDirectoryPickerOpen] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateDeepWikiSourcePayload = {
      source_type: sourceType,
      repo_url: sourceType === 'github_url' ? repoURL.trim() : undefined,
      local_path: sourceType === 'local_path' ? localPath.trim() : undefined,
      branch: branch.trim() || undefined,
      pat: pat.trim() || undefined,
    };
    if (sourceType === 'github_url' && !payload.repo_url) {
      setMessage(t('githubRequired'));
      return;
    }
    if (sourceType === 'local_path' && !payload.local_path) {
      setMessage(t('pathRequired'));
      return;
    }
    setMessage('');
    await onSubmit(payload, true);
    setRepoURL('');
    setLocalPath('');
    setBranch('');
    setPat('');
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="space-y-2">
        <Label>{t('sourceType')}</Label>
        <ToggleGroup
          type="single"
          value={sourceType}
          onValueChange={value => {
            if (value === 'github_url' || value === 'local_path') {
              setSourceType(value);
            }
          }}
          className="grid w-full grid-cols-2 rounded-md border border-border-subtle bg-bg-surface p-1"
        >
          <ToggleGroupItem value="local_path" className="gap-2 rounded-sm">
            <HardDrive className="size-4" />
            {t('localPath')}
          </ToggleGroupItem>
          <ToggleGroupItem value="github_url" className="gap-2 rounded-sm">
            <Github className="size-4" />
            {t('githubURL')}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {sourceType === 'github_url' ? (
        <div className="space-y-2">
          <Label htmlFor="deepwiki-repo-url">{t('repoURL')}</Label>
          <Input
            id="deepwiki-repo-url"
            value={repoURL}
            onChange={event => setRepoURL(event.target.value)}
            placeholder={t('repoURLPlaceholder')}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="deepwiki-local-path">{t('path')}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<FolderOpen className="size-4" />}
              onClick={() => setDirectoryPickerOpen(true)}
            >
              {t('browse')}
            </Button>
          </div>
          <Textarea
            id="deepwiki-local-path"
            value={localPath}
            onChange={event => setLocalPath(event.target.value)}
            placeholder={t('pathPlaceholder')}
            rows={2}
          />
          {directoryPickerOpen ? (
            <LocalDirectoryPicker
              open={directoryPickerOpen}
              initialPath={localPath}
              onOpenChange={setDirectoryPickerOpen}
              onSelect={setLocalPath}
            />
          ) : null}
        </div>
      )}

      <div className="grid gap-3">
        <div className="space-y-2">
          <Label htmlFor="deepwiki-branch">{t('branch')}</Label>
          <Input
            id="deepwiki-branch"
            value={branch}
            onChange={event => setBranch(event.target.value)}
            placeholder={t('branchPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="deepwiki-pat">{t('pat')}</Label>
          <Input
            id="deepwiki-pat"
            value={pat}
            onChange={event => setPat(event.target.value)}
            placeholder={t('patPlaceholder')}
            type="password"
          />
        </div>
      </div>

      {message ? (
        <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs text-text-muted">
          {message}
        </div>
      ) : null}

      <Button type="submit" className="w-full" loading={isPending} icon={<Play className="size-4" />}>
        {t('submit')}
      </Button>
    </form>
  );
}
