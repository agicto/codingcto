'use client';

import type { ReactNode } from 'react';
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  FileText,
  GitPullRequest,
  ScrollText,
  TerminalSquare,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type {
  ProjectPlanningStage,
  ProjectPlanningStageID,
} from '@/features/project/project-planning-flow';
import { cn } from '@/utils';

const stageCopy: Record<
  ProjectPlanningStageID,
  { title: string; description: string; icon: ReactNode }
> = {
  project: {
    title: 'Project ready',
    description: 'Primary repository and project context are available.',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  requirement: {
    title: 'Create requirement',
    description: 'Capture the product idea with constraints and non-goals.',
    icon: <FileText className="h-4 w-4" />,
  },
  plan: {
    title: 'Generate plan',
    description: 'Produce product plan, technical plan, and assumptions.',
    icon: <ScrollText className="h-4 w-4" />,
  },
  dag: {
    title: 'Review PR DAG',
    description: 'Check PR boundaries, dependencies, risks, and tests.',
    icon: <GitPullRequest className="h-4 w-4" />,
  },
  prompt: {
    title: 'Preview prompts',
    description: 'Compile scoped Codex prompts from the approved plan snapshot.',
    icon: <TerminalSquare className="h-4 w-4" />,
  },
};

export function ProjectPlanningFlowCard({
  stages,
  title = 'Planning core',
  description = 'Follow the path from project context to a grounded implementation prompt.',
}: {
  stages: ProjectPlanningStage[];
  title?: string;
  description?: string;
}) {
  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-1">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="leading-6">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 lg:grid-cols-5">
          {stages.map((stage, index) => (
            <PlanningStageItem key={stage.id} index={index + 1} stage={stage} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanningStageItem({
  index,
  stage,
}: {
  index: number;
  stage: ProjectPlanningStage;
}) {
  const copy = stageCopy[stage.id];

  return (
    <div
      className={cn(
        'rounded-[4px] border border-border-subtle bg-bg-subtle p-3',
        stage.state === 'done' && 'border-success/25 bg-success/5',
        stage.state === 'current' && 'border-primary/30 bg-primary-subtle/30',
        stage.state === 'blocked' && 'border-warning/30 bg-warning-subtle'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-surface text-text-muted',
            stage.state === 'done' && 'border-success/25 text-success',
            stage.state === 'current' && 'border-primary/25 text-primary',
            stage.state === 'blocked' && 'border-warning/25 text-warning'
          )}
        >
          {stage.state === 'done' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : stage.state === 'blocked' ? (
            <CircleAlert className="h-4 w-4" />
          ) : (
            copy.icon
          )}
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {String(index).padStart(2, '0')}
        </Badge>
      </div>
      <div className="mt-3 text-sm font-medium text-text-main">{copy.title}</div>
      <p className="mt-1 min-h-10 text-xs leading-5 text-text-muted">{copy.description}</p>
      <div className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
        <Circle className="h-2.5 w-2.5 fill-current" />
        <span className="capitalize">{stage.state}</span>
      </div>
    </div>
  );
}
