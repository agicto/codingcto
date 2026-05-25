package githubintegration

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
)

func TestUpsertInstallationNormalizesPermissions(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

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
	svc := NewService(repo, nil, nil)

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
	svc := NewService(repo, nil, nil)
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

func TestRecordWebhookParsesMetadataAndIsIdempotent(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)
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
	require.Equal(t, "received", first.Status)
	require.Len(t, repo.webhookEvents, 1)
}

func TestRecordWebhookLinksPullRequestToPRNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	svc := NewService(repo, planningRepo, nil)
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
	svc := NewService(repo, planningRepo, nil)
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

func TestRecordWebhookReappliesExistingDeliveryToPRNode(t *testing.T) {
	repo := &memoryRepo{}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, BranchName: "specforge/team-invite-02-api", Status: domain.PRNodeStatusPlanned},
		},
	}
	svc := NewService(repo, nil, nil)
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
	require.NotNil(t, planningRepo.nodes[0].GitHubPRNumber)
	require.Equal(t, 42, *planningRepo.nodes[0].GitHubPRNumber)
	require.Len(t, repo.webhookEvents, 1)
}

func TestDeliverPRNodeCreatesDraftPRAndUpdatesNode(t *testing.T) {
	repo := &memoryRepo{
		repository: &domain.Repository{
			ID:            1,
			RepositoryID:  "github_agicto__codingcto",
			GitHubOwner:   "agicto",
			GitHubRepo:    "codingcto",
			DefaultBranch: "main",
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
		pr: &PullRequest{Number: 42, HTMLURL: "https://github.com/agicto/codingcto/pull/42", Draft: true},
	}
	factory := &fakeRepositoryClientFactory{client: client}
	svc := NewService(repo, planningRepo, factory)

	node, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
		Token:        "ghs_token",
	})

	require.NoError(t, err)
	require.Equal(t, "ghs_token", factory.token)
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
	require.Equal(t, domain.PRNodeStatusPROpened, node.Status)
	require.Equal(t, node.GitHubPRURL, planningRepo.nodes[0].GitHubPRURL)
}

func TestDeliverPRNodeAllowsOverrides(t *testing.T) {
	repo := &memoryRepo{
		repository: &domain.Repository{
			ID:            1,
			RepositoryID:  "github_agicto__codingcto",
			GitHubOwner:   "agicto",
			GitHubRepo:    "codingcto",
			DefaultBranch: "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, Title: "Original", BranchName: "specforge/custom", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	client := &fakeRepositoryClient{pr: &PullRequest{Number: 43, HTMLURL: "https://github.com/agicto/codingcto/pull/43"}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client})
	ready := false

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
		Token:        "ghs_token",
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
		repository: &domain.Repository{
			ID:            1,
			RepositoryID:  "github_agicto__codingcto",
			GitHubOwner:   "agicto",
			GitHubRepo:    "codingcto",
			DefaultBranch: "main",
		},
	}
	planningRepo := &memoryPlanningRepo{
		nodes: []*domain.SpecForgePRNode{
			{ID: 10, Title: "Original", BranchName: "specforge/custom", Status: domain.PRNodeStatusReadyForReview},
		},
	}
	client := &fakeRepositoryClient{pr: &PullRequest{Number: 0, HTMLURL: ""}}
	svc := NewService(repo, planningRepo, &fakeRepositoryClientFactory{client: client})

	_, err := svc.DeliverPRNode(context.Background(), &DeliverPRNodeRequest{
		RepositoryID: "github_agicto__codingcto",
		PRNodeID:     10,
		Token:        "ghs_token",
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
	input CreatePullRequestInput
	pr    *PullRequest
	err   error
}

func (c *fakeRepositoryClient) CreatePullRequest(ctx context.Context, input CreatePullRequestInput) (*PullRequest, error) {
	c.input = input
	return c.pr, c.err
}

type memoryPlanningRepo struct {
	nodes []*domain.SpecForgePRNode
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

func githubSignature(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
