'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, GitBranch, ListChecks, ScrollText, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import { projectContextHref, projectSpecForgeHref } from '@/features/project/project-utils';
import type { ProjectContextDTO } from '@/features/project/services/project-service';
import { useCreateSpecForgeProjectIdea } from '@/features/specforge/hooks/use-specforge';

type RequirementType = 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test';

const requirementTypes: Array<{ value: RequirementType; label: string; description: string }> = [
  {
    value: 'feature',
    label: 'Feature',
    description: 'New product behavior that should become a product and technical plan.',
  },
  {
    value: 'bugfix',
    label: 'Bugfix',
    description: 'A broken behavior that needs diagnosis, implementation, and verification.',
  },
  {
    value: 'refactor',
    label: 'Refactor',
    description: 'Internal improvement with explicit non-goals and regression checks.',
  },
  {
    value: 'docs',
    label: 'Docs',
    description: 'Documentation change with repository context and reviewable PR output.',
  },
  {
    value: 'test',
    label: 'Test',
    description: 'Coverage or verification work for an existing system behavior.',
  },
];

export function ProjectRequirementIntakePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;

  if (!validProjectId) {
    return (
      <RequirementIntakeState
        title="Invalid project"
        description="Open a valid project from the project list."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return (
      <RequirementIntakeState title="Loading project" description="Reading project context." />
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <RequirementIntakeState
        title="Project unavailable"
        description="The project context could not be loaded. Confirm backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  return <RequirementIntake context={context} />;
}

function RequirementIntake({ context }: { context: ProjectContextDTO }) {
  const router = useRouter();
  const readiness = projectContextReadiness(context);
  const primaryRepository = primaryRepositoryContext(context);
  const createRequirement = useCreateSpecForgeProjectIdea(context.project.id);
  const [input, setInput] = useState('');
  const [requirementType, setRequirementType] = useState<RequirementType>('feature');
  const [constraints, setConstraints] = useState('');
  const [message, setMessage] = useState('');
  const canSubmit = Boolean(input.trim() && readiness.hasPrimaryRepository);
  const selectedType = useMemo(
    () => requirementTypes.find(item => item.value === requirementType) ?? requirementTypes[0],
    [requirementType]
  );

  async function submitRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rawInput = input.trim();
    if (!rawInput) {
      setMessage('Describe the product change before generating a plan.');
      return;
    }
    if (!readiness.hasPrimaryRepository) {
      setMessage('Bind one active primary repository before generating a plan.');
      return;
    }

    const constraintText = constraints.trim();
    const composedInput = constraintText
      ? `${rawInput}\n\nConstraints and notes:\n${constraintText}`
      : rawInput;

    setMessage('');
    try {
      const bundle = await createRequirement.mutateAsync({
        input: composedInput,
        type: requirementType,
      });
      const planHref = `${projectSpecForgeHref(context.project.id)}#project-delivery`;
      setMessage(
        `Created requirement ${bundle.requirement?.id ?? bundle.idea.requirement_id ?? bundle.idea.id} and generated plan ${bundle.implementation_plan.id}.`
      );
      router.push(planHref);
    } catch {
      setMessage('Requirement plan generation failed. Review project context and try again.');
    }
  }

  return (
    <main className="mx-auto grid h-full min-h-0 w-full max-w-7xl gap-5 overflow-y-auto px-4 py-6 md:px-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0">
        <div className="border-b border-border-subtle pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Requirement intake</Badge>
            <Badge
              variant="outline"
              className={
                readiness.hasPrimaryRepository
                  ? 'border-success/30 text-success'
                  : 'border-warning/30 text-warning'
              }
            >
              {readiness.hasPrimaryRepository ? 'Planning ready' : 'Primary repo required'}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
            Create a product requirement
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            Describe the product outcome once. CodingCTO will use the project context to generate a
            product plan, technical plan, PR DAG, and scoped implementation prompts.
          </p>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submitRequirement}>
          <div className="space-y-2">
            <Label htmlFor="requirement-input">Product change</Label>
            <Textarea
              id="requirement-input"
              value={input}
              onChange={event => setInput(event.target.value)}
              className="min-h-56 bg-bg-surface text-sm leading-6"
              placeholder="Example: Add team invite support. Workspace admins can invite users by email, invited users accept through a link, and pending invites can be revoked."
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label htmlFor="requirement-type">Mode</Label>
              <Select
                value={requirementType}
                onValueChange={value => setRequirementType(value as RequirementType)}
              >
                <SelectTrigger id="requirement-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {requirementTypes.map(item => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-text-muted">{selectedType.description}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="requirement-constraints">Constraints</Label>
              <Textarea
                id="requirement-constraints"
                value={constraints}
                onChange={event => setConstraints(event.target.value)}
                className="min-h-28 bg-bg-surface text-sm leading-6"
                placeholder="Optional: non-goals, risk boundaries, rollout notes, existing issue link, or testing expectations."
              />
            </div>
          </div>
          {message ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-5 text-text-muted">
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit || createRequirement.isPending}>
              {createRequirement.isPending ? 'Generating plan' : 'Generate plan'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href={projectContextHref(context.project.id)}>Review context</Link>
            </Button>
          </div>
        </form>
      </section>

      <aside className="space-y-3">
        <ContextCard
          icon={<Sparkles className="h-4 w-4" />}
          title="Project"
          value={context.project.name}
          caption={context.project.description || 'No project description yet.'}
        />
        <ContextCard
          icon={<GitBranch className="h-4 w-4" />}
          title="Primary repository"
          value={primaryRepository?.repository.repository_id ?? 'Missing'}
          caption={readiness.summary}
        />
        <ContextCard
          icon={<ListChecks className="h-4 w-4" />}
          title="Context readiness"
          value={readiness.nextAction}
          caption={`${readiness.activeRepositoryCount} repos · ${readiness.skillCount} skills · ${readiness.warningCount} warnings`}
        />
        <ContextCard
          icon={<ScrollText className="h-4 w-4" />}
          title="Human checkpoint"
          value="Plan approval remains required"
          caption="This page creates a recommended plan. Execution still waits for explicit approval."
        />
        {!readiness.hasPrimaryRepository ? (
          <Alert>
            <AlertTitle>Primary repository required</AlertTitle>
            <AlertDescription>
              Requirement generation needs one writable primary repository.
            </AlertDescription>
          </Alert>
        ) : null}
      </aside>
    </main>
  );
}

function ContextCard({
  icon,
  title,
  value,
  caption,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  caption: string;
}) {
  return (
    <Card className="border-border-subtle shadow-xs">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
        <CardDescription className="text-xs leading-5">{caption}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm font-medium leading-5 text-text-main">{value}</div>
      </CardContent>
    </Card>
  );
}

function RequirementIntakeState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">{description}</AlertDescription>
      </Alert>
      {actionHref && actionLabel ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
