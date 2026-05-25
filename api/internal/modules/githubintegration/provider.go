package githubintegration

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.GitHubIntegrationRepository), new(*repository)),
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"githubintegration",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000004_create_github_integration_tables"),
	)
}
