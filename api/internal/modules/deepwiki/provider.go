package deepwiki

import (
	"context"

	"github.com/google/wire"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

var ProviderSet = wire.NewSet(
	NewRepository,
	wire.Bind(new(domain.DeepWikiRepository), new(*repository)),
	NewGitHubRepositoryContentSource,
	NewDefaultRepoReader,
	NewService,
	wire.Bind(new(Service), new(*service)),
	NewHandler,
)

type gitHubRepositoryContentSource struct {
	service githubintegration.Service
}

func NewGitHubRepositoryContentSource(service githubintegration.Service) GitHubRepositoryContentSource {
	return &gitHubRepositoryContentSource{service: service}
}

func (s *gitHubRepositoryContentSource) ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*GitHubRepositoryTreeSnapshot, error) {
	tree, err := s.service.ListRepositoryTree(ctx, &githubintegration.ListRepositoryTreeRequest{
		RepositoryID: repositoryID,
		Ref:          ref,
		Recursive:    recursive,
	})
	if err != nil {
		return nil, err
	}
	if tree == nil {
		return nil, nil
	}
	return &GitHubRepositoryTreeSnapshot{
		Ref:       tree.Ref,
		Truncated: tree.Truncated,
		Paths:     tree.Paths,
	}, nil
}

func (s *gitHubRepositoryContentSource) ReadRepositoryFile(ctx context.Context, repositoryID, path, ref string) (*GitHubRepositoryFileSnapshot, error) {
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
	return &GitHubRepositoryFileSnapshot{
		Path:    file.Path,
		Ref:     file.Ref,
		SHA:     file.SHA,
		Content: file.Content,
	}, nil
}

func NewStarterManifest(handler *Handler) contracts.StarterManifest {
	return contracts.NewStaticStarterManifest(
		"deepwiki",
		contracts.WithStarterModule(handler),
		contracts.WithStarterMigrationNames("2026_06_10_000030_create_deepwiki_tables"),
		contracts.WithStarterMigrationNames("2026_06_13_000036_add_repository_scope_to_deepwiki_sources"),
		contracts.WithStarterMigrationNames("2026_06_14_000037_add_llm_metadata_to_deepwiki_indexes"),
	)
}
