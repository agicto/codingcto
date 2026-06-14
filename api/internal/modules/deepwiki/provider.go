package deepwiki

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.DeepWikiRepository), new(*repository)),
	NewDefaultRepoReader,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"deepwiki",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_06_10_000030_create_deepwiki_tables"),
	)
}
