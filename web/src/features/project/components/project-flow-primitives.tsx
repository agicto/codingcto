import Link from 'next/link';
import type { ReactNode } from 'react';
import { CheckCircle2, Circle, CircleAlert, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils';

type FlowTone = 'ready' | 'waiting' | 'blocked' | 'running' | 'muted';

export interface ProjectCommandHeaderBadge {
  label: string;
  tone?: FlowTone;
}

export interface ProjectCommandHeaderAction {
  label: string;
  href?: string;
  disabled?: boolean;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: ReactNode;
}

export function ProjectCommandHeader({
  eyebrow,
  title,
  description,
  badges = [],
  meta,
  primaryAction,
  secondaryActions = [],
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badges?: ProjectCommandHeaderBadge[];
  meta?: ReactNode;
  primaryAction?: ProjectCommandHeaderAction;
  secondaryActions?: ProjectCommandHeaderAction[];
}) {
  const actions = [
    ...secondaryActions.map(action => ({ ...action, variant: action.variant ?? 'outline' })),
    primaryAction ? { ...primaryAction, variant: primaryAction.variant ?? 'default' } : undefined,
  ].filter(Boolean) as ProjectCommandHeaderAction[];

  return (
    <header className="border-b border-border-subtle pb-5">
      <div className="flex flex-wrap items-center gap-2">
        {eyebrow ? (
          <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
            {eyebrow}
          </span>
        ) : null}
        {badges.map(badge => (
          <Badge
            key={`${badge.label}-${badge.tone ?? 'muted'}`}
            variant="outline"
            className={cn('rounded-[4px] px-2 py-0.5 text-[11px]', flowToneClassName(badge.tone))}
          >
            {badge.label}
          </Badge>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text-main">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
          ) : null}
          {meta ? <div className="mt-3">{meta}</div> : null}
        </div>
        {actions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions.map(action => (
              <ProjectCommandAction key={`${action.label}-${action.href ?? 'button'}`} action={action} />
            ))}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export interface ProjectReadinessStripItem {
  label: string;
  value: string;
  helper?: string;
  tone: FlowTone;
}

export function ProjectReadinessStrip({
  items,
  className,
}: {
  items: ProjectReadinessStripItem[];
  className?: string;
}) {
  return (
    <section className={cn('grid gap-2 md:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map(item => (
        <div
          key={`${item.label}-${item.value}`}
          className="rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-xs text-text-muted">{item.label}</div>
            <FlowToneIcon tone={item.tone} />
          </div>
          <div className="mt-1 truncate text-sm font-medium text-text-main">{item.value}</div>
          {item.helper ? (
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">{item.helper}</div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

export interface ProjectWorkflowStep {
  id: string;
  label: string;
  description?: string;
  status: 'complete' | 'current' | 'waiting' | 'blocked';
}

export function ProjectWorkflowStepper({
  steps,
  className,
}: {
  steps: ProjectWorkflowStep[];
  className?: string;
}) {
  return (
    <section className={cn('rounded-[4px] border border-border-subtle bg-bg-surface p-3', className)}>
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={cn(
              'relative rounded-[4px] border px-3 py-2',
              step.status === 'current'
                ? 'border-primary/40 bg-primary-subtle'
                : step.status === 'complete'
                  ? 'border-success/30 bg-bg-subtle'
                  : step.status === 'blocked'
                    ? 'border-warning/30 bg-bg-subtle'
                    : 'border-border-subtle bg-bg-subtle'
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium',
                  step.status === 'current'
                    ? 'bg-primary text-primary-foreground'
                    : step.status === 'complete'
                      ? 'bg-success text-text-on-brand'
                      : step.status === 'blocked'
                        ? 'bg-warning text-text-main'
                        : 'bg-bg-surface text-text-muted'
                )}
              >
                {step.status === 'complete' ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span className="truncate text-sm font-medium text-text-main">{step.label}</span>
            </div>
            {step.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                {step.description}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProjectAdvancedDetails({
  title = 'Advanced details',
  description,
  children,
  defaultOpen = false,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={cn('rounded-[4px] border border-border-subtle bg-bg-surface p-4', className)}
    >
      <summary className="cursor-pointer text-sm font-medium text-text-main marker:text-text-muted">
        {title}
      </summary>
      {description ? (
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </details>
  );
}

function ProjectCommandAction({ action }: { action: ProjectCommandHeaderAction }) {
  const content = (
    <>
      {action.label}
      {action.icon}
    </>
  );

  if (action.href && !action.disabled) {
    return (
      <Button asChild size="sm" variant={action.variant ?? 'default'}>
        <Link href={action.href}>{content}</Link>
      </Button>
    );
  }

  return (
    <Button size="sm" variant={action.variant ?? 'default'} disabled={action.disabled}>
      {content}
    </Button>
  );
}

function FlowToneIcon({ tone }: { tone: FlowTone }) {
  if (tone === 'ready') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (tone === 'blocked') {
    return <CircleAlert className="h-4 w-4 text-warning" />;
  }
  if (tone === 'running') {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
  }
  return <Circle className="h-4 w-4 text-text-muted" />;
}

function flowToneClassName(tone: FlowTone = 'muted') {
  switch (tone) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'blocked':
      return 'border-warning/30 text-warning';
    case 'running':
      return 'border-primary/30 text-primary';
    case 'waiting':
      return 'border-border-subtle text-text-muted';
    default:
      return 'border-border-subtle text-text-muted';
  }
}
