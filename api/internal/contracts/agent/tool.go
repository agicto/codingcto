package agent

import "time"

type ToolCallStatus string

const (
	ToolCallStatusPending   ToolCallStatus = "pending"
	ToolCallStatusRunning   ToolCallStatus = "running"
	ToolCallStatusCompleted ToolCallStatus = "completed"
	ToolCallStatusFailed    ToolCallStatus = "failed"
	ToolCallStatusCancelled ToolCallStatus = "cancelled"
)

// ToolCall is a provider-neutral representation of a model-requested tool call.
type ToolCall struct {
	ID            string         `json:"id,omitempty"`
	Name          string         `json:"name"`
	Namespace     string         `json:"namespace,omitempty"`
	ArgumentsJSON string         `json:"arguments_json,omitempty"`
	StartedAt     *time.Time     `json:"started_at,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

// ToolResult is the provider-neutral result paired with a ToolCall.
type ToolResult struct {
	CallID      string         `json:"call_id,omitempty"`
	Name        string         `json:"name"`
	Status      ToolCallStatus `json:"status"`
	OutputJSON  string         `json:"output_json,omitempty"`
	Error       string         `json:"error,omitempty"`
	CompletedAt *time.Time     `json:"completed_at,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

// ToolCallResponse is the compact tool-call summary exposed over HTTP responses.
type ToolCallResponse struct {
	Name         string `json:"name"`
	ID           string `json:"id,omitempty"`
	FinishReason string `json:"finish_reason,omitempty"`
}
