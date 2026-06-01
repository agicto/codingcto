package githubintegration

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	infraevents "github.com/zgiai/luas/api/internal/infra/events"
)

func TestUpsertInstallationNormalizesPermissions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil, nil)

	installation, err := svc.UpsertInstallation(context.Background(), 7, &UpsertInstallationRequest{
		WorkspaceID:    " workspace_123 ",
		InstallationID: 42,
		AccountLogin:   " acme ",
		Permissions: map[string]string{
			" contents ": " write ",
			"":           "read",
		},
	})

	require.NoError(t, err)
	require.Equal(t, "workspace_123", installation.WorkspaceID)
	require.Equal(t, "acme", installation.AccountLogin)
	require.Equal(t, map[string]string{"contents": "write"}, installation.Permissions)
	require.Equal(t, uint(7), installation.CreatedBy)
}

func TestSyncInstallationStoresAccountAndListsRepositories(t *testing.T) {
	repo := &memoryRepo{}
	client := &fakeRepositoryClient{
		installationRepos: []InstallationRepository{
			{
				ID:            101,
				Name:          "codingcto",
				FullName:      "agicto/codingcto",
				DefaultBranch: "main",
				Private:       true,
				HTMLURL:       "https://github.com/agicto/codingcto",
			},
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{
		token: &InstallationToken{Token: "ghs_installation_token"},
		installation: &GitHubAppInstallation{
			ID:      42,
			Account: GitHubAppAccount{Login: "agicto", Type: "Organization"},
			Permissions: map[string]string{
				"contents":      "write",
				"pull_requests": "write",
			},
		},
	}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	result, err := svc.SyncInstallation(context.Background(), 7, &SyncInstallationRequest{
		WorkspaceID:    "default",
		InstallationID: 42,
	})

	require.NoError(t, err)
	require.Equal(t, "agicto", result.Installation.AccountLogin)
	require.Equal(t, map[string]string{"contents": "write", "pull_requests": "write"}, result.Installation.Permissions)
	require.Len(t, result.Repositories, 1)
	require.Equal(t, "agicto", result.Repositories[0].Owner)
	require.Equal(t, "codingcto", result.Repositories[0].Repo)
	require.Equal(t, "main", result.Repositories[0].DefaultBranch)
	require.True(t, result.Repositories[0].IsPrivate)
}

func TestUpsertRepositoryDefaultsRepositoryIDAndBranch(t *testing.T) {
	repo := &memoryRepo{installation: &domain.GitHubInstallation{ID: 3, InstallationID: 123}}
	client := &fakeRepositoryClient{branchRef: &GitReference{Object: GitRefObject{SHA: "main123"}}}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}, nil)

	repository, err := svc.UpsertRepository(context.Background(), 9, &UpsertRepositoryRequest{
		WorkspaceID:          "workspace_123",
		GitHubInstallationID: 3,
		GitHubOwner:          "multica-ai",
		GitHubRepo:           "multica",
		IsPrivate:            true,
	})

	require.NoError(t, err)
	require.Equal(t, "github_multica-ai__multica", repository.RepositoryID)
	require.Equal(t, "main", repository.DefaultBranch)
	require.Equal(t, "main", client.getBranchName)
	require.True(t, repository.IsPrivate)
	require.Equal(t, uint(9), repository.CreatedBy)
}

func TestUpsertRepositoryCanMoveKnownInstallationRepositoryToWorkspace(t *testing.T) {
	repo := &memoryRepo{
		repository: &domain.Repository{
			RepositoryID:         "github_agicto__codingcto-key",
			WorkspaceID:          "default",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto-key",
			DefaultBranch:        "main",
			IsPrivate:            true,
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{err: fmt.Errorf("token request failed")}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: &fakeRepositoryClient{}}, tokenProvider, nil)

	repository, err := svc.UpsertRepository(context.Background(), 9, &UpsertRepositoryRequest{
		RepositoryID:         "github_agicto__codingcto-key",
		WorkspaceID:          "workspace_s_d",
		GitHubInstallationID: 3,
		GitHubOwner:          "agicto",
		GitHubRepo:           "codingcto-key",
		DefaultBranch:        "main",
		IsPrivate:            true,
	})

	require.NoError(t, err)
	require.Equal(t, "workspace_s_d", repository.WorkspaceID)
	require.Equal(t, int64(0), tokenProvider.installationID)
}

func TestCheckRepositoryReadinessReportsMissingIssueWriteAndTokenFailure(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			WorkspaceID:    "workspace_s_d",
			InstallationID: 136915108,
			AccountLogin:   "agicto",
			Permissions: map[string]string{
				"metadata":      "read",
				"contents":      "write",
				"pull_requests": "write",
				"issues":        "read",
				"actions":       "read",
				"statuses":      "read",
			},
		},
		repository: &domain.Repository{
			RepositoryID:         "github_agicto__codingcto-key",
			WorkspaceID:          "workspace_s_d",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto-key",
			DefaultBranch:        "main",
			IsPrivate:            true,
		},
	}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: &fakeRepositoryClient{}}, &fakeInstallationTokenProvider{err: fmt.Errorf("token request failed: Not Found")}, nil)

	readiness, err := svc.CheckRepositoryReadiness(context.Background(), "github_agicto__codingcto-key")

	require.NoError(t, err)
	require.False(t, readiness.Ready)
	require.Equal(t, "agicto", readiness.GitHubOwner)
	require.Equal(t, "codingcto-key", readiness.GitHubRepo)
	require.Equal(t, "error", readinessCheck(t, readiness.Checks, "permission_issues").Status)
	require.Contains(t, readinessCheck(t, readiness.Checks, "permission_issues").Detail, "当前权限：read")
	require.Equal(t, "error", readinessCheck(t, readiness.Checks, "installation_token").Status)
	require.Contains(t, readinessCheck(t, readiness.Checks, "installation_token").Detail, "未找到")
}

