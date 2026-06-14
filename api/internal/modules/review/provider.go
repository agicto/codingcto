package review

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeReviewDecisionRepository), new(*repository)),
	NewPRNodeReader,
	NewFixAttemptReader,
	NewPRNodeCIRefresher,
	NewPRNodeMergeRequester,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

func NewPRNodeReader(repo domain.SpecForgePlanningRepository) PRNodeReader {
	return repo
}

func NewFixAttemptReader(repo domain.SpecForgeVerificationRepository) FixAttemptReader {
	return repo
}

func NewPRNodeCIRefresher(service githubintegration.Service) PRNodeCIRefresher {
	return service
}

func NewPRNodeMergeRequester(service githubintegration.Service) PRNodeMergeRequester {
	return service
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"review",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_06_11_000031_create_review_decisions_table"),
	)
}
