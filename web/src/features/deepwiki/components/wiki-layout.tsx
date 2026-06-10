'use client';

import { BookOpen, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { IndexProgress } from '@/features/deepwiki/components/index-progress';
import type { DeepWikiIndexDTO, DeepWikiPageDTO, DeepWikiSourceDTO } from '@/features/deepwiki/types';
import { cn } from '@/utils';
import { useT } from '@/i18n';

export interface WikiLayoutProps {
  source?: DeepWikiSourceDTO;
  index?: DeepWikiIndexDTO | null;
  pages: DeepWikiPageDTO[];
  selectedSlug?: string;
  isIndexing?: boolean;
  onSelectPage: (slug: string) => void;
  onReindex: () => void;
  children: React.ReactNode;
}

/**
 * @component WikiLayout
 * @category Feature
 * @status Beta
 * @description Provides page navigation and index metadata around the DeepWiki reader.
 * @usage Use as the shell for DeepWiki pages once an index exists.
 * @example
 * <WikiLayout pages={pages}>{reader}</WikiLayout>
 */
export function WikiLayout({
  source,
  index,
  pages,
  selectedSlug,
  isIndexing = false,
  onSelectPage,
  onReindex,
  children,
}: WikiLayoutProps) {
  const t = useT('dashboard.deepwiki.layout');

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-b border-border-subtle bg-bg-surface p-3 xl:border-b-0 xl:border-r">
        <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
          <BookOpen className="size-4 text-primary" />
          {t('pages')}
        </div>
        <nav className="flex gap-1 overflow-x-auto pb-1 xl:block xl:space-y-1 xl:overflow-visible xl:pb-0">
          {pages.map(page => (
            <button
              key={page.slug}
              type="button"
              onClick={() => onSelectPage(page.slug)}
              className={cn(
                'flex h-9 min-w-36 items-center rounded-md px-2 text-left text-sm text-text-subtle hover:bg-bg-subtle hover:text-text-main xl:w-full',
                selectedSlug === page.slug && 'bg-primary-subtle font-medium text-primary'
              )}
            >
              <span className="truncate">{page.title}</span>
            </button>
          ))}
        </nav>
      </aside>
      <section className="flex min-w-0 flex-col">
        <header className="shrink-0 border-b border-border-subtle bg-bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-main">
                {source?.repo_url || source?.local_path || t('untitled')}
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-muted">
                <span>{source?.branch || t('defaultBranch')}</span>
                <span>{index?.commit_sha || t('noCommit')}</span>
                <span>{t('files', { count: index?.file_count ?? 0 })}</span>
                <span>{t('chunks', { count: index?.chunk_count ?? 0 })}</span>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={isIndexing}
              icon={<RefreshCw className="size-4" />}
              onClick={onReindex}
              disabled={!source}
            >
              {t('reindex')}
            </Button>
          </div>
          <div className="mt-3">
            <IndexProgress
              status={index?.status || source?.status}
              failure={source?.last_failure}
              error={source?.last_error || index?.error_message}
            />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </section>
    </div>
  );
}
