package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_11_000034_add_context_refs_to_specforge_plans", &addContextRefsToSpecForgePlans{})
}

type addContextRefsToSpecForgePlans struct {
	migration.BaseMigration
}

func (m *addContextRefsToSpecForgePlans) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.ImplementationPlanPO{})
}

func (m *addContextRefsToSpecForgePlans) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	if migrator.HasColumn(&planning.ImplementationPlanPO{}, "expert_policy_id") {
		if err := migrator.DropColumn(&planning.ImplementationPlanPO{}, "ExpertPolicyID"); err != nil {
			return err
		}
	}
	if migrator.HasColumn(&planning.ImplementationPlanPO{}, "context_snapshot_id") {
		if err := migrator.DropColumn(&planning.ImplementationPlanPO{}, "ContextSnapshotID"); err != nil {
			return err
		}
	}
	return nil
}
