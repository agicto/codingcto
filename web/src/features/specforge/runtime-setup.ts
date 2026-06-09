export interface RuntimeSetupCommandInput {
  apiBaseUrl: string;
  runtimeTokenEnv?: string;
  runtimeId: string;
  repositoryId: string;
  repoDir: string;
  once?: boolean;
}

export function buildRuntimeSetupCommand(input: RuntimeSetupCommandInput): string {
  const runtimeTokenEnv = input.runtimeTokenEnv?.trim() || 'CODINGCTO_RUNTIME_TOKEN';
  const args = [
    'go run ./cmd/ccto daemon',
    `  --api-base-url ${shellQuote(input.apiBaseUrl)}`,
    `  --token "$${runtimeTokenEnv}"`,
    `  --runtime-id ${shellQuote(input.runtimeId)}`,
    `  --repo-dir ${shellQuote(input.repoDir)}`,
    `  --repository-id ${shellQuote(input.repositoryId)}`,
  ];
  if (input.once) {
    args.push('  --once');
  }

  return [
    'cd api',
    `export ${runtimeTokenEnv}="paste-runtime-token-here"`,
    args.join(' \\\n'),
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
      `${readyRuntimeCount} 个可写的 Codex 运行器在线。`,
      `运行器的仓库保护应匹配 ${repositoryId}。`,
      '确认计划后，可以派发已选择的 PR 节点。',
    ];
  }

  return [
    '为已登录的 CodingCTO 用户创建运行器令牌。',
    `在本仓库启动运行器，并指向 ${repositoryId}。`,
    '确认运行器所在终端已安装并登录 Codex CLI。',
    '等运行器心跳显示在线后，再回到这里继续。',
  ];
}

function shellQuote(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9_./:@-]+$/.test(clean)) {
    return clean;
  }
  return `'${clean.replaceAll("'", "'\"'\"'")}'`;
}
