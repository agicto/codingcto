package migrations

import (
	"github.com/zgiai/luas/api/internal/infra/migration"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
	"gorm.io/gorm"
)

func init() {
	register("2026_05_25_000006_create_github_webhook_events_table", &createGitHubWebhookEventsTable{})
}

type createGitHubWebhookEventsTable struct {
	migration.BaseMigration
}

func (m *createGitHubWebhookEventsTable) Up(db *gorm.DB) error {
	return db.AutoMigrate(&githubintegration.GitHubWebhookEventPO{})
}

func (m *createGitHubWebhookEventsTable) Down(db *gorm.DB) error {
	return db.Migrator().DropTable("github_webhook_events")
}
