import { ROUTES } from '@/constants/routes';

export interface GitHubReadinessRecoveryCheck {
  key: string;
}

export interface GitHubReadinessRecoveryAction {
  id: 'github-settings' | 'repository-bindings';
  label: string;
  description: string;
  href: string;
}

export interface GitHubReadinessRecoveryTargetRepository {
  owner: string;
  repo: string;
  repositoryId?: string;
  returnTo?: string;
}

export function githubReadinessRecoveryTargetFromRepositoryId(
  repositoryId: string
): GitHubReadinessRecoveryTargetRepository | undefined {
  const match = repositoryId.trim().match(/^github_(.+?)__(.+)$/);
  if (!match) {
    return undefined;
  }
  return {
    owner: match[1],
    repo: match[2],
    repositoryId: repositoryId.trim(),
  };
}

export interface GitHubReadinessRecoveryDiagnostic {
  checkKey: string;
  setupStep: string;
  detail: string;
}

export function githubReadinessRecoveryActions(
  checks: GitHubReadinessRecoveryCheck[],
  targetRepository?: GitHubReadinessRecoveryTargetRepository
): GitHubReadinessRecoveryAction[] {
  const keys = new Set(checks.map(check => check.key));
  const actions: GitHubReadinessRecoveryAction[] = [];

  if (
    keys.has('settings') ||
    keys.has('installation') ||
    keys.has('installation_token') ||
    [...keys].some(key => key.startsWith('permission_'))
  ) {
    actions.push({
      id: 'github-settings',
      label: '去 GitHub 连接',
      description: '连接或同步 GitHub App，确认 token 和仓库写权限。',
      href: githubRecoveryHref('github', targetRepository),
    });
  }

  if (keys.has('repository')) {
    actions.push({
      id: 'repository-bindings',
      label: '去仓库绑定',
      description: '把已同步的 GitHub 仓库绑定为当前项目的 primary repository。',
      href: githubRecoveryHref('repositories', targetRepository),
    });
  }

  return actions;
}

function githubRecoveryHref(
  tab: 'github' | 'repositories',
  targetRepository?: GitHubReadinessRecoveryTargetRepository
) {
  const params = new URLSearchParams({ tab });
  if (targetRepository?.owner.trim() && targetRepository.repo.trim()) {
    params.set('owner', targetRepository.owner.trim());
    params.set('repo', targetRepository.repo.trim());
    params.set('repository_url', `https://github.com/${targetRepository.owner.trim()}/${targetRepository.repo.trim()}`);
  }
  if (targetRepository?.repositoryId?.trim()) {
    params.set('repository_id', targetRepository.repositoryId.trim());
  }
  if (targetRepository?.returnTo?.trim()) {
    params.set('return_to', targetRepository.returnTo.trim());
  }
  return `${ROUTES.CONSOLE.SETTINGS}?${params.toString()}`;
}

export function githubReadinessRecoveryDiagnostics(
  checks: GitHubReadinessRecoveryCheck[]
): GitHubReadinessRecoveryDiagnostic[] {
  return checks.map(check => {
    if (check.key === 'settings') {
      return {
        checkKey: check.key,
        setupStep: '启用 GitHub',
        detail: '先在设置里启用 GitHub，再检查仓库是否具备交付权限。',
      };
    }
    if (check.key === 'installation') {
      return {
        checkKey: check.key,
        setupStep: '同步仓库安装',
        detail: '安装或重新同步 GitHub App，再把同步后的仓库绑定到项目。',
      };
    }
    if (check.key === 'installation_token') {
      return {
        checkKey: check.key,
        setupStep: '检查 App 密钥',
        detail: '检查 GitHub App ID 和 private key 配置，然后重新同步 installation。',
      };
    }
    if (check.key.startsWith('permission_')) {
      return {
        checkKey: check.key,
        setupStep: '补充 App 权限',
        detail: `给 GitHub App installation 授权 ${permissionName(check.key)}，然后重新同步。`,
      };
    }
    if (check.key === 'repository') {
      return {
        checkKey: check.key,
        setupStep: '绑定项目仓库',
        detail: '把已同步的 GitHub 仓库绑定为当前项目的主仓库。',
      };
    }
    return {
      checkKey: check.key,
      setupStep: '恢复 GitHub readiness',
      detail: '检查 GitHub 连接和仓库选择，然后重新检查 readiness。',
    };
  });
}

function permissionName(key: string) {
  return key.replace(/^permission_/, '').replaceAll('_', ':');
}