func TestCreateIssueRequiresIssueWritePermissionBeforeToken(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			WorkspaceID:    "workspace_s_d",
			InstallationID: 136915108,
			AccountLogin:   "agicto",
			Permissions: map[string]string{
				"contents":      "write",
				"pull_requests": "write",
				"issues":        "read",
			},
		},
		repository: &domain.Repository{
			RepositoryID:         "github_agicto__codingcto-key",
			WorkspaceID:          "workspace_s_d",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto-key",
			DefaultBranch:        "main",
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{err: fmt.Errorf("token should not be requested")}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: &fakeRepositoryClient{}}, tokenProvider, nil)

	issue, err := svc.CreateIssue(context.Background(), &CreateIssueRequest{
		RepositoryID: "github_agicto__codingcto-key",
		Title:        "Smoke test",
	})

	require.Nil(t, issue)
	require.Error(t, err)
	require.Contains(t, err.Error(), "issues:write")
	require.Equal(t, int64(0), tokenProvider.installationID)
}

func TestCheckRepositoryReadinessReadyWhenRequiredChecksPass(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			WorkspaceID:    "workspace_s_d",
			InstallationID: 136915108,
			AccountLogin:   "agicto",
			Permissions: map[string]string{
				"metadata":      "read",
				"contents":      "write",
				"pull_requests": "write",
				"issues":        "write",
			},
		},
		repository: &domain.Repository{
			RepositoryID:         "github_agicto__codingcto-key",
			WorkspaceID:          "workspace_s_d",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto-key",
			DefaultBranch:        "main",
		},
	}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: &fakeRepositoryClient{}}, &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_token"}}, nil)

	readiness, err := svc.CheckRepositoryReadiness(context.Background(), "github_agicto__codingcto-key")

	require.NoError(t, err)
	require.True(t, readiness.Ready)
	require.Equal(t, "ok", readinessCheck(t, readiness.Checks, "installation_token").Status)
}

func TestGetRepositoryReturnsStoredRepository(t *testing.T) {
	repo := &memoryRepo{installation: &domain.GitHubInstallation{ID: 3, InstallationID: 123}}
	client := &fakeRepositoryClient{branchRef: &GitReference{Object: GitRefObject{SHA: "develop123"}}}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}, nil)
	created, err := svc.UpsertRepository(context.Background(), 9, &UpsertRepositoryRequest{
		RepositoryID:         "repo_123",
		WorkspaceID:          "workspace_123",
		GitHubInstallationID: 3,
		GitHubOwner:          "agicto",
		GitHubRepo:           "codingcto",
		DefaultBranch:        "develop",
	})
	require.NoError(t, err)

	found, err := svc.GetRepository(context.Background(), "repo_123")

	require.NoError(t, err)
	require.Equal(t, created.ID, found.ID)
	require.Equal(t, "develop", found.DefaultBranch)
}

func TestListRepositoriesReturnsWorkspaceRepositories(t *testing.T) {
	repo := &memoryRepo{
		repository: &domain.Repository{
			ID:           12,
			RepositoryID: "repo_123",
			WorkspaceID:  "workspace_123",
			GitHubOwner:  "agicto",
			GitHubRepo:   "codingcto",
		},
	}
	svc := NewService(repo, nil, nil, nil, nil)

	repositories, err := svc.ListRepositories(context.Background(), " workspace_123 ")

	require.NoError(t, err)
	require.Len(t, repositories, 1)
	require.Equal(t, "repo_123", repositories[0].RepositoryID)
}

func TestListRepositoryTreeUsesInstallationTokenAndDefaultBranch(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{ID: 3, InstallationID: 123},
		repository: &domain.Repository{
			RepositoryID:         "repo_123",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	client := &fakeRepositoryClient{
		tree: &GitTree{
			Truncated: false,
			Tree: []GitTreeEntry{
				{Path: "go.mod", Type: "blob"},
				{Path: "web/package.json", Type: "blob"},
				{Path: " ", Type: "blob"},
			},
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	snapshot, err := svc.ListRepositoryTree(context.Background(), &ListRepositoryTreeRequest{
		RepositoryID: "repo_123",
		Recursive:    true,
	})

	require.NoError(t, err)
	require.Equal(t, int64(123), tokenProvider.installationID)
	require.Equal(t, "ghs_installation_token", svc.clientFactory.(*fakeRepositoryClientFactory).token)
	require.Equal(t, "main", client.listTreeRef)
	require.True(t, client.listTreeRecursive)
	require.Equal(t, []string{"go.mod", "web/package.json"}, snapshot.Paths)
	require.Equal(t, "repo_123", snapshot.RepositoryID)
}

func TestReadRepositoryFileReturnsDecodedContent(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{ID: 3, InstallationID: 123},
		repository: &domain.Repository{
			RepositoryID:         "repo_123",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	client := &fakeRepositoryClient{
		file: &RepositoryFile{
			Path:           "web/package.json",
			SHA:            "package123",
			Encoding:       "base64",
			DecodedContent: `{"scripts":{"lint":"eslint ."}}`,
		},
	}
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}, nil)

	file, err := svc.ReadRepositoryFile(context.Background(), &ReadRepositoryFileRequest{
		RepositoryID: "repo_123",
		Path:         "web/package.json",
	})

	require.NoError(t, err)
	require.Equal(t, "web/package.json", client.readFilePath)
	require.Equal(t, "main", client.readFileRef)
	require.Equal(t, "package123", file.SHA)
	require.Equal(t, `{"scripts":{"lint":"eslint ."}}`, file.Content)
}

func TestRecordWebhookParsesMetadataAndIsIdempotent(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil, nil)
	body := []byte(`{"action":"completed","installation":{"id":123},"repository":{"full_name":"agicto/codingcto"}}`)

	first, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  "workflow_run",
		DeliveryID: "delivery-123",
		Signature:  "sha256=abc",
		Body:       body,
	})
	require.NoError(t, err)
	second, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  "workflow_run",
		DeliveryID: "delivery-123",
		Signature:  "sha256=abc",
		Body:       body,
	})
	require.NoError(t, err)

	require.Equal(t, first.ID, second.ID)
	require.Equal(t, "completed", first.Action)
	require.Equal(t, int64(123), first.InstallationID)
	require.Equal(t, "agicto/codingcto", first.RepositoryFullName)
	require.Equal(t, GitHubWebhookStatusProcessed, first.Status)
	require.Len(t, repo.webhookEvents, 1)
	require.Equal(t, GitHubWebhookStatusProcessed, repo.webhookEvents[0].Status)
}

