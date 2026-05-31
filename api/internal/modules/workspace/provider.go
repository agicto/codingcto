package workspace

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.WorkspaceRepository), new(*repository)),
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"workspace",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_31_000026_create_workspaces_table"),
	)
}
