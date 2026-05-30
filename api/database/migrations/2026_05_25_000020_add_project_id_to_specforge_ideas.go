package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000020_add_project_id_to_specforge_ideas", &addProjectIDToSpecForgeIdeas{})
}

type addProjectIDToSpecForgeIdeas struct {
	migration.BaseMigration
}

func (m *addProjectIDToSpecForgeIdeas) Up(db *gorm.DB) error {
	if db.Migrator().HasColumn(&planning.IdeaPO{}, "project_id") {
		if db.Migrator().HasIndex(&planning.IdeaPO{}, "ProjectID") {
			return nil
		}
		return db.Migrator().CreateIndex(&planning.IdeaPO{}, "ProjectID")
	}
	if err := db.Migrator().AddColumn(&planning.IdeaPO{}, "ProjectID"); err != nil {
		return err
	}
	return db.Migrator().CreateIndex(&planning.IdeaPO{}, "ProjectID")
}

func (m *addProjectIDToSpecForgeIdeas) Down(db *gorm.DB) error {
	if db.Migrator().HasIndex(&planning.IdeaPO{}, "ProjectID") {
		if err := db.Migrator().DropIndex(&planning.IdeaPO{}, "ProjectID"); err != nil {
			return err
		}
	}
	if !db.Migrator().HasColumn(&planning.IdeaPO{}, "project_id") {
		return nil
	}
	return db.Migrator().DropColumn(&planning.IdeaPO{}, "ProjectID")
}
