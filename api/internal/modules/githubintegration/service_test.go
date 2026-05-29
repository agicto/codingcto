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
)

func TestUpsertInstallationNormalizesPermissions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

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

func TestUpsertRepositoryDefaultsRepositoryIDAndBranch(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)

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
	require.True(t, repository.IsPrivate)
	require.Equal(t, uint(9), repository.CreatedBy)
}

func TestGetRepositoryReturnsStoredRepository(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil, nil)
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
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, tokenProvider)

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
	svc := NewService(repo, nil, &fakeRepositoryClientFactory{client: client}, &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}})

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
	svc := NewService(repo, nil, nil, nil)
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
	svc := NewService(repo, planningRepo, nil, nil)
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

func TestRecordWebhookUpdatesPRNodeFromWorkflowRun(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPROpened},
		},
	}
	svc := NewService(repo, planningRepo, nil, nil)
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
}

func TestRecordWebhookDoesNotReapplyExistingDeliveryToPRNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	svc := NewService(repo, nil, nil, nil)
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
	svc := NewService(repo, planningRepo, nil, nil)
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
	svc := NewService(repo, nil, nil, nil)

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
				ID:           10,
				NodeKey:      "PR-001",
				Title:        "Add invite API",
				Goal:         "Implement workspace invite API.",
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
	svc := NewService(repo, planningRepo, factory, tokenProvider)

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
	require.Contains(t, client.input.Body, "Implement workspace invite API.")
	require.Contains(t, client.input.Body, "- [ ] go test ./...")
	require.NotNil(t, node.GitHubPRNumber)
	require.Equal(t, 42, *node.GitHubPRNumber)
	require.Equal(t, "https://github.com/agicto/codingcto/pull/42", node.GitHubPRURL)
	require.Equal(t, "abc123", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusPROpened, node.Status)
	require.Equal(t, node.GitHubPRURL, planningRepo.nodes[0].GitHubPRURL)
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
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

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
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

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
			{HeadBranch: "specforge/team-invite-01-api", HeadSHA: "new", Status: "completed", Conclusion: "success", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)},
		},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

	node, err := svc.RefreshPRNodeCI(context.Background(), &RefreshPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, "specforge/team-invite-01-api", client.listWorkflowBranch)
	require.Equal(t, "new", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusReadyForReview, node.Status)
	require.Equal(t, domain.PRNodeStatusReadyForReview, planningRepo.nodes[0].Status)
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
		workflowRuns: []WorkflowRun{{HeadSHA: "failed", Status: "completed", Conclusion: "failure", CreatedAt: time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)}},
	}
	tokenProvider := &fakeInstallationTokenProvider{token: &InstallationToken{Token: "ghs_installation_token"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

	node, err := svc.RefreshPRNodeCI(context.Background(), &RefreshPRNodeCIRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
	})

	require.NoError(t, err)
	require.Equal(t, "failed", node.GitHubHeadSHA)
	require.Equal(t, domain.PRNodeStatusBlocked, node.Status)
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
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

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
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)
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
	require.Equal(t, "Custom body", client.input.Body)
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
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client}, tokenProvider)

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
	err            error
}

func (p *fakeInstallationTokenProvider) InstallationToken(ctx context.Context, installationID int64) (*InstallationToken, error) {
	p.installationID = installationID
	return p.token, p.err
}

type memoryPlanningRepo struct {
	nodes     []*domain.SpecForgePRNode
	updateErr error
}

func (r *memoryPlanningRepo) CreatePlanBundle(ctx context.Context, bundle *domain.SpecForgePlanBundle) error {
	return nil
}

func (r *memoryPlanningRepo) FindPlanBundleByIdeaID(ctx context.Context, ideaID uint) (*domain.SpecForgePlanBundle, error) {
	return nil, domain.ErrNotFound
}

func (r *memoryPlanningRepo) FindPlanBundleByPlanID(ctx context.Context, planID uint) (*domain.SpecForgePlanBundle, error) {
	return nil, domain.ErrNotFound
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
