package execution

import (
	"context"
	"strconv"
	"strings"

	agentcontract "github.com/zgiai/luas/api/internal/contracts/agent"
	"github.com/zgiai/luas/api/internal/domain"
)

const (
	CodingAgentConnectorProtocolVersion = agentcontract.ProtocolVersion

	CodingAgentTaskKindPRNode = agentcontract.TaskKindPRNode
	CodingAgentTaskKindDirect = agentcontract.TaskKindDirect
)

// CodingAgentConnector is the stable boundary between CodingCTO runtime tasks
// and the concrete coding agent implementation, such as Codex CLI.
type CodingAgentConnector interface {
	Name() string
	ProtocolVersion() string
	Capabilities() CodingAgentConnectorCapabilities
	Run(ctx context.Context, envelope CodingAgentTaskEnvelope, reporter ProgressReporter) (*ExecutionResult, error)
}

type CodingAgentConnectorCapabilities struct {
	Executor       string
	SupportsPRDAG  bool
	SupportsDirect bool
	StreamsEvents  bool
	UsesMCP        bool
}

type CodingAgentTaskEnvelope struct {
	ProtocolVersion string
	Kind            string
	RuntimeID       string
	Executor        string
	SessionID       string
	TaskID          uint
	RunID           string
	RepositoryID    string
	BranchName      string
	Workdir         string
	Env             map[string]string
	Prompt          CompiledExecutionPrompt
	PRNode          *ClaimedTaskPRNode
}

func (e CodingAgentTaskEnvelope) ToProtocol() agentcontract.AgentTaskEnvelope {
	envelope := agentcontract.AgentTaskEnvelope{
		ProtocolVersion: e.ProtocolVersion,
		Kind:            e.Kind,
		RuntimeID:       e.RuntimeID,
		Executor:        e.Executor,
		SessionID:       e.SessionID,
		TaskID:          e.TaskID,
		RunID:           e.RunID,
		RepositoryID:    e.RepositoryID,
		BranchName:      e.BranchName,
		Workdir:         e.Workdir,
		Env:             e.Env,
		Prompt: agentcontract.AgentPrompt{
			ID:       e.Prompt.ID,
			PRNodeID: e.Prompt.PRNodeID,
			Type:     e.Prompt.Type,
			Version:  e.Prompt.Version,
			Text:     e.Prompt.PromptText,
		},
	}
	if e.PRNode != nil {
		envelope.PRNode = &agentcontract.AgentPRNode{
			ID:                 e.PRNode.ID,
			RepositoryID:       e.PRNode.RepositoryID,
			NodeKey:            e.PRNode.NodeKey,
			Title:              e.PRNode.Title,
			Type:               e.PRNode.Type,
			Goal:               e.PRNode.Goal,
			DependsOn:          append([]string(nil), e.PRNode.DependsOn...),
			ExpectedFiles:      append([]string(nil), e.PRNode.ExpectedFiles...),
			NonGoals:           append([]string(nil), e.PRNode.NonGoals...),
			AcceptanceCriteria: append([]string(nil), e.PRNode.AcceptanceCriteria...),
			TestCommands:       append([]string(nil), e.PRNode.TestCommands...),
			BranchName:         e.PRNode.BranchName,
			EvidenceRefs:       append([]string(nil), e.PRNode.EvidenceRefs...),
		}
		envelope.EvidenceRefs = append(envelope.EvidenceRefs, e.PRNode.EvidenceRefs...)
	}
	return envelope
}

func NewCLIConnector(executor CodeExecutor) CodingAgentConnector {
	return &cliConnector{executor: executor}
}

type cliConnector struct {
	executor CodeExecutor
}

func (c *cliConnector) Name() string {
	if c == nil || c.executor == nil {
		return ""
	}
	return c.executor.Name()
}

func (c *cliConnector) ProtocolVersion() string {
	return CodingAgentConnectorProtocolVersion
}

