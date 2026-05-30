package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/execution"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000027_add_specforge_runtime_capabilities", &addSpecForgeRuntimeCapabilities{})
}

type addSpecForgeRuntimeCapabilities struct {
	migration.BaseMigration
}

func (m *addSpecForgeRuntimeCapabilities) Up(db *gorm.DB) error {
	return db.AutoMigrate(&execution.RuntimePO{})
}

func (m *addSpecForgeRuntimeCapabilities) Down(db *gorm.DB) error {
	for _, column := range []string{"available_clis", "sandbox", "skill_roots", "local_skill_count", "capabilities_hash"} {
		if db.Migrator().HasColumn(&execution.RuntimePO{}, column) {
			if err := db.Migrator().DropColumn(&execution.RuntimePO{}, column); err != nil {
				return err
			}
		}
	}
	return nil
}
