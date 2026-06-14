package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/deepwiki"
	"gorm.io/gorm"
)

func init() {
	register("2026_06_14_000037_add_llm_metadata_to_deepwiki_indexes", &addLLMMetadataToDeepWikiIndexes{})
}

type addLLMMetadataToDeepWikiIndexes struct {
	migration.BaseMigration
}

func (m *addLLMMetadataToDeepWikiIndexes) Up(db *gorm.DB) error {
	return db.AutoMigrate(&deepwiki.IndexPO{})
}

func (m *addLLMMetadataToDeepWikiIndexes) Down(db *gorm.DB) error {
	table := (&deepwiki.IndexPO{}).TableName()
	for _, column := range []string{
		"generation_mode",
		"generator_provider",
		"generator_model",
		"prompt_version",
	} {
		if db.Migrator().HasColumn(table, column) {
			if err := db.Migrator().DropColumn(table, column); err != nil {
				return err
			}
		}
	}
	return nil
}
