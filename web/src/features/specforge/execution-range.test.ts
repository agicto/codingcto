import { describe, expect, it } from 'vitest';

import {
  executionRangeReview,
  selectExecutionNode,
} from '@/features/specforge/execution-range';
import { demoPlan } from '@/features/specforge/mock-data';

const nodes = demoPlan.prNodes;

describe('execution range selection', () => {
  it('selects dependencies when selecting a downstream PR node', () => {
    expect(selectExecutionNode(nodes, [], nodes[2].id, true)).toEqual([
      nodes[0].id,
      nodes[1].id,
      nodes[2].id,
    ]);
  });

  it('removes dependent PR nodes when clearing an upstream dependency', () => {
    expect(
      selectExecutionNode(
        nodes,
        nodes.map((node) => node.id),
        nodes[1].id,
        false
      )
    ).toEqual([nodes[0].id]);
  });

  it('reports dependency-complete ranges as executable', () => {
    expect(executionRangeReview(nodes, [nodes[0].id, nodes[1].id])).toEqual([
      'Execution range review: 2 PR nodes are selected with dependencies included.',
    ]);
  });

  it('reports missing dependencies', () => {
    expect(executionRangeReview(nodes, [nodes[1].id])).toEqual([
      'Execution range review: PR-002 requires PR-001; include the dependency or remove this node.',
    ]);
  });
});
