package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type OpenAICompatibleProvider struct {
	baseURL        string
	apiKey         string
	model          string
	embeddingModel string
	httpClient     *http.Client
}

type OpenAICompatibleOption func(*OpenAICompatibleProvider)

func NewOpenAICompatibleProvider(baseURL, apiKey, model string, opts ...OpenAICompatibleOption) *OpenAICompatibleProvider {
	provider := &OpenAICompatibleProvider{
		baseURL:    strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		apiKey:     strings.TrimSpace(apiKey),
		model:      strings.TrimSpace(model),
		httpClient: http.DefaultClient,
	}
	for _, opt := range opts {
		opt(provider)
	}
	return provider
}

func WithEmbeddingModel(model string) OpenAICompatibleOption {
	return func(provider *OpenAICompatibleProvider) {
		provider.embeddingModel = strings.TrimSpace(model)
	}
}

func WithHTTPClient(httpClient *http.Client) OpenAICompatibleOption {
	return func(provider *OpenAICompatibleProvider) {
		if httpClient != nil {
			provider.httpClient = httpClient
		}
	}
}

func (p *OpenAICompatibleProvider) Generate(ctx context.Context, req ChatRequest) (ChatResponse, error) {
	if p == nil || p.baseURL == "" || p.apiKey == "" {
		return ChatResponse{}, fmt.Errorf("llm: base url and api key are required")
	}
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = p.model
	}
	if model == "" {
		return ChatResponse{}, fmt.Errorf("llm: model is required")
	}

	payload := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": req.System},
			{"role": "user", "content": req.Prompt},
		},
	}
	if req.Temperature > 0 {
		payload["temperature"] = req.Temperature
	}
	if req.MaxTokens > 0 {
		payload["max_tokens"] = req.MaxTokens
	}

	body, err := p.postJSON(ctx, "/chat/completions", payload)
	if err != nil {
		return ChatResponse{}, err
	}
	var decoded struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return ChatResponse{}, fmt.Errorf("llm: decode chat response: %w", err)
	}
	if len(decoded.Choices) == 0 {
		return ChatResponse{}, fmt.Errorf("llm: chat response missing choices")
	}
	return ChatResponse{Text: decoded.Choices[0].Message.Content, Model: decoded.Model, Raw: string(body)}, nil
}

func (p *OpenAICompatibleProvider) Embed(ctx context.Context, texts []string) ([]Embedding, error) {
	if p == nil || p.baseURL == "" || p.apiKey == "" {
		return nil, fmt.Errorf("llm: base url and api key are required")
	}
	model := p.embeddingModel
	if model == "" {
		return nil, fmt.Errorf("llm: embedding model is required")
	}
	payload := map[string]any{
		"model": model,
		"input": texts,
	}
	body, err := p.postJSON(ctx, "/embeddings", payload)
	if err != nil {
		return nil, err
	}
	var decoded struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
			Index     int       `json:"index"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, fmt.Errorf("llm: decode embedding response: %w", err)
	}
	embeddings := make([]Embedding, 0, len(decoded.Data))
	for _, item := range decoded.Data {
		text := ""
		if item.Index >= 0 && item.Index < len(texts) {
			text = texts[item.Index]
		}
		embeddings = append(embeddings, Embedding{Text: text, Vector: item.Embedding})
	}
	return embeddings, nil
}

func (p *OpenAICompatibleProvider) postJSON(ctx context.Context, path string, payload any) ([]byte, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("llm: encode request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("llm: read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("llm: request failed with HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(responseBody)))
	}
	return responseBody, nil
}
