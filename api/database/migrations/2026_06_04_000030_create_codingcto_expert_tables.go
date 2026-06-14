package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/expert"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_04_000030_create_codingcto_expert_tables", &createCodingCTOExpertTables{})
}

type createCodingCTOExpertTables struct {
	migration.BaseMigration
}

func (m *createCodingCTOExpertTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(
		&expert.ExpertPO{},
		&expert.ExpertSkillPO{},
		&expert.ExpertSkillVersionPO{},
		&expert.ExpertRunPO{},
		&expert.SkillEvolutionProposalPO{},
	)
}

func (m *createCodingCTOExpertTables) Down(db *gorm.DB) error {
	return db.Migrator().DropTable(
		"codingcto_skill_evolution_proposals",
		"codingcto_expert_runs",
		"codingcto_expert_skill_versions",
		"codingcto_expert_skills",
		"codingcto_experts",
	)
}
