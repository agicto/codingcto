package githubintegration

import (
	"context"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/gorm"
)

func TestRepositoryListsWebhookEventsWithFilters(t *testing.T) {
	repo := newTestGitHubIntegrationRepository(t)
	now := time.Now()
	events := []*domain.GitHubWebhookEvent{
		{
			DeliveryID:         "delivery-old",
			EventType:          GitHubWebhookEventPullRequest,
			RepositoryFullName: "agicto/codingcto",
			Payload:            "{}",
			Status:             GitHubWebhookStatusProcessed,
			ReceivedAt:         now.Add(-2 * time.Minute),
		},
		{
			DeliveryID:         "delivery-new",
			EventType:          GitHubWebhookEventWorkflowRun,
			RepositoryFullName: "agicto/codingcto",
			Payload:            "{}",
			Status:             GitHubWebhookStatusFailed,
			ReceivedAt:         now,
		},
		{
			DeliveryID:         "delivery-other",
			EventType:          GitHubWebhookEventWorkflowRun,
			RepositoryFullName: "other/repo",
			Payload:            "{}",
			Status:             GitHubWebhookStatusFailed,
			ReceivedAt:         now.Add(time.Minute),
		},
	}
	for _, event := range events {
		require.NoError(t, repo.CreateWebhookEvent(context.Background(), event))
	}

	found, err := repo.ListWebhookEvents(context.Background(), GitHubWebhookStatusFailed, "agicto/codingcto", 10)

	require.NoError(t, err)
	require.Len(t, found, 1)
	require.Equal(t, "delivery-new", found[0].DeliveryID)

	limited, err := repo.ListWebhookEvents(context.Background(), "", "", 2)
	require.NoError(t, err)
	require.Len(t, limited, 2)
	require.Equal(t, "delivery-other", limited[0].DeliveryID)
	require.Equal(t, "delivery-new", limited[1].DeliveryID)
}

func newTestGitHubIntegrationRepository(t *testing.T) *repository {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&GitHubInstallationPO{}, &RepositoryPO{}, &GitHubWebhookEventPO{}))
	return NewRepository(db)
}
