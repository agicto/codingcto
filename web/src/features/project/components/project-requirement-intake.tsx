'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, GitBranch, Lightbulb, ListChecks, ScrollText, Sparkles, Workflow } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ProjectAdvancedDetails,
  ProjectCommandHeader,
  ProjectReadinessStrip,
  ProjectWorkflowStepper,
  type ProjectReadinessStripItem,
  type ProjectWorkflowStep,
} from '@/features/project/components/project-flow-primitives';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
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
    ? 'blocked'
    : readiness.warningCount > 0 || readiness.skillCount === 0
      ? 'waiting'
      : 'ready';
  const readinessLabel =
    readinessTone === 'ready'
      ? 'Planning ready'
      : readinessTone === 'waiting'
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
  const readinessStrip: ProjectReadinessStripItem[] = [
    {
      label: 'Project',
      value: context.project.name,
      helper: context.project.description || 'No project description yet.',
      tone: 'ready',
    },
    {
      label: 'Primary repository',
      value: primaryRepository?.repository.repository_id ?? 'Missing',
      helper: readiness.summary,
      tone: readiness.hasPrimaryRepository ? 'ready' : 'blocked',
    },
    {
      label: 'Context readiness',
      value: readiness.nextAction,
      helper: `${readiness.activeRepositoryCount} repos · ${readiness.skillCount} skills`,
      tone: readinessTone,
    },
    {
      label: 'Plan safety',
      value: 'Approval required',
      helper: 'No code runs before plan approval.',
      tone: 'waiting',
    },
  ];
  const workflowSteps: ProjectWorkflowStep[] = [
    {
      id: 'context',
      label: 'Context',
      description: readiness.hasPrimaryRepository ? 'Primary repository selected' : 'Repository required',
      status: readiness.hasPrimaryRepository ? 'complete' : 'blocked',
    },
    {
      id: 'requirement',
      label: 'Requirement',
      description: 'Capture one product outcome',
      status: readiness.hasPrimaryRepository ? 'current' : 'blocked',
    },
    {
      id: 'plan',
      label: 'Plan',
      description: 'Generate product and technical plan',
      status: 'waiting',
    },
    {
      id: 'approve',
      label: 'Approve',
      description: 'Review PR DAG before execution',
      status: 'waiting',
    },
  ];

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
    <main className="mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-5 overflow-y-auto px-4 py-6 md:px-8">
      <ProjectCommandHeader
        title="Create a product requirement"
        description="Describe the product outcome once. CodingCTO will generate a product plan, technical plan, PR DAG, and scoped implementation prompts."
        badges={[
          { label: 'Requirement intake' },
          { label: readinessLabel, tone: readinessTone },
        ]}
        secondaryActions={[
          {
            label: 'Review context',
            href: projectContextHref(context.project.id),
            variant: 'outline',
          },
        ]}
      />

      <ProjectReadinessStrip items={readinessStrip} />
      <ProjectWorkflowStepper steps={workflowSteps} />

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
        <form className="space-y-4" onSubmit={submitRequirement}>
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
          <p className="text-xs leading-5 text-text-muted">{submitHelper}</p>
        </form>
      </section>

      <ProjectAdvancedDetails
        title="Advanced planning context"
        description="Project context still informs the generated plan, but it does not need to dominate the intake form."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <ContextBlock
            icon={<Sparkles className="h-4 w-4" />}
            title="Project"
            value={context.project.name}
            caption={context.project.description || 'No project description yet.'}
          />
          <ContextBlock
            icon={<GitBranch className="h-4 w-4" />}
            title="Primary repository"
            value={primaryRepository?.repository.repository_id ?? 'Missing'}
            caption={readiness.summary}
          />
          <ContextBlock
            icon={<ListChecks className="h-4 w-4" />}
            title="Context readiness"
            value={readiness.nextAction}
            caption={`${readiness.activeRepositoryCount} repos · ${readiness.skillCount} skills · ${readiness.warningCount} warnings`}
          />
          <ContextBlock
            icon={<Workflow className="h-4 w-4" />}
            title="Plan inputs"
            value="Context drives every generated artifact"
            caption="Repo profiles, architecture snapshots, skills, and guardrails will be used for the plan, PR DAG, and prompts."
          />
          <ContextBlock
            icon={<ScrollText className="h-4 w-4" />}
            title="Human checkpoint"
            value="Plan approval remains required"
            caption="This page creates a recommended plan. Execution waits for explicit approval."
          />
        </div>
        {!readiness.hasPrimaryRepository ? (
          <Alert className="mt-4">
            <AlertTitle>Primary repository required</AlertTitle>
            <AlertDescription>
              Requirement generation needs one writable primary repository.
            </AlertDescription>
          </Alert>
        ) : null}
      </ProjectAdvancedDetails>
    </main>
  );
}

function ContextBlock({
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
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-main">
        <span className="text-text-muted">{icon}</span>
        {title}
      </div>
      <div className="mt-2 text-sm font-medium leading-5 text-text-main">{value}</div>
      <p className="mt-1 text-xs leading-5 text-text-muted">{caption}</p>
    </div>
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
