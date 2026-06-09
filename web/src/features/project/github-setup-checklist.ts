export type GitHubSetupChecklistState = 'ready' | 'waiting' | 'blocked';

export interface GitHubSetupChecklistItem {
  id: 'workspace' | 'enabled' | 'install_entry' | 'synced_repositories';
  label: string;
  state: GitHubSetupChecklistState;
  detail: string;
}

export interface GitHubSetupChecklistSummary {
  readyCount: number;
  totalCount: number;
  canRecoverReadiness: boolean;
  headline: string;
  nextAction: string;
  items: GitHubSetupChecklistItem[];
}

export function githubSetupChecklist({
  workspaceId,
  enabled,
  installURL,
  connectedRepositoryCount,
}: {
  workspaceId: string;
  enabled: boolean;
  installURL: string;
  connectedRepositoryCount: number;
}): GitHubSetupChecklistSummary {
  const hasWorkspace = Boolean(workspaceId.trim());
  const hasInstallURL = Boolean(installURL.trim());
  const hasSyncedRepositories = connectedRepositoryCount > 0;
  const items: GitHubSetupChecklistItem[] = [
    {
      id: 'workspace',
      label: '工作区已选择',
      state: hasWorkspace ? 'ready' : 'blocked',
      detail: hasWorkspace
        ? 'GitHub App installation 会绑定到当前工作区。'
        : '安装或同步 GitHub App 前，请先选择工作区。',
    },
    {
      id: 'enabled',
      label: 'GitHub 已启用',
      state: enabled ? 'ready' : 'blocked',
      detail: enabled
        ? 'CodingCTO 可以使用 GitHub 仓库和 PR 交付 API。'
        : '安装 App 或派发 PR 节点前，请先启用 GitHub。',
    },
    {
      id: 'install_entry',
      label: '安装入口已配置',
      state: hasInstallURL ? 'ready' : 'blocked',
      detail: hasInstallURL
        ? '安装按钮可以带着 workspace state 打开 GitHub App installation。'
        : '请配置 NEXT_PUBLIC_GITHUB_APP_INSTALL_URL 或 NEXT_PUBLIC_GITHUB_APP_SLUG，设置页才能打开安装入口。',
    },
    {
      id: 'synced_repositories',
      label: '仓库已同步',
      state: !hasWorkspace ? 'waiting' : hasSyncedRepositories ? 'ready' : 'blocked',
      detail: hasSyncedRepositories
        ? `已同步 ${connectedRepositoryCount} 个 GitHub App 可访问仓库。`
        : '安装或重新同步 GitHub App，然后把目标仓库绑定到项目。',
    },
  ];
  const readyCount = items.filter(item => item.state === 'ready').length;
  const current = items.find(item => item.state === 'blocked') ?? items.find(item => item.state === 'waiting');

  return {
    readyCount,
    totalCount: items.length,
    canRecoverReadiness: readyCount === items.length,
    headline:
      readyCount === items.length
        ? 'GitHub App 设置已经满足仓库 readiness。'
        : `${readyCount}/${items.length} 个 GitHub App 设置步骤已就绪。`,
    nextAction: current ? `${current.label}: ${current.detail}` : '返回项目并重新检查 readiness。',
    items,
  };
}
