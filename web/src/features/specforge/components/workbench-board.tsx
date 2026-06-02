import type { LucideIcon } from 'lucide-react';
import { CircleDot } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/utils';

export type WorkbenchItemId = 'intake' | 'plan' | 'dag' | 'run' | 'context';

export interface WorkbenchStageItem {
  id: WorkbenchItemId;
  key: string;
  title: string;
  description: string;
  status: string;
  icon: LucideIcon;
}

export interface WorkbenchStage {
  id: string;
  title: string;
  tone: string;
  emptyLabel: string;
  items: WorkbenchStageItem[];
}

export function WorkbenchModeTabs({
  selectedWorkItem,
  onSelectWorkItem,
}: {
  selectedWorkItem: WorkbenchItemId;
  onSelectWorkItem: (item: WorkbenchItemId) => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
      <Button
        variant={
          selectedWorkItem === 'intake' || selectedWorkItem === 'context' ? 'secondary' : 'outline'
        }
        size="sm"
        onClick={() => onSelectWorkItem('intake')}
      >
        All work
      </Button>
      <Button
        variant={selectedWorkItem === 'plan' || selectedWorkItem === 'dag' ? 'secondary' : 'outline'}
        size="sm"
        onClick={() => onSelectWorkItem('plan')}
      >
        Plans
      </Button>
      <Button
        variant={selectedWorkItem === 'run' ? 'secondary' : 'outline'}
        size="sm"
        onClick={() => onSelectWorkItem('run')}
      >
        Runs
      </Button>
    </div>
  );
}

export function WorkbenchDeliveryBoard({
  stages,
  selectedWorkItem,
  onSelectWorkItem,
}: {
  stages: WorkbenchStage[];
  selectedWorkItem: WorkbenchItemId;
  onSelectWorkItem: (item: WorkbenchItemId) => void;
}) {
  return (
    <div className="min-w-0 overflow-x-auto p-3">
      <div className="grid h-full min-w-[1320px] grid-cols-6 gap-3">
        {stages.map(column => (
          <div key={column.id} className={cn('flex min-h-0 flex-col rounded p-3', column.tone)}>
            <div className="flex h-8 items-center justify-between text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CircleDot className="h-3.5 w-3.5 text-text-muted" />
                {column.title}
                <span className="text-xs text-text-muted">{column.items.length}</span>
              </div>
              <span className="text-text-muted">+</span>
            </div>
            <div className="mt-3 space-y-2">
              {column.items.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-text-muted">
                  {column.emptyLabel}
                </div>
              ) : (
                column.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSelectWorkItem(item.id)}
                      className={cn(
                        'w-full rounded border bg-bg-surface p-3 text-left shadow-sm transition hover:border-primary/40',
                        selectedWorkItem === item.id
                          ? 'border-primary ring-1 ring-primary'
                          : 'border-border-subtle'
                      )}
                    >
                      <div className="flex items-center gap-2 text-xs text-text-muted">
                        <Icon className="h-3.5 w-3.5 text-primary" />
                        {item.key}
                      </div>
                      <div className="mt-2 text-sm font-semibold leading-5">{item.title}</div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                        {item.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="rounded bg-muted px-2 py-1 text-text-subtle">
                          {item.status}
                        </span>
                        <span className="text-text-muted">Current</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
