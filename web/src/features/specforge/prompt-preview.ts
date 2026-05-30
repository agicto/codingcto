import type { PlanBundle, PRNode } from '@/features/specforge/types';

function listSection(title: string, items: string[]) {
  if (!items.length) {
    return `${title}：\n- 无`;
  }
  return `${title}：\n${items.map((item) => `- ${item}`).join('\n')}`;
}

export function buildPromptPreview(plan: PlanBundle, node: PRNode) {
  return [
    `你正在实现 ${node.nodeKey}：${node.title}。`,
    '',
    '目标：',
    node.goal,
    '',
    '产品上下文：',
    plan.idea,
    '',
    listSection('产品目标', plan.productSpec.goals),
    '',
    listSection('验收标准', node.acceptanceCriteria),
    '',
    listSection('非目标', node.nonGoals),
    '',
    listSection('依赖', node.dependsOn),
    '',
    listSection('预期文件', node.expectedFiles),
    '',
    listSection('测试命令', node.testCommands),
    '',
    '约束：',
    '- 保持这个 PR 聚焦在节点目标内。',
    '- 不实现非目标内容。',
    '- 遵循检测到的仓库画像和现有约定。',
    '',
    '实现后：',
    '- 运行列出的测试。',
    '- 提交变更。',
    '- 准备 PR 摘要，包含范围、非目标、风险和测试计划。',
  ].join('\n');
}
