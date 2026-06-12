package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/project"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_11_000032_create_specforge_project_expert_policies_table", &createSpecForgeProjectExpertPoliciesTable{})
}

type createSpecForgeProjectExpertPoliciesTable struct {
	migration.BaseMigration
}

func (m *createSpecForgeProjectExpertPoliciesTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&project.ProjectExpertPolicyPO{})
}

func (m *createSpecForgeProjectExpertPoliciesTable) Down(db *gorm.DB) error {
	if db.Migrator().HasTable(&project.ProjectExpertPolicyPO{}) {
		return db.Migrator().DropTable(&project.ProjectExpertPolicyPO{})
	}
	return nil
}
