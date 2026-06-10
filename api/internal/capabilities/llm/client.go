package llm

import "context"

type ChatProvider interface {
	Generate(ctx context.Context, req ChatRequest) (ChatResponse, error)
}

type EmbeddingProvider interface {
	Embed(ctx context.Context, texts []string) ([]Embedding, error)
}

type ChatRequest struct {
	Model       string
	System      string
	Prompt      string
	Temperature float64
	MaxTokens   int
}

type ChatResponse struct {
	Text  string
	Model string
	Raw   string
}

type Embedding struct {
	Text   string
	Vector []float64
}
