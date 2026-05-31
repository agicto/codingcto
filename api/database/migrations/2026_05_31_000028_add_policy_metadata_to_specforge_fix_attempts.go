package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/verification"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000028_add_policy_metadata_to_specforge_fix_attempts", &addPolicyMetadataToSpecForgeFixAttempts{})
}

type addPolicyMetadataToSpecForgeFixAttempts struct {
	migration.BaseMigration
}

func (m *addPolicyMetadataToSpecForgeFixAttempts) Up(db *gorm.DB) error {
	return db.AutoMigrate(&verification.FixAttemptPO{})
}

func (m *addPolicyMetadataToSpecForgeFixAttempts) Down(db *gorm.DB) error {
	for _, column := range []string{"risk_level", "action_kind", "blocked_reason"} {
		if db.Migrator().HasColumn(&verification.FixAttemptPO{}, column) {
			if err := db.Migrator().DropColumn(&verification.FixAttemptPO{}, column); err != nil {
				return err
			}
		}
	}
	return nil
}
