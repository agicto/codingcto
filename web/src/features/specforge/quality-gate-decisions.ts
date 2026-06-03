import type { PlanBundle } from '@/features/specforge/types';

const STORAGE_PREFIX = 'codingcto:quality-gate-decisions';

export function qualityGateDecisionStorageKey({
  projectId,
  plan,
}: {
  projectId?: number;
  plan: PlanBundle;
}) {
  const planKey = plan.planId ? `plan:${plan.planId}` : `idea:${stableKeyPart(plan.idea)}`;
  const projectKey = projectId ? `project:${projectId}` : 'workspace';
  const repoKey = stableKeyPart(plan.repoProfile.repositoryId || 'repo');
  return `${STORAGE_PREFIX}:${projectKey}:${repoKey}:${planKey}`;
}

export function readRiskGateAccepted(key: string) {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(key) === 'risk.accepted';
  } catch {
    return false;
  }
}

export function writeRiskGateAccepted(key: string, accepted: boolean) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (accepted) {
      window.localStorage.setItem(key, 'risk.accepted');
      return;
    }
    window.localStorage.removeItem(key);
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
}

function stableKeyPart(value: string) {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'unknown';
}
