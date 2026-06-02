import type { ReactNode } from 'react';
import { Info } from 'lucide-react';

import { Button } from '@/components/ui/button';

export function DetailPanel({
  title,
  heading,
  children,
}: {
  title: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-medium text-text-muted">{title}</div>
        <h2 className="mt-1 text-lg font-semibold leading-6">{heading}</h2>
      </div>
      {children}
    </div>
  );
}

export function EmptyProjectPlanPanel({
  isLoading,
  onCreate,
}: {
  isLoading: boolean;
  onCreate: () => void;
}) {
  return (
    <div className="rounded border border-border-subtle bg-bg-surface p-4">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-medium">
            {isLoading ? 'Checking for existing project plans' : 'Create a real project plan'}
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Project-scoped CodingCTO no longer falls back to demo work. Generate a requirement to
            create the first backend-backed plan, prompt contract, and execution run for this
            project.
          </p>
          <Button className="mt-3" size="sm" onClick={onCreate}>
            Open idea intake
          </Button>
        </div>
      </div>
    </div>
  );
}
