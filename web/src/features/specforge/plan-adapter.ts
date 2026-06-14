import type {
  SpecForgeExecutionBundleDTO,
  SpecForgePlanBundleDTO,
  SpecForgePRNodeDTO,
  SpecForgeRepoProfileDTO,
} from '@/features/specforge/services/specforge-service';
import type {
  ExecutionRun,
  ImplementationPlan,
  PlanContextSnapshot,
  PlanExpertPolicy,
  PlanBundle,
  PRNode,
  RepoProfile,
} from '@/features/specforge/types';

const nodeTypes = new Set<PRNode['type']>([
  'foundation',
  'backend',
  'frontend',
  'implementation',
  'api',
  'ui',
  'verification',
]);
const riskLevels = new Set<PRNode['estimatedRisk']>(['low', 'medium', 'high']);
const nodeStatuses = new Set<PRNode['status']>([
  'planned',
  'queued',
  'running',
  'waiting_on_dependencies',
  'pr_opened',
  'ci_running',
  'ready_for_review',
  'blocked',
  'merged',
  'closed',
  'completed',
  'failed',
  'cancelled',
]);
const runStatuses = new Set<ExecutionRun['status']>([
  'queued',
  'running',
  'completed',
  'blocked',
  'cancelled',
]);

function coerceNodeType(type: string): PRNode['type'] {
  return nodeTypes.has(type as PRNode['type']) ? (type as PRNode['type']) : 'foundation';
}

function coerceRiskLevel(risk: string): PRNode['estimatedRisk'] {
  return riskLevels.has(risk as PRNode['estimatedRisk'])
    ? (risk as PRNode['estimatedRisk'])
    : 'medium';
}

function coerceNodeStatus(status: string): PRNode['status'] {
  if (status === 'dispatched') {
    return 'running';
  }
  return nodeStatuses.has(status as PRNode['status']) ? (status as PRNode['status']) : 'planned';
}

function coerceRunStatus(status: string): ExecutionRun['status'] {
  return runStatuses.has(status as ExecutionRun['status'])
    ? (status as ExecutionRun['status'])
    : 'idle';
}

function statusForExecutionTask(
  taskStatus: string,
  nodeStatus?: PRNode['status']
): PRNode['status'] {
  const coercedTaskStatus = coerceNodeStatus(taskStatus);
  if (
    nodeStatus === 'pr_opened' ||
    nodeStatus === 'ci_running' ||
    nodeStatus === 'ready_for_review' ||
    nodeStatus === 'blocked' ||
    nodeStatus === 'merged' ||
    nodeStatus === 'closed'
  ) {
    return nodeStatus;
  }
  return coercedTaskStatus;
}

function repoProfileFromDTO(
  repoProfile: SpecForgeRepoProfileDTO | undefined,
  repositoryId: string
): RepoProfile {
  return {
    repositoryId,
    defaultBranch: repoProfile?.default_branch ?? 'main',
    stack: repoProfile?.stack ?? [],
    testCommands: repoProfile?.test_commands ?? [],
    ciProvider: repoProfile?.ci_provider ?? 'unknown',
    codingConventions: repoProfile?.coding_conventions ?? [],
    riskAreas: repoProfile?.risk_areas ?? [],
    summary:
      repoProfile?.summary ??
      'Repository context has not been indexed yet. The generated plan is using available idea context only.',
    source: repoProfile?.source ?? 'unknown',
    warnings: repoProfile?.warnings ?? [],
    lastIndexedAt: repoProfile?.last_indexed_at,
  };
}

function implementationStatus(status: string): ImplementationPlan['status'] {
  return status === 'approved' ? 'approved' : 'draft';
}

function contextSnapshotFromDTO(bundle: SpecForgePlanBundleDTO): PlanContextSnapshot | undefined {
  const snapshot = bundle.context_snapshot;
  if (!snapshot) {
    return undefined;
  }
  return {
    id: snapshot.id,
    snapshotStatus: snapshot.snapshot_status,
    summary: snapshot.summary ?? '',
    primaryRepositoryId: snapshot.primary_repository_id,
    warningCount: snapshot.warning_count ?? 0,
    missingEvidence: snapshot.missing_evidence ?? [],
    createdAt: snapshot.created_at,
  };
}

function expertPolicyFromDTO(bundle: SpecForgePlanBundleDTO): PlanExpertPolicy | undefined {
  const policy = bundle.expert_policy;
  if (!policy) {
    return undefined;
  }
  return {
    id: policy.id,
    version: policy.version,
    goalBoundary: policy.goal_boundary ?? '',
    allowedPaths: policy.allowed_paths ?? [],
    forbiddenPaths: policy.forbidden_paths ?? [],
    requiredTestCommands: policy.required_test_commands ?? [],
    mergeStrategy: policy.merge_policy?.strategy,
    requireManualApproval: Boolean(policy.merge_policy?.require_manual_approval),
    allowAutoMerge: Boolean(policy.merge_policy?.allow_auto_merge),
    createdAt: policy.created_at,
  };
}