func (c *cliConnector) Capabilities() CodingAgentConnectorCapabilities {
	name := c.Name()
	return CodingAgentConnectorCapabilities{
		Executor:       name,
		SupportsPRDAG:  true,
		SupportsDirect: true,
		StreamsEvents:  true,
		UsesMCP:        false,
	}
}

func (c *cliConnector) Run(ctx context.Context, envelope CodingAgentTaskEnvelope, reporter ProgressReporter) (*ExecutionResult, error) {
	if c == nil || c.executor == nil || strings.TrimSpace(envelope.Workdir) == "" || strings.TrimSpace(envelope.Prompt.PromptText) == "" {
		return nil, domain.ErrInvalidInput
	}
	if progressExecutor, ok := c.executor.(ProgressReportingExecutor); ok {
		progressExecutor.SetProgressReporter(reporter)
	}
	return c.executor.Run(ctx, ExecutionContext{
		RunID:      envelope.RunID,
		TaskID:     envelope.TaskID,
		Workdir:    envelope.Workdir,
		BranchName: envelope.BranchName,
		Env:        envelope.Env,
	}, envelope.Prompt)
}

func PRNodeTaskEnvelope(runtimeID, executor, sessionID, workdir string, claim *ClaimAgentTaskResponse) (CodingAgentTaskEnvelope, error) {
	if claim == nil || claim.Task == nil || claim.Prompt == nil || claim.ExecutionContext == nil {
		return CodingAgentTaskEnvelope{}, domain.ErrInvalidInput
	}
	return CodingAgentTaskEnvelope{
		ProtocolVersion: CodingAgentConnectorProtocolVersion,
		Kind:            CodingAgentTaskKindPRNode,
		RuntimeID:       strings.TrimSpace(runtimeID),
		Executor:        firstNonEmpty(executor, claim.Task.Executor),
		SessionID:       firstNonEmpty(sessionID, claim.Task.SessionID),
		TaskID:          claim.Task.ID,
		RunID:           uintString(claim.Task.RunID),
		RepositoryID:    strings.TrimSpace(claim.ExecutionContext.RepositoryID),
		BranchName:      strings.TrimSpace(claim.ExecutionContext.BranchName),
		Workdir:         firstNonEmpty(workdir, claim.Task.Workdir),
		PRNode:          claim.PRNode,
		Prompt: CompiledExecutionPrompt{
			ID:         claim.Prompt.ID,
			PRNodeID:   claim.Task.PRNodeID,
			Type:       claim.Prompt.Type,
			Version:    claim.Prompt.Version,
			PromptText: claim.Prompt.PromptText,
		},
	}, nil
}

func DirectTaskEnvelope(runtimeID, executor, sessionID, workdir string, claim *ClaimAgentTaskResponse) (CodingAgentTaskEnvelope, error) {
	if claim == nil || claim.DirectTask == nil || claim.Prompt == nil || claim.ExecutionContext == nil {
		return CodingAgentTaskEnvelope{}, domain.ErrInvalidInput
	}
	return CodingAgentTaskEnvelope{
		ProtocolVersion: CodingAgentConnectorProtocolVersion,
		Kind:            CodingAgentTaskKindDirect,
		RuntimeID:       strings.TrimSpace(runtimeID),
		Executor:        firstNonEmpty(executor, claim.DirectTask.Executor),
		SessionID:       firstNonEmpty(sessionID, claim.DirectTask.SessionID),
		TaskID:          claim.DirectTask.ID,
		RunID:           "direct-" + uintString(claim.DirectTask.ID),
		RepositoryID:    strings.TrimSpace(claim.ExecutionContext.RepositoryID),
		BranchName:      strings.TrimSpace(claim.ExecutionContext.BranchName),
		Workdir:         firstNonEmpty(workdir, claim.DirectTask.Workdir),
		Prompt: CompiledExecutionPrompt{
			ID:         claim.Prompt.ID,
			Type:       claim.Prompt.Type,
			Version:    claim.Prompt.Version,
			PromptText: claim.Prompt.PromptText,
		},
	}, nil
}

func uintString(value uint) string {
	if value == 0 {
		return ""
	}
	return strconv.FormatUint(uint64(value), 10)
}
