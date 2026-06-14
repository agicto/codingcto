package agent

const (
	ProtocolVersion = "codingcto.agent.protocol.v1"

	TaskKindPRNode = "pr_node"
	TaskKindDirect = "direct"
)

type AgentTaskEnvelope struct {
	ProtocolVersion   string            `json:"protocol_version"`
	Kind              string            `json:"kind"`
	RuntimeID         string            `json:"runtime_id,omitempty"`
	Executor          string            `json:"executor,omitempty"`
	SessionID         string            `json:"session_id,omitempty"`
	TaskID            uint              `json:"task_id,omitempty"`
	RunID             string            `json:"run_id,omitempty"`
	RepositoryID      string            `json:"repository_id,omitempty"`
	BranchName        string            `json:"branch_name,omitempty"`
	Workdir           string            `json:"workdir,omitempty"`
	Env               map[string]string `json:"env,omitempty"`
	Prompt            AgentPrompt       `json:"prompt"`
	PRNode            *AgentPRNode      `json:"pr_node,omitempty"`
	EvidenceRefs      []string          `json:"evidence_refs,omitempty"`
	PermissionProfile string            `json:"permission_profile,omitempty"`
	ToolPolicy        *ToolPolicy       `json:"tool_policy,omitempty"`
}

type AgentPrompt struct {
	ID           uint     `json:"id,omitempty"`
	PRNodeID     uint     `json:"pr_node_id,omitempty"`
	Type         string   `json:"type,omitempty"`
	Version      string   `json:"version,omitempty"`
	Text         string   `json:"text"`
	Hash         string   `json:"hash,omitempty"`
	EvidenceRefs []string `json:"evidence_refs,omitempty"`
}

type AgentPRNode struct {
	ID                 uint     `json:"id,omitempty"`
	RepositoryID       string   `json:"repository_id,omitempty"`
	NodeKey            string   `json:"node_key,omitempty"`
	Title              string   `json:"title,omitempty"`
	Type               string   `json:"type,omitempty"`
	Goal               string   `json:"goal,omitempty"`
	DependsOn          []string `json:"depends_on,omitempty"`
	ExpectedFiles      []string `json:"expected_files,omitempty"`
	NonGoals           []string `json:"non_goals,omitempty"`
	AcceptanceCriteria []string `json:"acceptance_criteria,omitempty"`
	TestCommands       []string `json:"test_commands,omitempty"`
	BranchName         string   `json:"branch_name,omitempty"`
	EvidenceRefs       []string `json:"evidence_refs,omitempty"`
}

type ToolPolicy struct {
	ApprovalPolicy string              `json:"approval_policy,omitempty"`
	SandboxPolicy  string              `json:"sandbox_policy,omitempty"`
	CommandRules   []CommandPrefixRule `json:"command_rules,omitempty"`
}

type CommandPrefixRule struct {
	Pattern       []string `json:"pattern"`
	Decision      string   `json:"decision,omitempty"`
	Justification string   `json:"justification,omitempty"`
}
