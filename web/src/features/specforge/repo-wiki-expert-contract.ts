import type {
  RepoWikiPlanningContextSection,
  RepoWikiPlanningContextSummary,
  RepoWikiPlanningContextState,
} from '@/features/specforge/repo-wiki-planning-context';

export type RepoWikiExpertContractStageID =
  | 'product'
  | 'architecture'
  | 'qa'
  | 'coding-agent';

export interface RepoWikiExpertContractStage {
  id: RepoWikiExpertContractStageID;
  label: string;
  state: RepoWikiPlanningContextState;
  input: string;
  output: string;
  promptRefs: string[];
  nextAction: string;
}

export interface RepoWikiExpertContract {
  headline: string;
  canWritePlan: boolean;
  canCompilePrompt: boolean;
  nextAction: string;
  stages: RepoWikiExpertContractStage[];
}

export function repoWikiExpertContract(
  summary: RepoWikiPlanningContextSummary,
  hasPlan: boolean
): RepoWikiExpertContract {
  const stages: RepoWikiExpertContractStage[] = [
    {
      id: 'product',
      label: '产品专家',
      state: sectionState(summary, 'overview'),
      input: '仓库总览、业务边界、已有入口',
      output: 'PRD、用户价值、验收标准、非目标',
      promptRefs: ['repo_wiki.summary', 'repo_wiki.planning_context_sections.overview'],
      nextAction: hasPlan ? '核对 PRD 是否引用仓库事实。' : '用 Wiki 约束需求输入和 PRD。',
    },
    {
      id: 'architecture',
      label: '架构专家',
      state: worstState(sectionState(summary, 'structure'), sectionState(summary, 'risk')),
      input: '模块结构、入口文件、风险区域',
      output: '影响范围、PR 节点顺序、迁移和回滚策略',
      promptRefs: [
        'repo_wiki.stack',
        'repo_wiki.entrypoints',
        'repo_wiki.risk_areas',
      ],
      nextAction: hasPlan ? '确认 PR DAG 和影响范围。' : '先生成技术计划和任务拆解。',
    },
    {
      id: 'qa',
      label: 'QA 专家',
      state: sectionState(summary, 'quality'),
      input: '测试命令、CI 工作流、质量门',
      output: '测试策略、回归范围、失败恢复规则',
      promptRefs: ['repo_wiki.test_commands', 'repo_wiki.ci_workflows', 'quality_gates'],
      nextAction: '把测试命令和失败恢复写进每个 PR 节点。',
    },
    {
      id: 'coding-agent',
      label: 'Coding Agent',
      state: hasPlan ? summary.state : 'waiting',
      input: 'PR DAG、文件范围、Skill 约束、Wiki 证据',
      output: '可执行 Prompt、测试报告、PR 节点结果',
      promptRefs: [
        'repo_wiki.planning_context_state',
        'skill_contract',
        'scope_guardrails',
      ],
      nextAction: hasPlan ? '检查 Prompt 契约后调度 Codex。' : '等待专家计划生成。',
    },
  ];
  const canWritePlan = summary.state !== 'blocked';
  const canCompilePrompt = hasPlan && canWritePlan;

  return {
    headline: canCompilePrompt
      ? 'Repo Wiki 已进入专家计划和 Coding Agent Prompt。'
      : canWritePlan
        ? 'Repo Wiki 可用于写计划，Prompt 需要先生成计划。'
        : 'Repo Wiki 证据不足，先补齐阻塞项再写计划。',
    canWritePlan,
    canCompilePrompt,
    nextAction: canCompilePrompt
      ? '检查 Prompt 契约，确认每个 PR 节点都引用 Wiki、Skill 和质量门。'
      : canWritePlan
        ? '继续录入需求或评审计划，让专家基于 Wiki 输出 PR DAG。'
        : summary.nextAction,
    stages,
  };
}

function sectionState(
  summary: RepoWikiPlanningContextSummary,
  id: RepoWikiPlanningContextSection['id']
) {
  return summary.sections.find(section => section.id === id)?.state ?? 'blocked';
}

function worstState(
  ...states: Array<RepoWikiPlanningContextState | undefined>
): RepoWikiPlanningContextState {
  if (states.includes('blocked')) {
    return 'blocked';
  }
  if (states.includes('waiting')) {
    return 'waiting';
  }
  return 'ready';
}