function prDAGReviewFromDTO(bundle: SpecForgePlanBundleDTO): string[] {
  if (bundle.pr_dag_review && bundle.pr_dag_review.length > 0) {
    return bundle.pr_dag_review;
  }
  return (bundle.product_spec.assumptions ?? []).filter(item => item.startsWith('PR DAG review:'));
}

export function prNodeFromDTO(node: SpecForgePRNodeDTO): PRNode {
  return {
    id: String(node.id),
    planId: node.plan_id,
    repositoryId: node.repository_id,
    nodeKey: node.node_key,
    order: node.order,
    title: node.title,
    type: coerceNodeType(node.type),
    goal: node.goal,
    dependsOn: node.depends_on ?? [],
    estimatedRisk: coerceRiskLevel(node.estimated_risk),
    expectedFiles: node.expected_files ?? [],
    nonGoals: node.non_goals ?? [],
    acceptanceCriteria: node.acceptance_criteria ?? [],
    testCommands: node.test_commands ?? [],
    branchName: node.branch_name,
    githubPrNumber: node.github_pr_number,
    githubPrUrl: node.github_pr_url,
    headSha: node.head_sha,
    status: coerceNodeStatus(node.status),
  };
}

export function planBundleFromDTO(bundle: SpecForgePlanBundleDTO): PlanBundle {
  return {
    ideaId: bundle.idea.id,
    planId: bundle.implementation_plan.id,
    idea: bundle.idea.raw_input,
    repoProfile: repoProfileFromDTO(bundle.repo_profile, bundle.idea.repository_id),
    contextSnapshot: contextSnapshotFromDTO(bundle),
    expertPolicy: expertPolicyFromDTO(bundle),
    productSpec: {
      goals: bundle.product_spec.goals ?? [],
      businessRules: bundle.product_spec.business_rules ?? [],
      permissionRules: bundle.product_spec.permission_rules ?? [],
      acceptanceCriteria: bundle.product_spec.acceptance_criteria ?? [],
      assumptions: bundle.product_spec.assumptions ?? [],
    },
    implementationPlan: {
      contextSnapshotId: bundle.implementation_plan.context_snapshot_id,
      expertPolicyId: bundle.implementation_plan.expert_policy_id,
      technicalSummary: bundle.implementation_plan.technical_summary,
      affectedAreas: bundle.implementation_plan.affected_areas ?? [],
      securityRisks: bundle.implementation_plan.security_risks ?? [],
      migrationRisks: bundle.implementation_plan.migration_risks ?? [],
      status: implementationStatus(bundle.implementation_plan.status),
    },
    prNodes: (bundle.pr_nodes ?? []).map(prNodeFromDTO),
    prDagReview: prDAGReviewFromDTO(bundle),
  };
}

export function executionRunFromDTO(
  bundle: SpecForgeExecutionBundleDTO,
  fallbackPlan?: PlanBundle
): { plan?: PlanBundle; run: ExecutionRun } {
  const plan = bundle.plan ? planBundleFromDTO(bundle.plan) : fallbackPlan;
  const nodesById = new Map((plan?.prNodes ?? []).map(node => [Number(node.id), node]));
  const tasks = bundle.tasks.map(task => {
    const node = nodesById.get(task.pr_node_id);
    return {
      ...(node ?? {
        id: String(task.pr_node_id),
        nodeKey: `PR-${task.pr_node_id}`,
        order: task.pr_node_id,
        title: `PR node ${task.pr_node_id}`,
        type: 'foundation' as const,
        goal: 'Execution task returned without plan node details.',
        dependsOn: [],
        estimatedRisk: 'medium' as const,
        expectedFiles: [],
        nonGoals: [],
        acceptanceCriteria: [],
        testCommands: [],
        branchName: '',
      }),
      taskId: task.id,
      executor: task.executor,
      runtimeId: task.runtime_id,
      sessionId: task.session_id,
      workdir: task.workdir,
      processStatus: task.process_status,
      currentPhase: task.current_phase,
      attemptNumber: task.attempt_number,
      fixAttemptId: task.fix_attempt_id,
      failureReason: task.failure_reason,
      logsUrl: task.logs_url,
      outputLog: task.output_log,
      errorLog: task.error_log,
      processRef: task.process_ref,
      lastProgressAt: task.last_progress_at,
      status: statusForExecutionTask(task.status, node?.status),
    };
  });

  return {
    plan,
    run: {
      runId: bundle.run.id,
      status: coerceRunStatus(bundle.run.status),
      startedAt: bundle.run.started_at,
      selectedPRNodeIds: (
        bundle.selected_pr_node_ids ?? bundle.tasks.map(task => task.pr_node_id)
      ).map(String),
      tasks,
    },
  };
}
