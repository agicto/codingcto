package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/deepwiki"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_10_000030_create_deepwiki_tables", &createDeepWikiTables{})
}

type createDeepWikiTables struct {
	migration.BaseMigration
}

func (m *createDeepWikiTables) Up(db *gorm.DB) error {
	return db.AutoMigrate(
		&deepwiki.SourcePO{},
		&deepwiki.IndexPO{},
		&deepwiki.ChunkPO{},
		&deepwiki.PagePO{},
	)
}

func (m *createDeepWikiTables) Down(db *gorm.DB) error {
	for _, table := range []any{
		&deepwiki.PagePO{},
		&deepwiki.ChunkPO{},
		&deepwiki.IndexPO{},
		&deepwiki.SourcePO{},
	} {
		if db.Migrator().HasTable(table) {
			if err := db.Migrator().DropTable(table); err != nil {
				return err
			}
		}
	}
	return nil
}
