package execution

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type RuntimeAPIClient interface {
	Heartbeat(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error)
	ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error)
	CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error)
	SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error)
	GetDirectTask(ctx context.Context, taskID uint, runtimeID string) (*domain.CodingCTODirectAgentTask, error)
	CreateDirectTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.CodingCTODirectTaskEvent, error)
	SubmitDirectTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.CodingCTODirectAgentTask, error)
	Deregister(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error)
}

type RuntimeHTTPClientConfig struct {
	BaseURL    string
	Token      string
	HTTPClient *http.Client
}

type RuntimeHTTPClient struct {
	baseURL string
	token   string
	client  *http.Client
}

func NewRuntimeHTTPClient(cfg RuntimeHTTPClientConfig) *RuntimeHTTPClient {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if baseURL == "" {
		baseURL = "http://localhost:2010/v1"
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &RuntimeHTTPClient{
		baseURL: baseURL,
		token:   strings.TrimSpace(cfg.Token),
		client:  client,
	}
}

func (c *RuntimeHTTPClient) Heartbeat(ctx context.Context, req *RuntimeHeartbeatRequest) (*RuntimeHeartbeatResponse, error) {
	var out RuntimeHeartbeatResponse
	if err := c.do(ctx, http.MethodPost, "/runtimes/heartbeat", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) ClaimTask(ctx context.Context, runtimeID string, req *ClaimAgentTaskRequest) (*ClaimAgentTaskResponse, error) {
	runtimeID = strings.TrimSpace(runtimeID)
	if runtimeID == "" {
		return nil, domain.ErrInvalidInput
	}
	var out ClaimAgentTaskResponse
	if err := c.do(ctx, http.MethodPost, "/runtimes/"+url.PathEscape(runtimeID)+"/claim", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) CreateTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.SpecForgeTaskEvent, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var out domain.SpecForgeTaskEvent
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/tasks/%d/events", taskID), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) SubmitTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.SpecForgeExecutionBundle, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var out domain.SpecForgeExecutionBundle
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/tasks/%d/result", taskID), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) GetDirectTask(ctx context.Context, taskID uint, runtimeID string) (*domain.CodingCTODirectAgentTask, error) {
	if taskID == 0 || strings.TrimSpace(runtimeID) == "" {
		return nil, domain.ErrInvalidInput
	}
	var out domain.CodingCTODirectAgentTask
	path := fmt.Sprintf("/runtime/agent-tasks/%d?runtime_id=%s", taskID, url.QueryEscape(strings.TrimSpace(runtimeID)))
	if err := c.do(ctx, http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) CreateDirectTaskEvent(ctx context.Context, taskID uint, req *CreateTaskEventRequest) (*domain.CodingCTODirectTaskEvent, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var out domain.CodingCTODirectTaskEvent
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/agent-tasks/%d/events", taskID), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) SubmitDirectTaskResult(ctx context.Context, taskID uint, req *SubmitTaskResultRequest) (*domain.CodingCTODirectAgentTask, error) {
	if taskID == 0 {
		return nil, domain.ErrInvalidInput
	}
	var out domain.CodingCTODirectAgentTask
	if err := c.do(ctx, http.MethodPost, fmt.Sprintf("/agent-tasks/%d/result", taskID), req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) Deregister(ctx context.Context, req *RuntimeDeregisterRequest) (*domain.SpecForgeRuntimeSweepResult, error) {
	var out domain.SpecForgeRuntimeSweepResult
	if err := c.do(ctx, http.MethodPost, "/runtimes/deregister", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *RuntimeHTTPClient) do(ctx context.Context, method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("encode runtime request: %w", err)
		}
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, body)
	if err != nil {
		return fmt.Errorf("create runtime request: %w", err)
	}
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("runtime request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return fmt.Errorf("read runtime response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("runtime API %s %s returned %d: %s", method, path, resp.StatusCode, strings.TrimSpace(string(data)))
	}
	if out == nil {
		return nil
	}
	var envelope struct {
		Code    int             `json:"code"`
		Message string          `json:"message"`
		Data    json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return fmt.Errorf("decode runtime response envelope: %w", err)
	}
	if len(envelope.Data) == 0 || string(envelope.Data) == "null" {
		return nil
	}
	if err := json.Unmarshal(envelope.Data, out); err != nil {
		return fmt.Errorf("decode runtime response data: %w", err)
	}
	return nil
}
