package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/verification"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000017_add_ci_metadata_to_specforge_fix_attempts", &addCIMetadataToSpecForgeFixAttempts{})
}

type addCIMetadataToSpecForgeFixAttempts struct {
	migration.BaseMigration
}

func (m *addCIMetadataToSpecForgeFixAttempts) Up(db *gorm.DB) error {
	return db.AutoMigrate(&verification.FixAttemptPO{})
}

func (m *addCIMetadataToSpecForgeFixAttempts) Down(db *gorm.DB) error {
	for _, column := range []string{"workflow_run_id", "workflow_run_url", "conclusion"} {
		if db.Migrator().HasColumn(&verification.FixAttemptPO{}, column) {
			if err := db.Migrator().DropColumn(&verification.FixAttemptPO{}, column); err != nil {
				return err
			}
		}
	}
	return nil
}
