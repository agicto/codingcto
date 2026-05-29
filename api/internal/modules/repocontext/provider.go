package repocontext

import (
	"context"

	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.SpecForgeRepoProfileRepository), new(*repository)),
	NewGitHubRepositoryTreeSource,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

type gitHubRepositoryTreeSource struct {
	service githubintegration.Service
}

func NewGitHubRepositoryTreeSource(service githubintegration.Service) RepositoryTreeSource {
	return &gitHubRepositoryTreeSource{service: service}
}

func (s *gitHubRepositoryTreeSource) ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*RepositoryTreeSnapshot, error) {
	snapshot, err := s.service.ListRepositoryTree(ctx, &githubintegration.ListRepositoryTreeRequest{
		RepositoryID: repositoryID,
		Ref:          ref,
		Recursive:    recursive,
	})
	if err != nil {
		return nil, err
	}
	if snapshot == nil {
		return nil, nil
	}
	return &RepositoryTreeSnapshot{
		Ref:       snapshot.Ref,
		Truncated: snapshot.Truncated,
		Paths:     snapshot.Paths,
	}, nil
}

func (s *gitHubRepositoryTreeSource) ReadRepositoryFile(ctx context.Context, repositoryID, path, ref string) (*RepositoryFileSnapshot, error) {
	file, err := s.service.ReadRepositoryFile(ctx, &githubintegration.ReadRepositoryFileRequest{
		RepositoryID: repositoryID,
		Path:         path,
		Ref:          ref,
	})
	if err != nil {
		return nil, err
	}
	if file == nil {
		return nil, nil
	}
	return &RepositoryFileSnapshot{
		Path:    file.Path,
		Ref:     file.Ref,
		Content: file.Content,
	}, nil
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"repocontext",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_05_25_000002_create_specforge_repo_profiles_table"),
		contracts.WithStarterMigrationNames("2026_05_25_000014_add_source_to_specforge_repo_profiles"),
	)
}
