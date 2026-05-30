package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/planning"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000021_add_requirement_plan_versioning", &addRequirementPlanVersioning{})
}

type addRequirementPlanVersioning struct {
	migration.BaseMigration
}

func (m *addRequirementPlanVersioning) Up(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&planning.RequirementPO{},
		&planning.IdeaPO{},
		&planning.ImplementationPlanPO{},
		&planning.PRNodePO{},
	); err != nil {
		return err
	}
	if err := db.Exec(`
		UPDATE specforge_implementation_plans
		SET version = 1
		WHERE version IS NULL OR version = 0
	`).Error; err != nil {
		return err
	}
	return db.Exec(`
		UPDATE specforge_pr_nodes
		SET repository_id = (
			SELECT specforge_ideas.repository_id
			FROM specforge_implementation_plans
			JOIN specforge_ideas ON specforge_ideas.id = specforge_implementation_plans.idea_id
			WHERE specforge_implementation_plans.id = specforge_pr_nodes.plan_id
			LIMIT 1
		)
		WHERE repository_id IS NULL OR repository_id = ''
	`).Error
}

func (m *addRequirementPlanVersioning) Down(db *gorm.DB) error {
	if db.Migrator().HasColumn(&planning.PRNodePO{}, "repository_id") {
		if err := db.Migrator().DropColumn(&planning.PRNodePO{}, "RepositoryID"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn(&planning.ImplementationPlanPO{}, "approved_snapshot_at") {
		if err := db.Migrator().DropColumn(&planning.ImplementationPlanPO{}, "ApprovedSnapshotAt"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn(&planning.ImplementationPlanPO{}, "approved_snapshot_hash") {
		if err := db.Migrator().DropColumn(&planning.ImplementationPlanPO{}, "ApprovedSnapshotHash"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn(&planning.ImplementationPlanPO{}, "version") {
		if err := db.Migrator().DropColumn(&planning.ImplementationPlanPO{}, "Version"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn(&planning.ImplementationPlanPO{}, "requirement_id") {
		if err := db.Migrator().DropColumn(&planning.ImplementationPlanPO{}, "RequirementID"); err != nil {
			return err
		}
	}
	if db.Migrator().HasColumn(&planning.IdeaPO{}, "requirement_id") {
		if err := db.Migrator().DropColumn(&planning.IdeaPO{}, "RequirementID"); err != nil {
			return err
		}
	}
	if db.Migrator().HasTable(&planning.RequirementPO{}) {
		return db.Migrator().DropTable(&planning.RequirementPO{})
	}
	return nil
}
