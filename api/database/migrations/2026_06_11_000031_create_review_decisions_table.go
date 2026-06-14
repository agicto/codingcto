package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/review"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_11_000031_create_review_decisions_table", &createReviewDecisionsTable{})
}

type createReviewDecisionsTable struct {
	migration.BaseMigration
}

func (m *createReviewDecisionsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&review.ReviewDecisionPO{})
}

func (m *createReviewDecisionsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("review_decisions")
}
