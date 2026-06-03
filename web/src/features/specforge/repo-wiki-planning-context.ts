import type { RepoProfile } from '@/features/specforge/types';

export type RepoWikiPlanningContextState = 'ready' | 'waiting' | 'blocked';

export interface RepoWikiPlanningContextSection {
  id: 'overview' | 'structure' | 'quality' | 'risk' | 'conventions';
  label: string;
  state: RepoWikiPlanningContextState;
  detail: string;
  evidenceCount: number;
}

export interface RepoWikiPlanningContextSummary {
  state: RepoWikiPlanningContextState;
  readyCount: number;
  totalCount: number;
  scorePercent: number;
  nextAction: string;
  sections: RepoWikiPlanningContextSection[];
}

interface RepoWikiSnapshotEvidence {
  summary?: string;
  modules?: string[];
  entrypoints?: string[];
  test_commands?: string[];
  ci_workflows?: string[];
  risk_areas?: string[];
}

export function repoWikiPlanningContext(
  repoProfile: RepoProfile,
  snapshot?: RepoWikiSnapshotEvidence
): RepoWikiPlanningContextSummary {
  const summary = firstText(snapshot?.summary, repoProfile.summary);
  const modules = firstList(snapshot?.modules, repoProfile.stack);
  const entrypoints = snapshot?.entrypoints ?? [];
  const testCommands = firstList(snapshot?.test_commands, repoProfile.testCommands);
  const ciWorkflows = snapshot?.ci_workflows ?? [];
  const riskAreas = firstList(snapshot?.risk_areas, repoProfile.riskAreas);
  const conventions = repoProfile.codingConventions;

  const sections: RepoWikiPlanningContextSection[] = [
    {
      id: 'overview',
      label: '仓库总览',
      evidenceCount: countValues([repoProfile.repositoryId, summary]),
      state: repoProfile.repositoryId.trim() && summary.trim() ? 'ready' : 'blocked',
      detail: summary.trim()
        ? '产品专家可以理解现有系统边界和已有能力。'
        : '缺少仓库摘要，PRD 容易脱离现有产品和模块边界。',
    },
    {
      id: 'structure',
      label: '结构入口',
      evidenceCount: modules.length + entrypoints.length,
      state: modules.length > 0 || entrypoints.length > 0 ? 'ready' : 'blocked',
      detail:
        modules.length > 0 || entrypoints.length > 0
          ? '架构专家可以判断影响范围、模块依赖和改动入口。'
          : '缺少模块或入口信息，技术计划无法可靠约束影响范围。',
    },
    {
      id: 'quality',
      label: '测试质量',
      evidenceCount: testCommands.length + ciWorkflows.length,
      state: testCommands.length > 0 || ciWorkflows.length > 0 ? 'ready' : 'blocked',
      detail:
        testCommands.length > 0 || ciWorkflows.length > 0
          ? 'QA 专家可以把测试命令和 CI 期望写入 PR 节点。'
          : '缺少测试或 CI 证据，执行前需要补充质量检查。',
    },
    {
      id: 'risk',
      label: '风险区域',
      evidenceCount: riskAreas.length,
      state: riskAreas.length > 0 ? 'ready' : 'waiting',
      detail:
        riskAreas.length > 0
          ? '架构和安全风险会进入计划审批与 Prompt 约束。'
          : '未识别风险区域；低风险需求可继续，但高风险计划需要人工补充。',
    },
    {
      id: 'conventions',
      label: '工程约定',
      evidenceCount: conventions.length,
      state: conventions.length > 0 ? 'ready' : 'waiting',
      detail:
        conventions.length > 0
          ? 'Coding Agent 可以遵循既有命名、目录、测试和代码风格。'
          : '缺少工程约定；Prompt 会要求 Codex 先从仓库现状推断。',
    },
  ];

  const readyCount = sections.filter(section => section.state === 'ready').length;
  const blockedCount = sections.filter(section => section.state === 'blocked').length;
  const scorePercent = Math.round((readyCount / sections.length) * 100);
  const state =
    blockedCount > 0 ? 'blocked' : readyCount === sections.length ? 'ready' : 'waiting';

  return {
    state,
    readyCount,
    totalCount: sections.length,
    scorePercent,
    nextAction: nextActionForSections(sections),
    sections,
  };
}

function nextActionForSections(sections: RepoWikiPlanningContextSection[]) {
  const blocked = sections.find(section => section.state === 'blocked');
  if (blocked) {
    return `先补齐${blocked.label}，再让专家生成或确认计划。`;
  }

  const waiting = sections.find(section => section.state === 'waiting');
  if (waiting) {
    return `可以继续计划；建议补充${waiting.label}以提升 Prompt 约束。`;
  }

  return 'Wiki 已可作为产品、架构、QA 和 Coding Agent 的计划上下文。';
}

function firstText(...values: Array<string | undefined>) {
  return values.find(value => value?.trim()) ?? '';
}

function firstList(...values: Array<string[] | undefined>) {
  return values.find(value => value && value.length > 0) ?? [];
}

function countValues(values: string[]) {
  return values.filter(value => value.trim().length > 0).length;
}
