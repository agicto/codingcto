'use client';

import { AlertTriangle, CheckCircle2, Circle, Loader2 } from 'lucide-react';

import { cn } from '@/utils';
import { useT } from '@/i18n';
import type { DeepWikiStatus } from '@/features/deepwiki/types';

export interface IndexProgressProps {
  status?: DeepWikiStatus | string;
  failure?: string;
  error?: string;
}

const steps: DeepWikiStatus[] = [
  'queued',
  'reading',
  'analyzing',
  'indexing',
  'planning',
  'generating',
  'ready',
];

/**
 * @component IndexProgress
 * @category Feature
 * @status Beta
 * @description Shows the DeepWiki indexing state machine.
 * @usage Use with a source or index status while indexing a repository.
 * @example
 * <IndexProgress status="reading" />
 */
export function IndexProgress({ status = 'queued', failure, error }: IndexProgressProps) {
  const t = useT('dashboard.deepwiki.status');
  const activeIndex = steps.indexOf(status as DeepWikiStatus);
  const failed = status === 'failed';

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {steps.map((step, index) => {
          const done = !failed && activeIndex >= index;
          const active = !failed && activeIndex === index && step !== 'ready';
          return (
            <div
              key={step}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border border-border-subtle px-2 text-text-muted',
                'min-w-28',
                done && 'border-primary/30 bg-primary-subtle text-primary',
                active && 'bg-bg-subtle text-text-main'
              )}
            >
              {active ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : done ? (
                <CheckCircle2 className="size-3.5" />
              ) : (
                <Circle className="size-3.5" />
              )}
              <span className="truncate">{t(step)}</span>
            </div>
          );
        })}
      </div>
      {failed ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {failure ? `${failure}: ` : null}
            {error || t('failed')}
          </span>
        </div>
      ) : null}
    </div>
  );
}
