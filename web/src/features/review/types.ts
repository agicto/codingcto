import type { PRNode } from '@/features/specforge/types';

export type ReviewDecisionStatus = 'pending' | 'approved' | 'rejected' | 'expired';
export type ReviewCheckStatus = 'ready' | 'attention' | 'blocked';

export interface ReviewDecision {
  id: number;
  prNodeId: number;
  status: Exclude<ReviewDecisionStatus, 'pending'>;
  headSha: string;
  reason?: string;
  decidedBy: number;
  decidedAt: string;
  expiredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewDecisionCheck {
  key: string;
  label: string;
  status: ReviewCheckStatus;
  detail: string;
  required: boolean;
}

export interface ReviewDecisionState {
  prNode: PRNode;
  decision?: ReviewDecision;
  decisionStatus: ReviewDecisionStatus;
  mergeReady: boolean;
  summary: string;
  nextAction: string;
  checks: ReviewDecisionCheck[];
}

export interface MergeRequestResult {
  prNode: PRNode;
  decision?: ReviewDecision;
  decisionStatus: ReviewDecisionStatus;
  mergeAccepted: boolean;
  mergeMessage: string;
  mergeSha?: string;
}
