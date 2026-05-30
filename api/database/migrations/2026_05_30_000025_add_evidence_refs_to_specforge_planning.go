package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_30_000025_add_evidence_refs_to_specforge_planning", &addEvidenceRefsToSpecForgePlanning{})
}

type addEvidenceRefsToSpecForgePlanning struct {
	migration.BaseMigration
}

func (m *addEvidenceRefsToSpecForgePlanning) Up(db *gorm.DB) error {
	return db.AutoMigrate(
		&planning.ImplementationPlanPO{},
		&planning.PRNodePO{},
		&planning.CompiledPromptPO{},
		&planning.SkillRunPO{},
	)
}

func (m *addEvidenceRefsToSpecForgePlanning) Down(db *gorm.DB) error {
	migrator := db.Migrator()
	models := []interface{}{
		&planning.SkillRunPO{},
		&planning.CompiledPromptPO{},
		&planning.PRNodePO{},
		&planning.ImplementationPlanPO{},
	}
	for _, model := range models {
		if migrator.HasColumn(model, "evidence_refs") {
			if err := migrator.DropColumn(model, "EvidenceRefs"); err != nil {
				return err
			}
		}
	}
	return nil
}
