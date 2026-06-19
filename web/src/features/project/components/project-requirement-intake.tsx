'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  GitBranch,
  Lightbulb,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Workflow,
} from 'lucide-react';

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
import { ProjectPlanningFlowCard } from '@/features/project/components/project-planning-flow-card';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import { projectPlanningStages } from '@/features/project/project-planning-flow';
import { projectContextHref, projectPlanHref } from '@/features/project/project-utils';
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

const requirementExamples: Array<{
  label: string;
  input: string;
  constraints: string;
  type: RequirementType;
}> = [
  {
    label: 'Team invite flow',
    input:
      'Add team invite support. Workspace admins can invite users by email, invited users accept through a link, pending invites can be revoked, and invite tokens expire after 7 days.',
    constraints:
      'Non-goals: billing role changes and Slack notifications. Tests should cover admin-only invite creation, expired tokens, duplicate pending invites, and revoke behavior.',
    type: 'feature',
  },
  {
    label: 'Billing sync fix',
    input:
      'Fix billing usage sync so failed provider callbacks are retried and the workspace usage page never shows stale totals after a successful retry.',
    constraints:
      'Keep provider secrets out of logs. Add regression coverage for retry classification and final usage totals.',
    type: 'bugfix',
  },
  {
    label: 'Permission helper',
    input:
      'Refactor workspace permission checks into one reusable helper for API routes and keep existing behavior unchanged.',
    constraints:
      'Non-goals: no UI changes and no schema changes. Run existing auth and workspace tests after the refactor.',
    type: 'refactor',
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
  const readinessTone = !readiness.hasPrimaryRepository
    ? 'warning'
    : readiness.warningCount > 0 || readiness.skillCount === 0
      ? 'caution'
      : 'ready';
  const readinessLabel =
    readinessTone === 'ready'
      ? 'Planning ready'
      : readinessTone === 'caution'
        ? 'Ready with warnings'
        : 'Primary repo required';
  const submitHelper = !readiness.hasPrimaryRepository
    ? 'Bind one active primary repository before generating a plan.'
    : !input.trim()
      ? 'Describe the product change to generate a reviewable plan.'
      : 'CodingCTO will generate the plan for review. No code runs before approval.';
  const selectedType = useMemo(
    () => requirementTypes.find(item => item.value === requirementType) ?? requirementTypes[0],
    [requirementType]
  );
  const planningStages = projectPlanningStages({
    hasPrimaryRepository: readiness.hasPrimaryRepository,
    hasRequirementInput: Boolean(input.trim()),
    hasPlan: false,
    prNodeCount: 0,
    hasCompiledPrompt: false,
  });

  function applyExample(example: (typeof requirementExamples)[number]) {
    setInput(example.input);
    setConstraints(example.constraints);
    setRequirementType(example.type);
    setMessage('');
  }

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
      const planHref = projectPlanHref(context.project.id, bundle.implementation_plan.id);
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
                readinessTone === 'ready'
                  ? 'border-success/30 text-success'
                  : readinessTone === 'caution'
                    ? 'border-warning/30 text-warning'
                  : 'border-warning/30 text-warning'
              }
            >
              {readinessLabel}
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

        <div className="mt-5">
          <ProjectPlanningFlowCard
            stages={planningStages}
            title="Requirement planning path"
            description="This is the first complete CodingCTO loop: project context, requirement, generated plan, PR DAG, and prompt preview."
          />
        </div>

        <form className="mt-5 space-y-4" onSubmit={submitRequirement}>
          <div className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <Label htmlFor="requirement-input">Product change</Label>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  A strong input names the outcome, business rules, non-goals, and verification
                  expectations.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {requirementExamples.map(example => (
                  <Button
                    key={example.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyExample(example)}
                  >
                    <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                    {example.label}
                  </Button>
                ))}
              </div>
            </div>
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
              <Label htmlFor="requirement-type">Requirement type</Label>
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
              <Label htmlFor="requirement-constraints">
                Constraints, non-goals, and test expectations
              </Label>
              <Textarea
                id="requirement-constraints"
                value={constraints}
                onChange={event => setConstraints(event.target.value)}
                className="min-h-28 bg-bg-surface text-sm leading-6"
                placeholder="Optional: non-goals, risk boundaries, rollout notes, existing issue link, or testing expectations."
              />
            </div>
          </div>
          <div className="grid gap-2 rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm md:grid-cols-3">
            <NextStep
              icon={<ScrollText className="h-4 w-4" />}
              title="Plan"
              description="Product plan, technical plan, and assumptions."
            />
            <NextStep
              icon={<Workflow className="h-4 w-4" />}
              title="PR DAG"
              description="Large but reviewable implementation slices."
            />
            <NextStep
              icon={<ShieldCheck className="h-4 w-4" />}
              title="Approval"
              description="Execution waits until a human approves the plan."
            />
          </div>
          {message ? (
            <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-5 text-text-muted">
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit || createRequirement.isPending}>
              {createRequirement.isPending ? 'Generating plan' : 'Generate plan for review'}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button asChild type="button" variant="outline">
              <Link href={projectContextHref(context.project.id)}>Review context</Link>
            </Button>
          </div>
          <p className="text-xs leading-5 text-text-muted">{submitHelper}</p>
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
          icon={<Workflow className="h-4 w-4" />}
          title="Plan inputs"
          value="Context drives every generated artifact"
          caption="Repo profiles, architecture snapshots, skills, and guardrails will be used for the product plan, technical plan, PR DAG, and prompts."
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

function NextStep({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="mt-0.5 text-text-muted">{icon}</div>
      <div className="min-w-0">
        <div className="font-medium text-text-main">{title}</div>
        <p className="mt-0.5 text-xs leading-5 text-text-muted">{description}</p>
      </div>
    </div>
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
