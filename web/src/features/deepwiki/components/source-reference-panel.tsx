'use client';

import { FileCode2 } from 'lucide-react';

import { useDeepWikiSourceSnippet } from '@/features/deepwiki/hooks/use-deepwiki';
import type { DeepWikiSourceRefDTO } from '@/features/deepwiki/types';
import { useT } from '@/i18n';

export interface SourceReferencePanelProps {
  indexId?: number;
  selectedRef?: DeepWikiSourceRefDTO;
}

/**
 * @component SourceReferencePanel
 * @category Feature
 * @status Beta
 * @description Displays the code snippet for a selected DeepWiki source reference.
 * @usage Use as the right-side evidence panel in the DeepWiki wiki reader.
 * @example
 * <SourceReferencePanel indexId={1} selectedRef={ref} />
 */
export function SourceReferencePanel({ indexId, selectedRef }: SourceReferencePanelProps) {
  const t = useT('dashboard.deepwiki.references');
  const snippetQuery = useDeepWikiSourceSnippet(indexId, selectedRef);

  return (
    <aside className="flex min-h-0 flex-col border-l border-border-subtle bg-bg-surface">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
        <FileCode2 className="size-4 text-primary" />
        <div className="min-w-0 text-sm font-semibold">{t('title')}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!selectedRef ? (
          <div className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
            {t('empty')}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="min-w-0 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs text-text-muted">
              <div className="truncate font-medium text-text-main">{selectedRef.path}</div>
              <div>
                {selectedRef.start_line}-{selectedRef.end_line}
              </div>
            </div>
            <pre className="max-h-[calc(100vh-12rem)] overflow-auto rounded-md border border-border-subtle bg-bg-canvas p-3 text-xs leading-5 text-text-main">
              {snippetQuery.isLoading ? t('loading') : snippetQuery.data?.content || t('unavailable')}
            </pre>
          </div>
        )}
      </div>
    </aside>
  );
}
