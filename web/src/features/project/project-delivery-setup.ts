export type ProjectDeliverySetupState = 'ready' | 'waiting' | 'blocked';

export interface ProjectDeliverySetupItem {
  id: 'repository' | 'github' | 'requirement' | 'consent';
  label: string;
  state: ProjectDeliverySetupState;
  detail: string;
}

export interface ProjectDeliverySetupSummary {
  canStart: boolean;
  readyCount: number;
  totalCount: number;
  headline: string;
  nextAction: string;
  items: ProjectDeliverySetupItem[];
}

export function projectDeliverySetupChecklist({
  hasRepository,
  githubReady,
  githubChecking,
  githubBlockingCheckCount,
  issueTitle,
  issueBody,
  impactAcknowledged,
}: {
  hasRepository: boolean;
  githubReady?: boolean;
  githubChecking: boolean;
  githubBlockingCheckCount: number;
  issueTitle: string;
  issueBody: string;
  impactAcknowledged: boolean;
}): ProjectDeliverySetupSummary {
  const hasRequirement = Boolean(issueTitle.trim() && issueBody.trim());
  const items: ProjectDeliverySetupItem[] = [
    {
      id: 'repository',
      label: '项目主仓库',
      state: hasRepository ? 'ready' : 'blocked',
      detail: hasRepository
        ? '已绑定 primary repository，正式执行只会写入这个仓库。'
        : '先绑定一个可写的 primary repository。',
    },
    {
      id: 'github',
      label: 'GitHub 仓库权限',
      state: !hasRepository
        ? 'waiting'
        : githubReady
          ? 'ready'
          : githubChecking
            ? 'waiting'
            : 'blocked',
      detail: githubReady
        ? 'GitHub 账号连接、访问令牌和必需仓库权限已通过检查。'
        : githubChecking
          ? '正在检查 GitHub 连接、token 和仓库权限。'
          : githubBlockingCheckCount > 0
            ? `${githubBlockingCheckCount} 个 GitHub readiness 检查阻塞正式试跑。`
            : '等待 GitHub readiness 检查结果。',
    },
    {
      id: 'requirement',
      label: '试跑需求',
      state: hasRequirement ? 'ready' : 'blocked',
      detail: hasRequirement
        ? 'Issue 标题和需求说明会进入 PRD、计划和 Codex Prompt。'
        : '补齐 Issue 标题和需求说明后才能创建试跑任务。',
    },
    {
      id: 'consent',
      label: '正式执行确认',
      state: impactAcknowledged ? 'ready' : 'blocked',
      detail: impactAcknowledged
        ? '已确认本次试跑会创建 Issue、提交代码、推送分支并尝试打开 PR。'
        : '确认正式执行影响后，才能启动真实端到端试跑。',
    },
  ];
  const readyCount = items.filter(item => item.state === 'ready').length;
  const blocked = items.find(item => item.state === 'blocked');
  const waiting = items.find(item => item.state === 'waiting');
  const current = blocked ?? waiting;

  return {
    canStart: readyCount === items.length,
    readyCount,
    totalCount: items.length,
    headline:
      readyCount === items.length
        ? '真实端到端试跑已具备启动条件。'
        : `${readyCount}/${items.length} 个启动条件已就绪。`,
    nextAction: current ? `${current.label}: ${current.detail}` : '可以启动正式试跑。',
    items,
  };
}
