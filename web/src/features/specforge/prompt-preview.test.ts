import { describe, expect, it } from 'vitest';

import { demoPlan } from '@/features/specforge/mock-data';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';

describe('buildPromptPreview', () => {
  it('includes the node scope, constraints, and test plan', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0]);

    expect(prompt).toContain('你正在实现 PR-001');
    expect(prompt).toContain('目标：');
    expect(prompt).toContain('非目标：');
    expect(prompt).toContain('不构建 UI。');
    expect(prompt).toContain('测试命令：');
    expect(prompt).toContain('go test ./...');
    expect(prompt).toContain('实现后：');
  });

  it('renders empty lists explicitly', () => {
    const prompt = buildPromptPreview(demoPlan, {
      ...demoPlan.prNodes[0],
      dependsOn: [],
      expectedFiles: [],
      testCommands: [],
    });

    expect(prompt).toContain('依赖：\n- 无');
    expect(prompt).toContain('预期文件：\n- 无');
    expect(prompt).toContain('测试命令：\n- 无');
  });
});
