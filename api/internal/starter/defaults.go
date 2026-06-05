package starter

import (
	"github.com/google/wire"
	"github.com/zgiai/luas/api/database/seeders"
	"github.com/zgiai/luas/api/internal/contracts"
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/apikey"
	"github.com/zgiai/luas/api/internal/modules/audit"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"github.com/zgiai/luas/api/internal/modules/expert"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"github.com/zgiai/luas/api/internal/modules/project"
	"github.com/zgiai/luas/api/internal/modules/repocontext"
	"github.com/zgiai/luas/api/internal/modules/user"
	"github.com/zgiai/luas/api/internal/modules/verification"
	"github.com/zgiai/luas/api/internal/modules/workspace"
)

// ProviderSet wires the default scaffold starters and their registry.
var ProviderSet = wire.NewSet(
	audit.ProviderSet,
	apikey.ProviderSet,
	expert.ProviderSet,
	planning.ProviderSet,
	repocontext.ProviderSet,
	execution.ProviderSet,
	githubintegration.ProviderSet,
	project.ProviderSet,
	verification.ProviderSet,
	workspace.ProviderSet,
	user.ProviderSet,
	NewDefaultRegistry,
)

// NewDefaultRegistry creates the default scaffold starter registry.
func NewDefaultRegistry(
	auditHandler *audit.Handler,
	apiKeyHandler *apikey.Handler,
	expertHandler *expert.Handler,
	planningHandler *planning.Handler,
	repoContextHandler *repocontext.Handler,
	executionHandler *execution.Handler,
	gitHubIntegrationHandler *githubintegration.Handler,
	projectHandler *project.Handler,
	verificationHandler *verification.Handler,
	workspaceHandler *workspace.Handler,
	userHandler *user.Handler,
) (*Registry, error) {
	registry := NewRegistry()
	for _, manifest := range DefaultManifests(auditHandler, apiKeyHandler, expertHandler, planningHandler, repoContextHandler, executionHandler, gitHubIntegrationHandler, projectHandler, verificationHandler, workspaceHandler, userHandler) {
		if err := registry.ApplyManifest(manifest); err != nil {
			return nil, err
		}
	}

	return registry, nil
}

// DefaultManifests returns the starter manifests enabled in the default scaffold.
func DefaultManifests(auditHandler *audit.Handler, apiKeyHandler *apikey.Handler, expertHandler *expert.Handler, planningHandler *planning.Handler, repoContextHandler *repocontext.Handler, executionHandler *execution.Handler, gitHubIntegrationHandler *githubintegration.Handler, projectHandler *project.Handler, verificationHandler *verification.Handler, workspaceHandler *workspace.Handler, userHandler *user.Handler) []contracts.StarterManifest {
	return []contracts.StarterManifest{
		audit.NewStarterManifest(auditHandler),
		apikey.NewStarterManifest(apiKeyHandler),
		expert.NewStarterManifest(expertHandler),
		workspace.NewStarterManifest(workspaceHandler),
		planning.NewStarterManifest(planningHandler),
		repocontext.NewStarterManifest(repoContextHandler),
		execution.NewStarterManifest(executionHandler),
		githubintegration.NewStarterManifest(gitHubIntegrationHandler),
		project.NewStarterManifest(projectHandler),
		verification.NewStarterManifest(verificationHandler),
		user.NewStarterManifest(userHandler),
	}
}

// DefaultMigrations returns the migrations enabled by the default starters.
func DefaultMigrations() (map[string]migration.Migration, error) {
	registry := NewRegistry()
	for _, manifest := range DefaultManifests(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil) {
		if err := registry.ApplyManifest(manifest); err != nil {
			return nil, err
		}
	}
	return registry.Migrations(), nil
}

// DefaultSeeders returns the seeders enabled by the default starters.
func DefaultSeeders() ([]seeders.Seeder, error) {
	registry := NewRegistry()
	for _, manifest := range DefaultManifests(nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, nil) {
		if err := registry.ApplyManifest(manifest); err != nil {
			return nil, err
		}
	}
	return registry.Seeders(), nil
}
