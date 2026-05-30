package execution

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRuntimeHTTPClientSendsBearerTokenAndDecodesEnvelope(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		require.Equal(t, "/v1/runtimes/runtime_123/claim", r.URL.Path)
		require.Equal(t, http.MethodPost, r.Method)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code":    0,
			"message": "success",
			"data": map[string]any{
				"task": map[string]any{
					"id":             7,
					"run_id":         9,
					"pr_node_id":     42,
					"executor":       "codex_cli",
					"status":         "running",
					"prompt_type":    "implementation",
					"runtime_id":     "runtime_123",
					"attempt_number": 1,
				},
			},
		})
	}))
	defer server.Close()
	client := NewRuntimeHTTPClient(RuntimeHTTPClientConfig{
		BaseURL: server.URL + "/v1",
		Token:   "runtime-token",
	})

	claim, err := client.ClaimTask(context.Background(), "runtime_123", &ClaimAgentTaskRequest{Executor: ExecutorNameCodexCLI})

	require.NoError(t, err)
	require.Equal(t, "Bearer runtime-token", authHeader)
	require.NotNil(t, claim.Task)
	require.Equal(t, uint(7), claim.Task.ID)
}

func TestRuntimeHTTPClientReturnsAPIErrorDetails(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"message":"unauthorized"}`, http.StatusUnauthorized)
	}))
	defer server.Close()
	client := NewRuntimeHTTPClient(RuntimeHTTPClientConfig{BaseURL: server.URL})

	_, err := client.Heartbeat(context.Background(), &RuntimeHeartbeatRequest{RuntimeID: "runtime_123"})

	require.ErrorContains(t, err, "returned 401")
	require.ErrorContains(t, err, "unauthorized")
}