func TestRecordWebhookLinksPullRequestToPRNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "opened",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "open",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-pr",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	node := planningRepo.nodes[0]
	require.NotNil(t, node.GitHubPRNumber)
	require.Equal(t, 42, *node.GitHubPRNumber)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42", node.GitHubPRURL)
	require.Equal(t, "abc123", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusPROpened, node.Status)
}

func TestRecordWebhookMarksMergedPullRequestNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "closed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "closed",
			"merged": true,
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-pr-merged",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusMerged, planningRepo.nodes[0].Status)
}

func TestRecordWebhookMarksClosedUnmergedPullRequestNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "closed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "closed",
			"merged": false,
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-pr-closed",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusClosed, planningRepo.nodes[0].Status)
}

func TestRecordWebhookPublishesClosedEventForUnmergedPullRequest(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeClosedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeClosed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeClosedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "closed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "closed",
			"merged": false,
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-pr-closed-event",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, uint(20), published.PlanID)
	require.Equal(t, "PR-001", published.NodeKey)
	require.Equal(t, domain.PRNodeStatusClosed, published.Status)
}

func TestRecordWebhookLinksPullRequestByGitHubPRNumberFallback(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusPROpened},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "created",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"issue": {
			"number": 42,
			"state": "open",
			"pull_request": {"html_url": "https://github.com/agicto/codingcto/pull/42"}
		},
		"comment": {
			"body": "Please handle nil workspace roles.",
			"html_url": "https://github.com/agicto/codingcto/pull/42#issuecomment-1",
			"user": {"login": "reviewer"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventIssueComment,
		DeliveryID: "delivery-pr-comment",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	node := planningRepo.nodes[0]
	require.NotNil(t, node.GitHubPRNumber)
	require.Equal(t, 42, *node.GitHubPRNumber)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42", node.GitHubPRURL)
	require.Equal(t, domain.PRNodeStatusPROpened, node.Status)
}

func TestRecordWebhookPublishesReviewFeedbackEvent(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusPROpened},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgeReviewFeedbackReceivedEvent
	bus.Subscribe(domain.EventSpecForgeReviewFeedbackReceived, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeReviewFeedbackReceivedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "created",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"issue": {
			"number": 42,
			"state": "open",
			"pull_request": {"html_url": "https://github.com/agicto/codingcto/pull/42"}
		},
		"comment": {
			"body": "Please preserve the existing API response shape.",
			"html_url": "https://github.com/agicto/codingcto/pull/42#issuecomment-1",
			"user": {"login": "reviewer"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventIssueComment,
		DeliveryID: "delivery-review-feedback",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, 42, published.GitHubPRNumber)
	require.Equal(t, "agicto/codingcto", published.RepositoryFullName)
	require.Equal(t, "Please preserve the existing API response shape.", published.Feedback)
	require.Equal(t, "reviewer", published.AuthorLogin)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42#issuecomment-1", published.HTMLURL)
}

func TestRecordWebhookBlocksPRNodeOnReviewRequestChangesWithoutQueuingPatch(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusReadyForReview},
		},
	}
	bus := infraevents.NewEventBus()
	publishedFeedback := 0
	bus.Subscribe(domain.EventSpecForgeReviewFeedbackReceived, func(ctx context.Context, event infraevents.Event) error {
		publishedFeedback++
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "submitted",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "open",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"}
		},
		"review": {
			"body": "",
			"state": "changes_requested",
			"html_url": "https://github.com/agicto/codingcto/pull/42#pullrequestreview-1",
			"commit_id": "abc123",
			"user": {"login": "reviewer"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequestReview,
		DeliveryID: "delivery-review-request-changes",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.nodes[0].Status)
	require.Equal(t, "abc123", planningRepo.nodes[0].GitHubHeadSHA)
	require.Equal(t, 0, publishedFeedback)
}

func TestRecordWebhookDoesNotDowngradeReadyPRNodeOnIssueComment(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusReadyForReview},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "created",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"issue": {
			"number": 42,
			"state": "open",
			"pull_request": {"html_url": "https://github.com/agicto/codingcto/pull/42"}
		},
		"comment": {
			"body": "Please preserve the existing API response shape.",
			"html_url": "https://github.com/agicto/codingcto/pull/42#issuecomment-1",
			"user": {"login": "reviewer"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventIssueComment,
		DeliveryID: "delivery-ready-pr-comment",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.nodes[0].Status)
}

func TestRecordWebhookDoesNotDowngradeBlockedPRNodeOnReviewComment(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusBlocked},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "created",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "open",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		},
		"comment": {
			"body": "Please handle nil workspace roles.",
			"html_url": "https://github.com/agicto/codingcto/pull/42#discussion_r1",
			"path": "api/internal/modules/invite/service.go",
			"commit_id": "abc123",
			"user": {"login": "reviewer"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequestReviewComment,
		DeliveryID: "delivery-blocked-review-comment",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.nodes[0].Status)
	require.Equal(t, "abc123", planningRepo.nodes[0].GitHubHeadSHA)
}

