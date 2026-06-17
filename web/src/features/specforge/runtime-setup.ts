export interface RuntimeSetupCommandInput {
  repoDir: string;
  once?: boolean;
}

export function buildRuntimeSetupCommand(input: RuntimeSetupCommandInput): string {
  const args = ['ccto up'];
  if (input.once) {
    args.push('--once');
  }

  return [
    `cd ${shellQuote(input.repoDir)}`,
    args.join(' '),
  ].join('\n');
}

export function runtimeSetupChecklist({
  repositoryId,
  readyRuntimeCount,
}: {
  repositoryId: string;
  readyRuntimeCount: number;
}): string[] {
  if (readyRuntimeCount > 0) {
    return [
      `${readyRuntimeCount} 个可写的本地 agent 在线。`,
      `本地 agent 应已发现 ${repositoryId}。`,
      '确认计划后，可以派发已选择的 PR 节点。',
    ];
  }

  return [
    '在本机安装 ccto CLI。',
    `在 ${repositoryId} 对应的本地 Git 仓库运行 ccto up。`,
    '确认终端已安装并登录你要使用的 CLI，例如 Codex、Claude 或 Kimi。',
    '等本地 agent 心跳显示在线后，再回到这里继续。',
  ];
}

function shellQuote(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9_./:@-]+$/.test(clean)) {
    return clean;
  }
  return `'${clean.replaceAll("'", "'\"'\"'")}'`;
}
