package infra

import (
	"github.com/zgiai/luas/api/internal/capabilities/ai"
	"github.com/zgiai/luas/api/internal/infra/config"
)

func NewAIManager(cfg *config.Config) *ai.Manager {
	if cfg == nil {
		return ai.NewManager(ai.Config{})
	}
	return ai.NewManager(ai.Config{
		Enabled:         cfg.AI.Enabled,
		DefaultProvider: cfg.AI.DefaultProvider,
		DefaultModel:    cfg.AI.DefaultModel,
		RequestTimeout:  cfg.AI.RequestTimeout,
		OpenAI: ai.ProviderConfig{
			APIKey:  cfg.AI.OpenAI.APIKey,
			BaseURL: cfg.AI.OpenAI.BaseURL,
		},
		DeepSeek: ai.ProviderConfig{
			APIKey:  cfg.AI.DeepSeek.APIKey,
			BaseURL: cfg.AI.DeepSeek.BaseURL,
		},
	})
}
