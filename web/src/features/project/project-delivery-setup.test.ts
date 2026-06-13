import { describe, expect, it } from 'vitest';

import { projectDeliverySetupChecklist } from '@/features/project/project-delivery-setup';

describe('projectDeliverySetupChecklist', () => {
  it('blocks start until a primary repository is bound', () => {
    const summary = projectDeliverySetupChecklist({
      hasRepository: false,
      githubReady: false,
      githubChecking: false,
      githubBlockingCheckCount: 0,
      issueTitle: 'Test issue',
      issueBody: 'Test body',
      impactAcknowledged: true,
    });

    expect(summary.canStart).toBe(false);
    expect(summary.items.find(item => item.id === 'repository')?.state).toBe('blocked');
    expect(summary.items.find(item => item.id === 'github')?.state).toBe('waiting');
    expect(summary.nextAction).toContain('项目主仓库');
  });

  it('shows GitHub readiness as waiting while checks are in progress', () => {
    const summary = projectDeliverySetupChecklist({
      hasRepository: true,
      githubChecking: true,
      githubBlockingCheckCount: 0,
      issueTitle: 'Test issue',
      issueBody: 'Test body',
      impactAcknowledged: true,
    });

    expect(summary.canStart).toBe(false);
    expect(summary.items.find(item => item.id === 'github')?.state).toBe('waiting');
    expect(summary.nextAction).toContain('GitHub 仓库权限');
  });

  it('blocks start when GitHub readiness reports required failures', () => {
    const summary = projectDeliverySetupChecklist({
      hasRepository: true,
      githubReady: false,
      githubChecking: false,
      githubBlockingCheckCount: 2,
      issueTitle: 'Test issue',
      issueBody: 'Test body',
      impactAcknowledged: true,
    });

    expect(summary.canStart).toBe(false);
    expect(summary.items.find(item => item.id === 'github')?.detail).toContain('2 个');
  });

  it('blocks start until the requirement and formal consent are complete', () => {
    const summary = projectDeliverySetupChecklist({
      hasRepository: true,
      githubReady: true,
      githubChecking: false,
      githubBlockingCheckCount: 0,
      issueTitle: '',
      issueBody: 'Body',
      impactAcknowledged: false,
    });

    expect(summary.canStart).toBe(false);
    expect(summary.items.find(item => item.id === 'requirement')?.state).toBe('blocked');
    expect(summary.items.find(item => item.id === 'consent')?.state).toBe('blocked');
  });

  it('allows start when all setup conditions are ready', () => {
    const summary = projectDeliverySetupChecklist({
      hasRepository: true,
      githubReady: true,
      githubChecking: false,
      githubBlockingCheckCount: 0,
      issueTitle: 'Test issue',
      issueBody: 'Test body',
      impactAcknowledged: true,
    });

    expect(summary.canStart).toBe(true);
    expect(summary.readyCount).toBe(summary.totalCount);
    expect(summary.headline).toContain('已具备启动条件');
  });
});
