import { describe, expect, it } from 'vitest';

import { buildRuntimeSetupCommand, runtimeSetupChecklist } from '@/features/specforge/runtime-setup';

describe('runtime setup', () => {
  it('builds a local ccto agent command for one execution cycle', () => {
    const command = buildRuntimeSetupCommand({
      repoDir: '/Users/example/codingcto',
      once: true,
    });

    expect(command).toContain('cd /Users/example/codingcto');
    expect(command).toContain('ccto up --once');
    expect(command).not.toContain('--api-base-url');
    expect(command).not.toContain('ccto configure');
    expect(command).toContain('--once');
  });

  it('quotes shell values with spaces', () => {
    const command = buildRuntimeSetupCommand({
      repoDir: '/Users/example/My Project',
    });

    expect(command).toContain("cd '/Users/example/My Project'");
    expect(command).toContain('ccto up');
    expect(command).not.toContain('--repo-root');
    expect(command).not.toContain('--once');
  });

  it('summarizes runtime setup before and after readiness', () => {
    expect(
      runtimeSetupChecklist({ repositoryId: 'repo_123', readyRuntimeCount: 0 })
    ).toContain('确认终端已安装并登录你要使用的 CLI，例如 Codex、Claude 或 Kimi。');
    expect(
      runtimeSetupChecklist({ repositoryId: 'repo_123', readyRuntimeCount: 2 })
    ).toContain('2 个可写的本地 agent 在线。');
  });
});
