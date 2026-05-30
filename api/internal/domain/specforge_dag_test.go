package domain

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExecutableSpecForgePRDAG(t *testing.T) {
	valid := validSpecForgePRDAG()
	require.True(t, ExecutableSpecForgePRDAG(valid))

	cases := []struct {
		name   string
		mutate func([]*SpecForgePRNode) []*SpecForgePRNode
	}{
		{name: "too many nodes", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			for len(nodes) <= MaxSpecForgeMVPPRNodes {
				node := *nodes[len(nodes)-1]
				node.Order = len(nodes) + 1
				node.NodeKey = fmt.Sprintf("PR-%03d", node.Order)
				node.BranchName = fmt.Sprintf("specforge/extra-%02d", node.Order)
				nodes = append(nodes, &node)
			}
			return nodes
		}},
		{name: "missing scope", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			nodes[0].ExpectedFiles = nil
			return nodes
		}},
		{name: "duplicate branch", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			nodes[1].BranchName = nodes[0].BranchName
			return nodes
		}},
		{name: "unknown dependency", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			nodes[1].DependsOn = []string{"PR-404"}
			return nodes
		}},
		{name: "self dependency", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			nodes[1].DependsOn = []string{nodes[1].NodeKey}
			return nodes
		}},
		{name: "out of order dependency", mutate: func(nodes []*SpecForgePRNode) []*SpecForgePRNode {
			nodes[0].DependsOn = []string{nodes[1].NodeKey}
			return nodes
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			nodes := validSpecForgePRDAG()
			nodes = tc.mutate(nodes)
			require.False(t, ExecutableSpecForgePRDAG(nodes))
		})
	}
}

func validSpecForgePRDAG() []*SpecForgePRNode {
	return []*SpecForgePRNode{
		{
			NodeKey:            "PR-001",
			RepositoryID:       "repo_123",
			Order:              1,
			Title:              "Foundation",
			Goal:               "Prepare the implementation boundary.",
			ExpectedFiles:      []string{"api/internal/modules"},
			NonGoals:           []string{"Do not broaden scope."},
			AcceptanceCriteria: []string{"Foundation is independently reviewable."},
			TestCommands:       []string{"go test ./..."},
			BranchName:         "specforge/pr-001",
		},
		{
			NodeKey:            "PR-002",
			RepositoryID:       "repo_123",
			Order:              2,
			Title:              "Implementation",
			Goal:               "Implement the feature slice.",
			DependsOn:          []string{"PR-001"},
			ExpectedFiles:      []string{"api/internal/modules"},
			NonGoals:           []string{"Do not broaden scope."},
			AcceptanceCriteria: []string{"Implementation is independently reviewable."},
			TestCommands:       []string{"go test ./..."},
			BranchName:         "specforge/pr-002",
		},
	}
}
