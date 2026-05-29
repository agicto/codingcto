package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000014_add_source_to_specforge_repo_profiles", &addSourceToSpecForgeRepoProfiles{})
}

type addSourceToSpecForgeRepoProfiles struct {
	migration.BaseMigration
}

func (m *addSourceToSpecForgeRepoProfiles) Up(db *gorm.DB) error {
	if !db.Migrator().HasColumn("specforge_repo_profiles", "source") {
		if err := db.Exec("ALTER TABLE specforge_repo_profiles ADD COLUMN source varchar(100) NOT NULL DEFAULT 'manual'").Error; err != nil {
			return err
		}
	}
	if !db.Migrator().HasColumn("specforge_repo_profiles", "warnings") {
		if err := db.Exec("ALTER TABLE specforge_repo_profiles ADD COLUMN warnings text").Error; err != nil {
			return err
		}
	}
	return nil
}

func (m *addSourceToSpecForgeRepoProfiles) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn("specforge_repo_profiles", "warnings") {
		if err := db.Migrator().DropColumn("specforge_repo_profiles", "warnings"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn("specforge_repo_profiles", "source") {
		if err := db.Migrator().DropColumn("specforge_repo_profiles", "source"); err != nil {
			return err
		}
	}
	return nil
}
