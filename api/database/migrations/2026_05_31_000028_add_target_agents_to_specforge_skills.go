package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_31_000028_add_target_agents_to_specforge_skills", &addTargetAgentsToSpecForgeSkills{})
}

type addTargetAgentsToSpecForgeSkills struct {
	migration.BaseMigration
}

func (m *addTargetAgentsToSpecForgeSkills) Up(db *gorm.DB) error {
	return db.AutoMigrate(&planning.SkillPO{})
}

func (m *addTargetAgentsToSpecForgeSkills) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&planning.SkillPO{}, "target_agents") {
		return db.Migrator().DropColumn(&planning.SkillPO{}, "target_agents")
	}
	return nil
}
