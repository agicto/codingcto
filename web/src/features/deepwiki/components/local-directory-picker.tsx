'use client';

import { useState } from 'react';
import { AlertCircle, Check, ChevronLeft, Folder, Home, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDeepWikiLocalDirectories } from '@/features/deepwiki/hooks/use-deepwiki';
import { useT } from '@/i18n';

interface LocalDirectoryPickerProps {
  open: boolean;
  initialPath?: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}

/**
 * @component LocalDirectoryPicker
 * @category Feature
 * @status Beta
 * @description Lets users browse API-accessible local directories and select an absolute path.
 * @usage Open from SourceForm when adding a local DeepWiki source.
 * @example
 * <LocalDirectoryPicker open={open} onOpenChange={setOpen} onSelect={setLocalPath} />
 */
export function LocalDirectoryPicker({
  open,
  initialPath = '',
  onOpenChange,
  onSelect,
}: LocalDirectoryPickerProps) {
  const t = useT('dashboard.deepwiki.sourceForm');
  const [currentPath, setCurrentPath] = useState(() => initialPath.trim());
  const query = useDeepWikiLocalDirectories(currentPath, open);
  const errorMessage = query.error instanceof Error ? query.error.message : t('pickerError');
  const currentDirectory = query.data?.path ?? currentPath;

  function selectCurrentDirectory() {
    if (!query.data?.path) {
      return;
    }
    onSelect(query.data.path);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="gap-0 p-0">
        <DialogHeader className="border-b border-border-subtle px-6 py-5">
          <DialogTitle>{t('pickerTitle')}</DialogTitle>
          <DialogDescription>{t('pickerDescription')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              isIcon
              aria-label={t('pickerUp')}
              disabled={!query.data?.parent_path || query.isLoading}
              onClick={() => setCurrentPath(query.data?.parent_path ?? '')}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<Home className="size-4" />}
              onClick={() => setCurrentPath('')}
            >
              {t('pickerHome')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              icon={<RefreshCw className="size-4" />}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('pickerRefresh')}
            </Button>
          </div>

          <div className="min-h-10 break-all rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm text-text-secondary">
            {currentDirectory || t('pickerLoadingPath')}
          </div>

          {query.isError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div className="h-72 overflow-y-auto rounded-md border border-border-subtle">
            {query.isLoading ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
                <Loader2 className="size-4 animate-spin" />
                {t('pickerLoading')}
              </div>
            ) : query.data?.entries.length ? (
              <div className="divide-y divide-border-subtle">
                {query.data.entries.map(entry => (
                  <button
                    key={entry.path}
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-bg-subtle"
                    onClick={() => setCurrentPath(entry.path)}
                  >
                    <Folder className="size-4 shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-text-muted">
                {t('pickerEmpty')}
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter className="border-t border-border-subtle px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('pickerCancel')}
          </Button>
          <Button
            type="button"
            icon={<Check className="size-4" />}
            disabled={!query.data?.path || query.isError}
            onClick={selectCurrentDirectory}
          >
            {t('pickerSelect')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
