import type { PRNode } from '@/features/specforge/types';

export function selectExecutionNode(
  nodes: PRNode[],
  selectedNodeIds: string[],
  nodeId: string,
  checked: boolean
): string[] {
  if (checked) {
    return orderedSelectedNodeIds(nodes, new Set([...selectedNodeIds, ...dependencyIdsForNode(nodes, nodeId)]));
  }

  const next = new Set(selectedNodeIds);
  next.delete(nodeId);
  for (const dependentID of dependentIdsForNode(nodes, nodeId)) {
    next.delete(dependentID);
  }
  return orderedSelectedNodeIds(nodes, next);
}

export function executionRangeReview(nodes: PRNode[], selectedNodeIds: string[]): string[] {
  if (selectedNodeIds.length === 0) {
    return ['Execution range review: select at least one PR node before starting execution.'];
  }

  const selectedNodeKeys = new Set(
    nodes.filter((node) => selectedNodeIds.includes(node.id)).map((node) => node.nodeKey)
  );
  const notes: string[] = [];
  for (const node of nodes) {
    if (!selectedNodeIds.includes(node.id)) {
      continue;
    }
    for (const dependency of node.dependsOn) {
      if (!selectedNodeKeys.has(dependency)) {
        notes.push(
          `Execution range review: ${node.nodeKey} requires ${dependency}; include the dependency or remove this node.`
        );
      }
    }
  }

  return notes.length > 0
    ? notes
    : [`Execution range review: ${selectedNodeIds.length} PR ${selectedNodeIds.length === 1 ? 'node is' : 'nodes are'} selected with dependencies included.`];
}

function dependencyIdsForNode(nodes: PRNode[], nodeId: string): string[] {
  const nodesByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return [];
  }

  const selected = new Set<string>([node.id]);
  const visit = (current: PRNode) => {
    for (const dependencyKey of current.dependsOn) {
      const dependency = nodesByKey.get(dependencyKey);
      if (!dependency || selected.has(dependency.id)) {
        continue;
      }
      selected.add(dependency.id);
      visit(dependency);
    }
  };
  visit(node);
  return [...selected];
}

function dependentIdsForNode(nodes: PRNode[], nodeId: string): string[] {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return [];
  }

  const selected = new Set<string>();
  const visit = (dependencyKey: string) => {
    for (const candidate of nodes) {
      if (!candidate.dependsOn.includes(dependencyKey) || selected.has(candidate.id)) {
        continue;
      }
      selected.add(candidate.id);
      visit(candidate.nodeKey);
    }
  };
  visit(node.nodeKey);
  return [...selected];
}

function orderedSelectedNodeIds(nodes: PRNode[], selectedNodeIds: Set<string>): string[] {
  return nodes.filter((node) => selectedNodeIds.has(node.id)).map((node) => node.id);
}
