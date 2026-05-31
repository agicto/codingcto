export interface RuntimeSetupCommandInput {
  apiBaseUrl: string;
  runtimeTokenEnv?: string;
  runtimeId: string;
  repositoryId: string;
  repoDir: string;
  once?: boolean;
}

export function buildRuntimeSetupCommand(input: RuntimeSetupCommandInput): string {
  const runtimeTokenEnv = input.runtimeTokenEnv?.trim() || 'SPECFORGE_RUNTIME_TOKEN';
  const args = [
    'go run ./cmd/specforge-runtime',
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
    const runtimeLabel = readyRuntimeCount === 1 ? 'runtime is' : 'runtimes are';
    return [
      `${readyRuntimeCount} writable Codex ${runtimeLabel} online.`,
      `Runtime repository guard should match ${repositoryId}.`,
      'Approve & Start can dispatch selected PR nodes.',
    ];
  }

  return [
    'Create a runtime token for a signed-in CodingCTO user.',
    `Run the runtime from this repository and point it at ${repositoryId}.`,
    'Keep Codex CLI installed and authenticated in the runtime shell.',
    'Return here after the runtime heartbeat appears online.',
  ];
}

function shellQuote(value: string): string {
  const clean = value.trim();
  if (/^[A-Za-z0-9_./:@-]+$/.test(clean)) {
    return clean;
  }
  return `'${clean.replaceAll("'", "'\"'\"'")}'`;
}
