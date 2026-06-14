package ai

import (
	"context"
	"fmt"
	"strings"
	"time"

	infrahttp "github.com/zgiai/luas/api/internal/infra/http"
)

// DeepSeekProvider implements one-shot text generation with DeepSeek's
// OpenAI-compatible chat-completions API.
type DeepSeekProvider struct {
	apiKey  string
	baseURL string
	timeout time.Duration
}

// NewDeepSeekProvider creates a new DeepSeek-backed provider.
func NewDeepSeekProvider(cfg ProviderConfig, timeout time.Duration) *DeepSeekProvider {
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	if timeout <= 0 {
		timeout = 120 * time.Second
	}

	return &DeepSeekProvider{
		apiKey:  strings.TrimSpace(cfg.APIKey),
		baseURL: strings.TrimRight(baseURL, "/"),
		timeout: timeout,
	}
}

// Name returns the provider name.
func (p *DeepSeekProvider) Name() string {
	return ProviderDeepSeek
}

// GenerateText calls the DeepSeek chat-completions API and returns the first
// assistant message content.
func (p *DeepSeekProvider) GenerateText(ctx context.Context, req *TextRequest) (*TextResponse, error) {
	body := p.requestBody(req)

	resp, err := infrahttp.New().
		BaseURL(p.baseURL).
		Timeout(p.timeout).
		WithToken(p.apiKey).
		AcceptJSON().
		AsJSON().
		PostContext(ctx, "/chat/completions", body)
	if err != nil {
		return nil, fmt.Errorf("deepseek: request failed: %w", err)
	}

	var payload deepSeekResponse
	if err := resp.JSON(&payload); err != nil {
		return nil, fmt.Errorf("deepseek: failed to decode response: %w", err)
	}

	if resp.Failed() {
		message := strings.TrimSpace(payload.Error.Message)
		if message == "" {
			message = strings.TrimSpace(resp.String())
		}
		return nil, fmt.Errorf("deepseek: %s", message)
	}

	text := payload.outputText()
	if text == "" {
		return nil, ErrEmptyResponseText
	}

	return &TextResponse{
		ID:       payload.ID,
		Provider: ProviderDeepSeek,
		Model:    payload.Model,
		Text:     text,
	}, nil
}

func (p *DeepSeekProvider) requestBody(req *TextRequest) map[string]any {
	messages := make([]map[string]string, 0, 2)
	if req.Instructions != "" {
		messages = append(messages, map[string]string{
			"role":    "system",
			"content": req.Instructions,
		})
	}
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": req.Input,
	})

	return map[string]any{
		"model":    req.Model,
		"messages": messages,
	}
}

type deepSeekResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (r *deepSeekResponse) outputText() string {
	parts := make([]string, 0, len(r.Choices))
	for _, choice := range r.Choices {
		text := strings.TrimSpace(choice.Message.Content)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}
