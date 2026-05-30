package verification

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeVerificationRepository), new(*repository)),
	NewGitHubCIFailureReader,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewGitHubCIFailureReader(service githubintegration.Service) CIFailureReader {
	return service
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"verification",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000005_create_specforge_fix_attempts_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000017_add_ci_metadata_to_specforge_fix_attempts"),
	)
}
