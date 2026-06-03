import { describe, expect, it } from 'vitest';

import {
  boardParamFromWorkItem,
  workItemFromBoardParam,
  type WorkItemID,
} from '@/features/specforge/board-routing';

describe('board routing', () => {
  it('maps board query params to workbench views', () => {
    expect(workItemFromBoardParam('manual')).toBe('orchestration');
    expect(workItemFromBoardParam('orchestration')).toBe('orchestration');
    expect(workItemFromBoardParam('intake')).toBe('intake');
    expect(workItemFromBoardParam('context')).toBe('context');
    expect(workItemFromBoardParam('wiki')).toBe('wiki');
    expect(workItemFromBoardParam('repo-wiki')).toBe('wiki');
    expect(workItemFromBoardParam('knowledge')).toBe('wiki');
    expect(workItemFromBoardParam('plan')).toBe('plan');
    expect(workItemFromBoardParam('prompt')).toBe('dag');
    expect(workItemFromBoardParam('dag')).toBe('dag');
    expect(workItemFromBoardParam('delivery')).toBe('delivery');
    expect(workItemFromBoardParam('board')).toBe('delivery');
    expect(workItemFromBoardParam('pr')).toBe('delivery');
    expect(workItemFromBoardParam('pull-requests')).toBe('delivery');
    expect(workItemFromBoardParam('run')).toBe('run');
    expect(workItemFromBoardParam('execution')).toBe('run');
    expect(workItemFromBoardParam('tasks')).toBe('run');
    expect(workItemFromBoardParam('review')).toBe('review');
    expect(workItemFromBoardParam('quality')).toBe('review');
    expect(workItemFromBoardParam('qa')).toBe('review');
  });

  it('normalizes case, whitespace, and unknown board params', () => {
    expect(workItemFromBoardParam(' Review ')).toBe('review');
    expect(workItemFromBoardParam('PROMPT')).toBe('dag');
    expect(workItemFromBoardParam('unknown')).toBeUndefined();
    expect(workItemFromBoardParam(null)).toBeUndefined();
  });

  it('maps workbench views back to canonical board query params', () => {
    const expected: Record<WorkItemID, string> = {
      orchestration: 'manual',
      delivery: 'delivery',
      intake: 'intake',
      wiki: 'wiki',
      context: 'context',
      plan: 'plan',
      dag: 'prompt',
      run: 'run',
      review: 'review',
    };

    for (const [item, board] of Object.entries(expected)) {
      expect(boardParamFromWorkItem(item as WorkItemID)).toBe(board);
    }
  });
});
