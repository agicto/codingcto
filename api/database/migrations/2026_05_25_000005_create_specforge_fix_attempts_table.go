package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/verification"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000005_create_specforge_fix_attempts_table", &createSpecForgeFixAttemptsTable{})
}

type createSpecForgeFixAttemptsTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeFixAttemptsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&verification.FixAttemptPO{})
}

func (m *createSpecForgeFixAttemptsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("specforge_fix_attempts")
}
