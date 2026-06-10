'use client';

import { FileCode2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useDeepWikiSourceSnippet } from '@/features/deepwiki/hooks/use-deepwiki';
import type { DeepWikiSourceRefDTO } from '@/features/deepwiki/types';
import { useT } from '@/i18n';

export interface SourceReferencePanelProps {
  indexId?: number;
  selectedRef?: DeepWikiSourceRefDTO;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * @component SourceReferencePanel
 * @category Feature
 * @status Beta
 * @description Displays the code snippet for a selected DeepWiki source reference.
 * @usage Open as a sheet from DeepWiki source reference buttons.
 * @example
 * <SourceReferencePanel indexId={1} selectedRef={ref} open onOpenChange={setOpen} />
 */
export function SourceReferencePanel({
  indexId,
  selectedRef,
  open,
  onOpenChange,
}: SourceReferencePanelProps) {
  const t = useT('dashboard.deepwiki.references');
  const snippetQuery = useDeepWikiSourceSnippet(indexId, selectedRef);
  const lineRange = selectedRef
    ? t('lineRange', { start: selectedRef.start_line, end: selectedRef.end_line })
    : '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(620px,calc(100vw-1rem))] gap-0 border-border-subtle bg-bg-surface p-0 sm:max-w-[620px]"
      >
        <SheetHeader className="border-b border-border-subtle px-5 py-4">
          <div className="flex items-center gap-2">
            <FileCode2 className="size-4 text-primary" />
            <SheetTitle>{t('title')}</SheetTitle>
          </div>
          <SheetDescription className="break-all">
            {selectedRef ? `${selectedRef.path} · ${lineRange}` : t('empty')}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {selectedRef ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs text-text-muted">
                <div className="break-all font-medium text-text-main">{selectedRef.path}</div>
                <div>{lineRange}</div>
              </div>
              <pre className="max-h-[calc(100vh-11rem)] overflow-auto rounded-md border border-border-subtle bg-bg-canvas p-3 text-xs leading-5 text-text-main">
                {snippetQuery.isLoading ? t('loading') : snippetQuery.data?.content || t('unavailable')}
              </pre>
            </div>
          ) : (
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
              {t('empty')}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
