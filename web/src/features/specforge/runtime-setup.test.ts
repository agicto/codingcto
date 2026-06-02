import { describe, expect, it } from 'vitest';

import { buildRuntimeSetupCommand, runtimeSetupChecklist } from '@/features/specforge/runtime-setup';

describe('runtime setup', () => {
  it('builds a local Codex runtime command for one execution cycle', () => {
    const command = buildRuntimeSetupCommand({
      apiBaseUrl: 'http://localhost:2010/v1',
      runtimeId: 'local-codex-plan-42',
      repositoryId: 'repo_123',
      repoDir: '/Users/example/codingcto',
      once: true,
    });

    expect(command).toContain('cd api');
    expect(command).toContain('export CODINGCTO_RUNTIME_TOKEN="paste-runtime-token-here"');
    expect(command).toContain('go run ./cmd/ccto daemon');
    expect(command).toContain('--api-base-url http://localhost:2010/v1');
    expect(command).toContain('--runtime-id local-codex-plan-42');
    expect(command).toContain('--repo-dir /Users/example/codingcto');
    expect(command).toContain('--repository-id repo_123');
    expect(command).toContain('--once');
  });

  it('quotes shell values with spaces', () => {
    const command = buildRuntimeSetupCommand({
      apiBaseUrl: 'https://api.example.com/v1',
      runtimeId: 'local codex',
      repositoryId: 'owner/repo',
      repoDir: '/Users/example/My Project',
    });

    expect(command).toContain("--runtime-id 'local codex'");
    expect(command).toContain("--repo-dir '/Users/example/My Project'");
    expect(command).not.toContain('--once');
  });

  it('summarizes runtime setup before and after readiness', () => {
    expect(
      runtimeSetupChecklist({ repositoryId: 'repo_123', readyRuntimeCount: 0 })
    ).toContain('确认运行器所在终端已安装并登录 Codex CLI。');
    expect(
      runtimeSetupChecklist({ repositoryId: 'repo_123', readyRuntimeCount: 2 })
    ).toContain('2 个可写的 Codex 运行器在线。');
  });
});
