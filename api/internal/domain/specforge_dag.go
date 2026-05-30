package domain

import "strings"

const MaxSpecForgeMVPPRNodes = 5

func ExecutableSpecForgePRDAG(nodes []*SpecForgePRNode) bool {
	if len(nodes) == 0 || len(nodes) > MaxSpecForgeMVPPRNodes {
		return false
	}
	keys := make(map[string]int, len(nodes))
	orders := make(map[string]int, len(nodes))
	branches := make(map[string]int, len(nodes))
	for _, node := range nodes {
		if node == nil {
			return false
		}
		key := strings.TrimSpace(node.NodeKey)
		branch := strings.TrimSpace(node.BranchName)
		if key == "" || branch == "" || strings.TrimSpace(node.Title) == "" || strings.TrimSpace(node.Goal) == "" {
			return false
		}
		if len(node.ExpectedFiles) == 0 || len(node.NonGoals) == 0 || len(node.AcceptanceCriteria) == 0 || len(node.TestCommands) == 0 {
			return false
		}
		keys[key]++
		if keys[key] > 1 {
			return false
		}
		orders[key] = node.Order
		branches[branch]++
		if branches[branch] > 1 {
			return false
		}
	}
	for _, node := range nodes {
		for _, dependency := range node.DependsOn {
			dependency = strings.TrimSpace(dependency)
			if dependency == "" || dependency == node.NodeKey {
				return false
			}
			dependencyOrder, ok := orders[dependency]
			if !ok || dependencyOrder >= node.Order {
				return false
			}
		}
	}
	return !hasSpecForgePRDAGCycle(nodes)
}

func hasSpecForgePRDAGCycle(nodes []*SpecForgePRNode) bool {
	nodesByKey := make(map[string]*SpecForgePRNode, len(nodes))
	for _, node := range nodes {
		if node != nil && strings.TrimSpace(node.NodeKey) != "" {
			nodesByKey[strings.TrimSpace(node.NodeKey)] = node
		}
	}
	const (
		visiting = 1
		visited  = 2
	)
	states := make(map[string]int, len(nodesByKey))
	var visit func(string) bool
	visit = func(key string) bool {
		switch states[key] {
		case visiting:
			return true
		case visited:
			return false
		}
		states[key] = visiting
		node := nodesByKey[key]
		if node == nil {
			states[key] = visited
			return false
		}
		for _, dependency := range node.DependsOn {
			dependency = strings.TrimSpace(dependency)
			if dependency == "" {
				continue
			}
			if visit(dependency) {
				return true
			}
		}
		states[key] = visited
		return false
	}
	for key := range nodesByKey {
		if visit(key) {
			return true
		}
	}
	return false
}
