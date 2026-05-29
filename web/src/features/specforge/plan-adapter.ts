import type {
  SpecForgePlanBundleDTO,
  SpecForgePRNodeDTO,
  SpecForgeRepoProfileDTO,
} from '@/features/specforge/services/specforge-service';
import type {
  ImplementationPlan,
  PlanBundle,
  PRNode,
  RepoProfile,
} from '@/features/specforge/types';

const nodeTypes = new Set<PRNode['type']>(['foundation', 'api', 'ui', 'verification']);
const riskLevels = new Set<PRNode['estimatedRisk']>(['low', 'medium', 'high']);
const nodeStatuses = new Set<PRNode['status']>([
  'planned',
  'queued',
  'running',
  'waiting_on_dependencies',
  'completed',
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
  return nodeStatuses.has(status as PRNode['status'])
    ? (status as PRNode['status'])
    : 'planned';
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
  };
}

function implementationStatus(status: string): ImplementationPlan['status'] {
  return status === 'approved' ? 'approved' : 'draft';
}

function prNodeFromDTO(node: SpecForgePRNodeDTO): PRNode {
  return {
    id: String(node.id),
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
    status: coerceNodeStatus(node.status),
  };
}

export function planBundleFromDTO(bundle: SpecForgePlanBundleDTO): PlanBundle {
  return {
    idea: bundle.idea.raw_input,
    repoProfile: repoProfileFromDTO(bundle.repo_profile, bundle.idea.repository_id),
    productSpec: {
      goals: bundle.product_spec.goals ?? [],
      businessRules: bundle.product_spec.business_rules ?? [],
      permissionRules: bundle.product_spec.permission_rules ?? [],
      acceptanceCriteria: bundle.product_spec.acceptance_criteria ?? [],
      assumptions: bundle.product_spec.assumptions ?? [],
    },
    implementationPlan: {
      technicalSummary: bundle.implementation_plan.technical_summary,
      affectedAreas: bundle.implementation_plan.affected_areas ?? [],
      securityRisks: bundle.implementation_plan.security_risks ?? [],
      migrationRisks: bundle.implementation_plan.migration_risks ?? [],
      status: implementationStatus(bundle.implementation_plan.status),
    },
    prNodes: (bundle.pr_nodes ?? []).map(prNodeFromDTO),
  };
}
