'use client';

import { CheckCircle2, CircleDot, Play, ScrollText, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { planApprovalReadiness } from '@/features/specforge/plan-approval';
import { decisionFieldsForPlan } from '@/features/specforge/plan-decisions';
import {
  canStartExecutionRange,
  executionRangeReview,
  selectExecutionNode,
} from '@/features/specforge/execution-range';
import type { ExecutionReadiness } from '@/features/specforge/execution-readiness';
import { useSpecForgePlanSkillRuns } from '@/features/specforge/hooks/use-specforge';
import type { SpecForgeSkillRunDTO } from '@/features/specforge/services/specforge-service';
import type { PlanBundle, PRNode } from '@/features/specforge/types';
import { statusClassName } from '@/features/specforge/components/workbench-utils';

export function PlanReview({
  plan,
  decisionOverrides,
  selectedExecutionNodeIds,
  approved,
  isStarting,
  executionReadiness,
  onDecisionOverrideChange,
  onExecutionNodeSelectionChange,
  onApprove,
}: {
  plan: PlanBundle;
  decisionOverrides: Record<string, string>;
  selectedExecutionNodeIds: string[];
  approved: boolean;
  isStarting: boolean;
  executionReadiness: ExecutionReadiness;
  onDecisionOverrideChange: (key: string, value: string) => void;
  onExecutionNodeSelectionChange: (nodeIds: string[]) => void;
  onApprove: () => void;
}) {
  const { productSpec, implementationPlan } = plan;
  const approvalReadiness = planApprovalReadiness(plan);
  const executionRangeNotes = executionRangeReview(plan.prNodes, selectedExecutionNodeIds);
  const canStartSelectedRange = canStartExecutionRange(plan.prNodes, selectedExecutionNodeIds);
  const decisionFields = decisionFieldsForPlan(plan);
  const planAssumptions = productSpec.assumptions.filter(
    item => !item.startsWith('PR DAG review:')
  );
  const skillRunsQuery = useSpecForgePlanSkillRuns(plan.planId);
  const skillRuns = skillRunsQuery.data?.skill_runs ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product understanding</CardTitle>
          <CardDescription>Defaults and acceptance criteria before execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="Goals" items={productSpec.goals} />
          <ListBlock title="Business rules" items={productSpec.businessRules} />
          <DecisionOverrideFields
            fields={decisionFields}
            values={decisionOverrides}
            disabled={approved || isStarting}
            onChange={onDecisionOverrideChange}
          />
          <ListBlock title="Acceptance criteria" items={productSpec.acceptanceCriteria} />
          <ListBlock title="Plan assumptions" items={planAssumptions} />
          <SkillPipelinePanel
            skillRuns={skillRuns}
            isLoading={skillRunsQuery.isLoading}
            isOffline={skillRunsQuery.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Technical plan</CardTitle>
          <CardDescription>{implementationPlan.technicalSummary}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <ListBlock title="Affected areas" items={implementationPlan.affectedAreas} />
          <ListBlock title="PR DAG review" items={plan.prDagReview} />
          <ExecutionRangeSelector
            nodes={plan.prNodes}
            selectedNodeIds={selectedExecutionNodeIds}
            disabled={approved || isStarting}
            onChange={onExecutionNodeSelectionChange}
          />
          <ListBlock title="Execution range review" items={executionRangeNotes} />
          <ListBlock title="Security risks" items={implementationPlan.securityRisks} icon="risk" />
          <ListBlock title="Migration risks" items={implementationPlan.migrationRisks} />
          {!approvalReadiness.canApprove && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              {approvalReadiness.reason}
            </p>
          )}
          {!canStartSelectedRange && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              Select at least one PR node before starting execution.
            </p>
          )}
          {!executionReadiness.canDispatch && (
            <p className="rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-warning">
              {executionReadiness.reason}
            </p>
          )}
          <Button
            onClick={onApprove}
            disabled={
              approved ||
              isStarting ||
              !approvalReadiness.canApprove ||
              !canStartSelectedRange ||
              !executionReadiness.canDispatch
            }
            className="w-full justify-center"
          >
            {approved ? 'Approved' : isStarting ? 'Starting run' : 'Approve & Start'}
            {approved ? (
              <CheckCircle2 className="ml-1.5 h-4 w-4" />
            ) : (
              <Play className="ml-1.5 h-4 w-4" />
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SkillPipelinePanel({
  skillRuns,
  isLoading,
  isOffline,
}: {
  skillRuns: SpecForgeSkillRunDTO[];
  isLoading: boolean;
  isOffline: boolean;
}) {
  const stages = skillRuns.length
    ? skillRuns
    : [
        {
          id: 0,
          stage: 'product_plan',
          status: 'pending',
          input_summary: '',
          output_summary: 'Product understanding will be recorded when the API generates a plan.',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 1,
          stage: 'technical_plan',
          status: 'pending',
          input_summary: '',
          output_summary: 'Technical planning history will appear here for API-generated plans.',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
        {
          id: 2,
          stage: 'pr_dag',
          status: 'pending',
          input_summary: '',
          output_summary: 'PR DAG generation will be tracked as a skill run.',
          created_by: 0,
          created_at: '',
          updated_at: '',
        },
      ];

  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ScrollText className="h-4 w-4 text-primary" />
          Skill pipeline
        </div>
        <Badge
          variant="outline"
          className={skillRuns.length > 0 ? statusClassName('completed') : ''}
        >
          {isLoading ? 'Checking' : skillRuns.length > 0 ? `${skillRuns.length} runs` : 'Pending'}
        </Badge>
      </div>
      {isOffline ? (
        <p className="mt-2 text-xs leading-5 text-text-muted">
          Skill run history will load when the CodingCTO backend is available.
        </p>
      ) : null}
      <div className="mt-3 space-y-2">
        {stages.map(run => (
          <div
            key={`${run.stage}-${run.id}`}
            className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium uppercase text-text-subtle">
                {skillRunStageLabel(run.stage)}
              </span>
              <Badge variant="outline" className={statusClassName(run.status)}>
                {run.status}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
              {run.output_summary || 'No output recorded yet.'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function skillRunStageLabel(stage: string) {
  const labels: Record<string, string> = {
    product_plan: 'Product plan',
    technical_plan: 'Technical plan',
    pr_dag: 'PR DAG',
    self_review: 'Self review',
  };
  return labels[stage] ?? stage.replaceAll('_', ' ');
}

function ExecutionRangeSelector({
  nodes,
  selectedNodeIds,
  disabled,
  onChange,
}: {
  nodes: PRNode[];
  selectedNodeIds: string[];
  disabled: boolean;
  onChange: (nodeIds: string[]) => void;
}) {
  const selected = new Set(selectedNodeIds);

  function toggleNode(nodeId: string, checked: boolean) {
    onChange(selectExecutionNode(nodes, selectedNodeIds, nodeId, checked));
  }

  return (
    <div>
      <h3 className="text-sm font-medium">Execution range</h3>
      <div className="mt-3 space-y-3">
        {nodes.map(node => (
          <div
            key={node.id}
            className="flex items-start justify-between gap-3 rounded-md border border-border-subtle px-3 py-2"
          >
            <div>
              <div className="text-sm font-medium">
                {node.nodeKey}: {node.title}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                Depends on {node.dependsOn.length > 0 ? node.dependsOn.join(', ') : 'none'}
              </div>
            </div>
            <Switch
              checked={selected.has(node.id)}
              disabled={disabled}
              onCheckedChange={checked => toggleNode(node.id, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionOverrideFields({
  fields,
  values,
  disabled,
  onChange,
}: {
  fields: ReturnType<typeof decisionFieldsForPlan>;
  values: Record<string, string>;
  disabled: boolean;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-medium">Key decisions</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {fields.map(field => (
          <div key={field.key} className="space-y-1.5">
            <Label htmlFor={`decision-${field.key}`}>{field.label}</Label>
            <Input
              id={`decision-${field.key}`}
              value={values[field.key] ?? ''}
              disabled={disabled}
              onChange={event => onChange(field.key, event.target.value)}
            />
            <p className="text-xs leading-5 text-text-muted">{field.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon?: 'risk' }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {icon === 'risk' && <ShieldAlert className="h-4 w-4 text-warning" />}
        {title}
      </h3>
      <ul className="mt-2 space-y-2 text-sm leading-6 text-text-muted">
        {items.length === 0 && (
          <li className="flex gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-text-muted" />
            <span>None recorded.</span>
          </li>
        )}
        {items.map(item => (
          <li key={item} className="flex gap-2">
            <CircleDot className="mt-1.5 h-3 w-3 shrink-0 text-primary" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