func TestRecordWebhookUpdatesPRNodeFromWorkflowRun(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		bundle: &domain.SpecForgePlanBundle{
			Idea: &domain.SpecForgeIdea{RepositoryID: "github_agicto__codingcto"},
		},
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPROpened},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeCIFailedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "completed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"workflow_run": {
			"id": 987,
			"name": "API",
			"head_branch": "specforge/team-invite-02-api",
			"head_sha": "def456",
			"status": "completed",
			"conclusion": "failure",
			"html_url": "https://github.com/agicto/codingcto/actions/runs/987"
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventWorkflowRun,
		DeliveryID: "delivery-workflow",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, "def456", planningRepo.nodes[0].GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.nodes[0].Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, "github_agicto__codingcto", published.RepositoryID)
	require.Equal(t, "agicto/codingcto", published.RepositoryFullName)
	require.Equal(t, int64(987), published.WorkflowRunID)
	require.Equal(t, "failure", published.Conclusion)
}

func TestRecordWebhookPublishesCIFailedForUnsuccessfulWorkflowConclusion(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		bundle: &domain.SpecForgePlanBundle{
			Idea: &domain.SpecForgeIdea{RepositoryID: "github_agicto__codingcto"},
		},
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusCIRunning},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeCIFailedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "completed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"workflow_run": {
			"id": 988,
			"name": "API",
			"head_branch": "specforge/team-invite-02-api",
			"head_sha": "timeout-sha",
			"status": "completed",
			"conclusion": "timed_out",
			"html_url": "https://github.com/agicto/codingcto/actions/runs/988"
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventWorkflowRun,
		DeliveryID: "delivery-workflow-timeout",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, "timeout-sha", planningRepo.nodes[0].GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.nodes[0].Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, "timed_out", published.Conclusion)
	require.Equal(t, int64(988), published.WorkflowRunID)
}

func TestRecordWebhookPublishesDependencySatisfiedForSuccessfulWorkflowRun(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusCIRunning},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeDependencySatisfiedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeDependencySatisfied, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeDependencySatisfiedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "completed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"workflow_run": {
			"id": 987,
			"name": "API",
			"head_branch": "specforge/team-invite-01-model",
			"head_sha": "def456",
			"status": "completed",
			"conclusion": "success",
			"html_url": "https://github.com/agicto/codingcto/actions/runs/987"
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventWorkflowRun,
		DeliveryID: "delivery-workflow-success",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.nodes[0].Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, uint(20), published.PlanID)
	require.Equal(t, "PR-001", published.NodeKey)
	require.Equal(t, domain.PRNodeStatusReadyForReview, published.Status)
}

func TestRecordWebhookUpdatesWorkflowRunNodeByPullRequestNumberFallback(t *testing.T) {
	repo := &memoryRepo{}
	prNumber := 42
	planningRepo := &memoryPlanningRepo{
		bundle: &domain.SpecForgePlanBundle{
			Idea: &domain.SpecForgeIdea{RepositoryID: "github_agicto__codingcto"},
		},
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", BranchName: "specforge/team-invite-01-model", GitHubPRNumber: &prNumber, Status: domain.PRNodeStatusCIRunning},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeCIFailedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "completed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"workflow_run": {
			"id": 989,
			"name": "API",
			"head_branch": "unknown-branch",
			"head_sha": "fallback-sha",
			"status": "completed",
			"conclusion": "failure",
			"html_url": "https://github.com/agicto/codingcto/actions/runs/989",
			"pull_requests": [{"number": 42}]
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventWorkflowRun,
		DeliveryID: "delivery-workflow-pr-fallback",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusBlocked, planningRepo.nodes[0].Status)
	require.Equal(t, "fallback-sha", planningRepo.nodes[0].GitHubHeadSHA)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, int64(989), published.WorkflowRunID)
}

func TestRecordWebhookPublishesDependencySatisfiedForMergedPullRequest(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeDependencySatisfiedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeDependencySatisfied, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeDependencySatisfiedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, nil, nil, bus)
	body := []byte(`{
		"action": "closed",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "closed",
			"merged": true,
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-01-model", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-pr-merged",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Equal(t, domain.PRNodeStatusMerged, planningRepo.nodes[0].Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, uint(20), published.PlanID)
	require.Equal(t, domain.PRNodeStatusMerged, published.Status)
}

func TestRecordWebhookDoesNotReapplyExistingDeliveryToPRNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	svc := NewService(repo, nil, nil, nil, nil)
	body := []byte(`{
		"action": "opened",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "open",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)
	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-retry",
		Signature:  "sha256=abc",
		Body:       body,
	})
	require.NoError(t, err)
	svc.planningRepo = planningRepo

	_, err = svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-retry",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.NoError(t, err)
	require.Nil(t, planningRepo.nodes[0].GitHubPRNumber)
	require.Equal(t, domain.PRNodeStatusPlanned, planningRepo.nodes[0].Status)
	require.Len(t, repo.webhookEvents, 1)
}

