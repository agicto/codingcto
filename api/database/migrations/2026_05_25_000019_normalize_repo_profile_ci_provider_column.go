package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/repocontext"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000019_normalize_repo_profile_ci_provider_column", &normalizeRepoProfileCIProviderColumn{})
}

type normalizeRepoProfileCIProviderColumn struct {
	migration.BaseMigration
}

func (m *normalizeRepoProfileCIProviderColumn) Up(db *gorm.DB) error {
	if db.Migrator().HasColumn(&repocontext.RepoProfilePO{}, "c_iprovider") &&
		!db.Migrator().HasColumn(&repocontext.RepoProfilePO{}, "ci_provider") {
		return db.Migrator().RenameColumn(&repocontext.RepoProfilePO{}, "c_iprovider", "ci_provider")
	}
	return nil
}

func (m *normalizeRepoProfileCIProviderColumn) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&repocontext.RepoProfilePO{}, "ci_provider") &&
		!db.Migrator().HasColumn(&repocontext.RepoProfilePO{}, "c_iprovider") {
		return db.Migrator().RenameColumn(&repocontext.RepoProfilePO{}, "ci_provider", "c_iprovider")
	}
	return nil
}