func TestRecordWebhookMarksFailedWhenApplyFails(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
		updateErr: fmt.Errorf("database unavailable"),
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)
	body := []byte(`{
		"action": "opened",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"},
		"pull_request": {
			"number": 42,
			"state": "open",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	_, err := svc.RecordWebhook(context.Background(), &GitHubWebhookRequest{
		EventType:  GitHubWebhookEventPullRequest,
		DeliveryID: "delivery-failed",
		Signature:  "sha256=abc",
		Body:       body,
	})

	require.Error(t, err)
	require.Len(t, repo.webhookEvents, 1)
	require.Equal(t, GitHubWebhookStatusFailed, repo.webhookEvents[0].Status)
}

func TestListWebhookEventsAppliesFiltersAndLimit(t *testing.T) {
	repo := &memoryRepo{
		webhookEvents: []*domain.GitHubWebhookEvent{
			{ID: 1, DeliveryID: "delivery-1", Status: GitHubWebhookStatusProcessed, RepositoryFullName: "agicto/codingcto", ReceivedAt: time.Now().Add(-2 * time.Minute)},
			{ID: 2, DeliveryID: "delivery-2", Status: GitHubWebhookStatusFailed, RepositoryFullName: "agicto/codingcto", ReceivedAt: time.Now().Add(-1 * time.Minute)},
			{ID: 3, DeliveryID: "delivery-3", Status: GitHubWebhookStatusFailed, RepositoryFullName: "other/repo", ReceivedAt: time.Now()},
		},
	}
	svc := NewService(repo, nil, nil, nil, nil)

	events, err := svc.ListWebhookEvents(context.Background(), &ListWebhookEventsRequest{
		Status:             GitHubWebhookStatusFailed,
		RepositoryFullName: "agicto/codingcto",
		Limit:              1,
	})

	require.NoError(t, err)
	require.Len(t, events, 1)
	require.Equal(t, "delivery-2", events[0].DeliveryID)
}

func TestDeliverPRNodeCreatesDraftPRAndUpdatesNode(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{
				ID:            10,
				NodeKey:       "PR-001",
				Title:         "Add invite API",
				Goal:          "Implement workspace invite API.",
				DependsOn:     []string{"PR-000"},
				EstimatedRisk: "medium",
				ExpectedFiles: []string{
					"api/internal/modules/invitations/*",
					"api/tests/feature/invitations_test.go",
				},
				NonGoals: []string{
					"Do not build frontend UI in this PR",
				},
				AcceptanceCriteria: []string{
					"Admin users can create invites",
				},
				BranchName:   "specforge/team-invite-01-api",
				TestCommands: []string{"go test ./..."},
				Status:       domain.PRNodeStatusReadyForReview,
			},
		},
	}
	client := &fakeRepositoryClient{
		pr: &PullRequest{Number: 42, HTMLURL: "https://github.com/agicto/codingcto/pull/42", Draft: true, Head: PRHead{SHA: "abc123"}},
	}
	factory := &fakeRepositoryClientFactory{client: client}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, factory, tokenProvider, nil)

	node, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, int64(98765), tokenProvider.installationID)
	require.Equal(t, "ghs_installation_token", factory.token)
	require.Equal(t, "agicto", client.input.Owner)
	require.Equal(t, "codingcto", client.input.Repo)
	require.Equal(t, "Add invite API", client.input.Title)
	require.Equal(t, "specforge/team-invite-01-api", client.input.Head)
	require.Equal(t, "main", client.input.Base)
	require.True(t, client.input.Draft)
	require.Contains(t, client.input.Body, "## Linked Spec")
	require.Contains(t, client.input.Body, "PR Node: PR-001")
	require.Contains(t, client.input.Body, "## Scope")
	require.Contains(t, client.input.Body, "- api/internal/modules/invitations/*")
	require.Contains(t, client.input.Body, "## Non-goals")
	require.Contains(t, client.input.Body, "- Do not build frontend UI in this PR")
	require.Contains(t, client.input.Body, "## Acceptance Criteria")
	require.Contains(t, client.input.Body, "- Admin users can create invites")
	require.Contains(t, client.input.Body, "Implement workspace invite API.")
	require.Contains(t, client.input.Body, "- [ ] go test ./...")
	require.Contains(t, client.input.Body, "## Risks")
	require.Contains(t, client.input.Body, "- Estimated risk: medium")
	require.Contains(t, client.input.Body, "## Dependencies")
	require.Contains(t, client.input.Body, "- PR-000")
	require.NotNil(t, node.GitHubPRNumber)
	require.Equal(t, 42, *node.GitHubPRNumber)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42", node.GitHubPRURL)
	require.Equal(t, "abc123", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusPROpened, node.Status)
	require.Equal(t, node.GitHubPRURL, planningRepo.nodes[0].GitHubPRURL)
}

func TestDeliverPRNodeRejectsMismatchedTargetRepository(t *testing.T) {
	repo := &memoryRepo{
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{
				ID:           10,
				NodeKey:      "PR-001",
				Title:        "Add invite API",
				BranchName:   "specforge/team-invite-01-api",
				RepositoryID: "github_agicto__docs",
			},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil, nil)

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestDeliverPRNodeUsesDependencyBranchByDefault(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		bundle: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 10, PlanID: 20, NodeKey: "PR-001", Order: 1, BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusReadyForReview},
				{ID: 11, PlanID: 20, NodeKey: "PR-002", Order: 2, Title: "Add invite API", BranchName: "specforge/team-invite-02-api", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusReadyForReview},
			},
		},
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", Order: 1, BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusReadyForReview},
			{ID: 11, PlanID: 20, NodeKey: "PR-002", Order: 2, Title: "Add invite API", BranchName: "specforge/team-invite-02-api", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusReadyForReview},
		},
	}
	client := &fakeRepositoryClient{
		pr: &PullRequest{Number: 43, HTMLURL: "https://github.com/agicto/codingcto/pull/43", Draft: true, Head: PRHead{SHA: "api123"}},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     11,
	})

	require.NoError(t, err)
	require.Equal(t, "specforge/team-invite-02-api", client.input.Head)
	require.Equal(t, "specforge/team-invite-01-model", client.input.Base)
}

func TestPreparePRNodeBranchCreatesBranchFromDefaultBranch(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, NodeKey: "PR-001", BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	client := &fakeRepositoryClient{branchRef: &GitReference{Object: GitRefObject{SHA: "abc123"}}}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	node, err := svc.PreparePRNodeBranch(context.Background(), &PreparePRNodeBranchRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, uint(10), node.ID)
	require.Equal(t, "agicto", client.getBranchOwner)
	require.Equal(t, "codingcto", client.getBranchRepo)
	require.Equal(t, "main", client.getBranchName)
	require.Equal(t, "specforge/team-invite-01-api", client.createBranchName)
	require.Equal(t, "abc123", client.createBranchSHA)
}

func TestPreparePRNodeBranchUsesDependencyBranchByDefault(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		bundle: &domain.SpecForgePlanBundle{
			PRNodes: []*domain.SpecForgePRNode{
				{ID: 10, PlanID: 20, NodeKey: "PR-001", Order: 1, BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusReadyForReview},
				{ID: 11, PlanID: 20, NodeKey: "PR-002", Order: 2, BranchName: "specforge/team-invite-02-api", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
			},
		},
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, PlanID: 20, NodeKey: "PR-001", Order: 1, BranchName: "specforge/team-invite-01-model", Status: domain.PRNodeStatusReadyForReview},
			{ID: 11, PlanID: 20, NodeKey: "PR-002", Order: 2, BranchName: "specforge/team-invite-02-api", DependsOn: []string{"PR-001"}, Status: domain.PRNodeStatusPlanned},
		},
	}
	client := &fakeRepositoryClient{branchRef: &GitReference{Object: GitRefObject{SHA: "dep123"}}}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	_, err := svc.PreparePRNodeBranch(context.Background(), &PreparePRNodeBranchRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     11,
	})

	require.NoError(t, err)
	require.Equal(t, "specforge/team-invite-01-model", client.getBranchName)
	require.Equal(t, "specforge/team-invite-02-api", client.createBranchName)
	require.Equal(t, "dep123", client.createBranchSHA)
}

func TestPreparePRNodeBranchIgnoresExistingBranch(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, NodeKey: "PR-001", BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	client := &fakeRepositoryClient{
		branchRef:       &GitReference{Object: GitRefObject{SHA: "abc123"}},
		createBranchErr: fmt.Errorf("github repository client: request failed: Reference already exists"),
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	_, err := svc.PreparePRNodeBranch(context.Background(), &PreparePRNodeBranchRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
}

func TestRefreshPRNodeCIUpdatesFromLatestWorkflowRun(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusCIRunning},
		},
	}
	client := &fakeRepositoryClient{
		workflowRuns: []WorkflowRun{
			{HeadBranch: "specforge/team-invite-01-api", HeadSHA: "old", Status: "completed", Conclusion: "failure", CreatedAt: time.Date(2026, 5, 24, 10, 0, 0, 0, time.UTC)},
			{ID: 456, HeadBranch: "specforge/team-invite-01-api", HeadSHA: "new", Status: "completed", Conclusion: "success", HTMLURL: "https://github.com/agicto/codingcto/actions/runs/456", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)},
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeDependencySatisfiedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeDependencySatisfied, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeDependencySatisfiedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, bus)

	node, err := svc.RefreshPRNodeCI(context.Background(), &RefreshPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, "specforge/team-invite-01-api", client.listWorkflowBranch)
	require.Equal(t, "new", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusReadyForReview, node.Status)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.nodes[0].Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, domain.PRNodeStatusReadyForReview, published.Status)
}

func TestRefreshPRNodeCIMarksFailedRunBlocked(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusCIRunning},
		},
	}
	client := &fakeRepositoryClient{
		workflowRuns: []WorkflowRun{{ID: 789, HeadSHA: "failed", Status: "completed", Conclusion: "failure", HTMLURL: "https://github.com/agicto/codingcto/actions/runs/789", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)}},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeCIFailedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, bus)

	node, err := svc.RefreshPRNodeCI(context.Background(), &RefreshPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, "failed", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusBlocked, node.Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, "github_agicto__codingcto", published.RepositoryID)
	require.Equal(t, "agicto/codingcto", published.RepositoryFullName)
	require.Equal(t, int64(789), published.WorkflowRunID)
	require.Equal(t, "failure", published.Conclusion)
}

func TestRefreshPRNodeCIPublishesFailedEventForUnsuccessfulConclusion(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusCIRunning},
		},
	}
	client := &fakeRepositoryClient{
		workflowRuns: []WorkflowRun{{ID: 790, HeadSHA: "timeout", Status: "completed", Conclusion: "timed_out", HTMLURL: "https://github.com/agicto/codingcto/actions/runs/790", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)}},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgePRNodeCIFailedEvent
	bus.Subscribe(domain.EventSpecForgePRNodeCIFailed, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgePRNodeCIFailedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, bus)

	node, err := svc.RefreshPRNodeCI(context.Background(), &RefreshPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, "timeout", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusBlocked, node.Status)
	require.Equal(t, uint(10), published.PRNodeID)
	require.Equal(t, int64(790), published.WorkflowRunID)
	require.Equal(t, "timed_out", published.Conclusion)
}

func TestReadPRNodeFailureLogReturnsLatestFailedJobLogs(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-01-api", Status: domain.PRNodeStatusBlocked},
		},
	}
	client := &fakeRepositoryClient{
		workflowRuns: []WorkflowRun{{ID: 123, HeadSHA: "abc123", Status: "completed", Conclusion: "failure", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)}},
		workflowJobs: []WorkflowJob{
			{ID: 987, Name: "API", Conclusion: "failure", Steps: []WorkflowStep{{Name: "go test", Conclusion: "failure"}}},
		},
		workflowLogs: "go test ./...\n--- FAIL: TestInvite\n",
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	failure, err := svc.ReadPRNodeFailureLog(context.Background(), &ReadPRNodeFailureLogRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, uint(10), failure.PRNodeID)
	require.Equal(t, int64(123), failure.WorkflowRunID)
	require.Equal(t, int64(987), failure.JobID)
	require.Equal(t, "API", failure.JobName)
	require.Equal(t, "abc123", failure.HeadSHA)
	require.Contains(t, failure.LogExcerpt, "--- FAIL: TestInvite")
	require.Equal(t, []string{"go test"}, failure.FailedSteps)
}

func TestDeliverPRNodeAllowsOverrides(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, Title: "Original", BranchName: "specforge/custom", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	client := &fakeRepositoryClient{pr: &PullRequest{Number: 43, HTMLURL: "https://github.com/agicto/codingcto/pull/43"}}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)
	ready := false

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
		Title:        "Custom title",
		Body:         "Custom body",
		BaseBranch:   "develop",
		Draft:        &ready,
	})

	require.NoError(t, err)
	require.Equal(t, "Custom title", client.input.Title)
	require.Equal(t, "Custom body\n\nCo-authored-by: codingcto-agent <github@codingcto.local>\n", client.input.Body)
	require.Equal(t, "develop", client.input.Base)
	require.False(t, client.input.Draft)
}

func TestDeliverPRNodeRejectsMalformedPullRequestResponse(t *testing.T) {
	repo := &memoryRepo{
		installation: &domain.GitHubInstallation{
			ID:             3,
			InstallationID: 98765,
		},
		repository: &domain.Repository{
			ID:                   1,
			RepositoryID:         "github_agicto__codingcto",
			GitHubInstallationID: 3,
			GitHubOwner:          "agicto",
			GitHubRepo:           "codingcto",
			DefaultBranch:        "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, Title: "Original", BranchName: "specforge/custom", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	client := &fakeRepositoryClient{pr: &PullRequest{Number: 0, HTMLURL: ""}}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider, nil)

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.Error(t, err)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.nodes[0].Status)
	require.Empty(t, planningRepo.nodes[0].GitHubPRURL)
}

func TestVerifyGitHubSignature(t *testing.T) {
	body := []byte(`{"zen":"Keep it logically awesome."}`)
	signature := githubSignature("secret", body)

	require.True(t, verifyGitHubSignature("secret", body, signature))
	require.False(t, verifyGitHubSignature("wrong", body, signature))
	require.False(t, verifyGitHubSignature("", body, signature))
	require.False(t, verifyGitHubSignature("secret", body, "bad"))
}

func readinessCheck(t *testing.T, checks []GitHubReadinessCheck, key string) GitHubReadinessCheck {
	t.Helper()
	for _, check := range checks {
		if check.Key == key {
			return check
		}
	}
	require.Failf(t, "missing readiness check", "key %s not found", key)
	return GitHubReadinessCheck{}
}

type fakeRepositoryClientFactory struct {
	token  string
	client *fakeRepositoryClient
	err    error
}

func (f *fakeRepositoryClientFactory) NewRepositoryClient(token string) (RepositoryClient, error) {
	f.token = token
	return f.client, f.err
}

type fakeRepositoryClient struct {
	issueInput         CreateIssueInput
	issue              *Issue
	issueErr           error
	input              CreatePullRequestInput
	pr                 *PullRequest
	err                error
	branchRef          *GitReference
	getBranchOwner     string
	getBranchRepo      string
	getBranchName      string
	getBranchErr       error
	createBranchName   string
	createBranchSHA    string
	createBranchErr    error
	tree               *GitTree
	listTreeRef        string
	listTreeRecursive  bool
	listTreeErr        error
	file               *RepositoryFile
	readFilePath       string
	readFileRef        string
	readFileErr        error
	workflowRuns       []WorkflowRun
	listWorkflowBranch string
	listWorkflowErr    error
	workflowJobs       []WorkflowJob
	listWorkflowRunID  int64
	listWorkflowJobErr error
	workflowLogs       string
	workflowLogJobID   int64
	workflowLogErr     error
	installationRepos  []InstallationRepository
	listReposErr       error
}

func (c *fakeRepositoryClient) ListInstallationRepositories(ctx context.Context) ([]InstallationRepository, error) {
	return c.installationRepos, c.listReposErr
}

func (c *fakeRepositoryClient) GetBranchRef(ctx context.Context, owner, repo, branch string) (*GitReference, error) {
	c.getBranchOwner = owner
	c.getBranchRepo = repo
	c.getBranchName = branch
	return c.branchRef, c.getBranchErr
}

func (c *fakeRepositoryClient) ListRepositoryTree(ctx context.Context, owner, repo, ref string, recursive bool) (*GitTree, error) {
	c.listTreeRef = ref
	c.listTreeRecursive = recursive
	return c.tree, c.listTreeErr
}

func (c *fakeRepositoryClient) GetRepositoryFile(ctx context.Context, owner, repo, path, ref string) (*RepositoryFile, error) {
	c.readFilePath = path
	c.readFileRef = ref
	return c.file, c.readFileErr
}

func (c *fakeRepositoryClient) CreateBranch(ctx context.Context, owner, repo, branch, sha string) (*GitReference, error) {
	c.createBranchName = branch
	c.createBranchSHA = sha
	return &GitReference{Ref: "refs/heads/" + branch, Object: GitRefObject{SHA: sha}}, c.createBranchErr
}

func (c *fakeRepositoryClient) CreateIssue(ctx context.Context, input CreateIssueInput) (*Issue, error) {
	c.issueInput = input
	return c.issue, c.issueErr
}

func (c *fakeRepositoryClient) CreatePullRequest(ctx context.Context, input CreatePullRequestInput) (*PullRequest, error) {
	c.input = input
	return c.pr, c.err
}

func (c *fakeRepositoryClient) ListWorkflowRuns(ctx context.Context, owner, repo, branch string) ([]WorkflowRun, error) {
	c.listWorkflowBranch = branch
	return c.workflowRuns, c.listWorkflowErr
}

func (c *fakeRepositoryClient) ListWorkflowJobs(ctx context.Context, owner, repo string, runID int64) ([]WorkflowJob, error) {
	c.listWorkflowRunID = runID
	return c.workflowJobs, c.listWorkflowJobErr
}

func (c *fakeRepositoryClient) GetWorkflowJobLogs(ctx context.Context, owner, repo string, jobID int64) (string, error) {
	c.workflowLogJobID = jobID
	return c.workflowLogs, c.workflowLogErr
}

type fakeInstallationTokenProvider struct {
	installationID int64
	token          *InstallationToken
	installation   *GitHubAppInstallation
	err            error
}

func (p *fakeInstallationTokenProvider) InstallationToken(ctx context.Context, installationID int64) (*InstallationToken, error) {
	p.installationID = installationID
	return p.token, p.err
}

func (p *fakeInstallationTokenProvider) Installation(ctx context.Context, installationID int64) (*GitHubAppInstallation, error) {
	p.installationID = installationID
	return p.installation, p.err
}

type memoryPlanningRepo struct {
	bundle    *domain.SpecForgePlanBundle
	nodes     []*domain.SpecForgePRNode
	updateErr error
}

func (r *memoryPlanningRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	return nil
}

func (r *memoryPlanningRepo) CreateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	return nil
}

func (r *memoryPlanningRepo) FindRequirementByID(ctx context.Context, requirementID uint) (*domain.SpecForgeRequirement, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdateRequirement(ctx context.Context, requirement *domain.SpecForgeRequirement) error {
	return nil
}

func (r *memoryPlanningRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindLatestPlanBundleByRequirementID(ctx context.Context, requirementID uint) (*domain.SpecForgePlanBundle, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	if r.bundle == nil {
		return nil, domain.ErrNotFound
	}
	return r.bundle, nil
}

func (r *memoryPlanningRepo) NextPlanVersionByRequirementID(ctx context.Context, requirementID uint) (int, error) {
	return 1, nil
}

func (r *memoryPlanningRepo) FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	for _, node := range r.nodes {
		if node.ID == prNodeID {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPRNodeByBranchName(ctx context.Context, branchName string) (*domain.SpecForgePRNode, error) {
	for _, node := range r.nodes {
		if node.BranchName == branchName {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPRNodeByGitHubPRNumber(ctx context.Context, prNumber int) (*domain.SpecForgePRNode, error) {
	for _, node := range r.nodes {
		if node.GitHubPRNumber != nil && *node.GitHubPRNumber == prNumber {
			copied := *node
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdatePRNode(ctx context.Context, node *domain.SpecForgePRNode) error {
	if r.updateErr != nil {
		return r.updateErr
	}
	for i, existing := range r.nodes {
		if existing.ID == node.ID {
			copied := *node
			r.nodes[i] = &copied
			return nil
		}
	}
	return domain.ErrNotFound
}

func (r *memoryPlanningRepo) CreateCompiledPrompt(ctx context.Context, prompt *domain.SpecForgeCompiledPrompt) error {
	return nil
}

func (r *memoryPlanningRepo) FindLatestCompiledPromptByPRNodeID(ctx context.Context, prNodeID uint) (*domain.SpecForgeCompiledPrompt, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindLatestCompiledPromptByPRNodeIDAndType(ctx context.Context, prNodeID uint, promptType string) (*domain.SpecForgeCompiledPrompt, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) UpdatePlan(ctx context.Context, plan *domain.SpecForgeImplementationPlan) error {
	return nil
}

type memoryRepo struct {
	nextID        uint
	installation  *domain.GitHubInstallation
	repository    *domain.Repository
	settings      *domain.GitHubSettings
	webhookEvents []*domain.GitHubWebhookEvent
}

func (r *memoryRepo) UpsertInstallation(ctx context.Context, installation *domain.GitHubInstallation) error {
	if r.installation == nil {
		r.nextID++
		installation.ID = r.nextID
	}
	copied := *installation
	r.installation = &copied
	return nil
}

func (r *memoryRepo) FindInstallationByID(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	if r.installation == nil || r.installation.ID != id {
		return nil, domain.ErrNotFound
	}
	copied := *r.installation
	return &copied, nil
}

func (r *memoryRepo) FindInstallationByGitHubID(ctx context.Context, installationID int64) (*domain.GitHubInstallation, error) {
	if r.installation == nil || r.installation.InstallationID != installationID {
		return nil, domain.ErrNotFound
	}
	copied := *r.installation
	return &copied, nil
}

func (r *memoryRepo) UpsertRepository(ctx context.Context, repository *domain.Repository) error {
	if r.repository == nil {
		r.nextID++
		repository.ID = r.nextID
	}
	copied := *repository
	r.repository = &copied
	return nil
}

func (r *memoryRepo) FindRepositoryByRepositoryID(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	if r.repository == nil || r.repository.RepositoryID != repositoryID {
		return nil, domain.ErrNotFound
	}
	copied := *r.repository
	return &copied, nil
}

func (r *memoryRepo) ListRepositoriesByWorkspaceID(ctx context.Context, workspaceID string) ([]*domain.Repository, error) {
	if r.repository == nil || r.repository.WorkspaceID != workspaceID {
		return []*domain.Repository{}, nil
	}
	copied := *r.repository
	return []*domain.Repository{&copied}, nil
}

func (r *memoryRepo) UpsertSettings(ctx context.Context, settings *domain.GitHubSettings) error {
	if r.settings == nil {
		r.nextID++
		settings.ID = r.nextID
	}
	copied := *settings
	r.settings = &copied
	return nil
}

func (r *memoryRepo) FindSettingsByWorkspaceID(ctx context.Context, workspaceID string) (*domain.GitHubSettings, error) {
	if r.settings == nil || r.settings.WorkspaceID != workspaceID {
		return nil, domain.ErrNotFound
	}
	copied := *r.settings
	return &copied, nil
}

func (r *memoryRepo) CreateWebhookEvent(ctx context.Context, event *domain.GitHubWebhookEvent) error {
	r.nextID++
	event.ID = r.nextID
	copied := *event
	r.webhookEvents = append(r.webhookEvents, &copied)
	return nil
}

func (r *memoryRepo) FindWebhookEventByDeliveryID(ctx context.Context, deliveryID string) (*domain.GitHubWebhookEvent, error) {
	for _, event := range r.webhookEvents {
		if event.DeliveryID == deliveryID {
			copied := *event
			return &copied, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (r *memoryRepo) ListWebhookEvents(ctx context.Context, status, repositoryFullName string, limit int) ([]*domain.GitHubWebhookEvent, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	out := make([]*domain.GitHubWebhookEvent, 0)
	for _, event := range r.webhookEvents {
		if status != "" && event.Status != status {
			continue
		}
		if repositoryFullName != "" && event.RepositoryFullName != repositoryFullName {
			continue
		}
		copied := *event
		out = append(out, &copied)
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}

func (r *memoryRepo) UpdateWebhookEventStatus(ctx context.Context, deliveryID, status string) error {
	for _, event := range r.webhookEvents {
		if event.DeliveryID == deliveryID {
			event.Status = status
			return nil
		}
	}
	return domain.ErrNotFound
}

func githubSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
