package githubintegration

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error)
	GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error)
	UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error)
	GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error)
	DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error)
	RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error)
}

type service struct {
	repo          domain.GitHubIntegrationRepository
	planningRepo  domain.SpecForgePlanningRepository
	clientFactory RepositoryClientFactory
}

func NewService(repo domain.GitHubIntegrationRepository, planningRepo domain.SpecForgePlanningRepository, clientFactory RepositoryClientFactory) *service {
	if clientFactory == nil {
		clientFactory = defaultRepositoryClientFactory{}
	}
	return &service{repo: repo, planningRepo: planningRepo, clientFactory: clientFactory}
}

func (s *service) UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || req.InstallationID == 0 || strings.TrimSpace(req.AccountLogin) == "" {
		return nil, domain.ErrInvalidInput
	}
	installation := &domain.GitHubInstallation{
		WorkspaceID:    strings.TrimSpace(req.WorkspaceID),
		InstallationID: req.InstallationID,
		AccountLogin:   strings.TrimSpace(req.AccountLogin),
		Permissions:    normalizePermissions(req.Permissions),
		CreatedBy:      userID,
	}
	if err := s.repo.UpsertInstallation(ctx, installation); err != nil {
		return nil, fmt.Errorf("upsert github installation: %w", err)
	}
	return installation, nil
}

func (s *service) GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindInstallationByID(ctx, id)
}

func (s *service) UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || req.GitHubInstallationID == 0 || strings.TrimSpace(req.GitHubOwner) == "" || strings.TrimSpace(req.GitHubRepo) == "" {
		return nil, domain.ErrInvalidInput
	}
	defaultBranch := strings.TrimSpace(req.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	repositoryID := strings.TrimSpace(req.RepositoryID)
	if repositoryID == "" {
		repositoryID = fmt.Sprintf("github_%s__%s", strings.TrimSpace(req.GitHubOwner), strings.TrimSpace(req.GitHubRepo))
	}

	repository := &domain.Repository{
		RepositoryID:         repositoryID,
		WorkspaceID:          strings.TrimSpace(req.WorkspaceID),
		GitHubInstallationID: req.GitHubInstallationID,
		GitHubOwner:          strings.TrimSpace(req.GitHubOwner),
		GitHubRepo:           strings.TrimSpace(req.GitHubRepo),
		DefaultBranch:        defaultBranch,
		IsPrivate:            req.IsPrivate,
		CreatedBy:            userID,
	}
	if err := s.repo.UpsertRepository(ctx, repository); err != nil {
		return nil, fmt.Errorf("upsert repository: %w", err)
	}
	return repository, nil
}

func (s *service) GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	if strings.TrimSpace(repositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(repositoryID))
}

func (s *service) DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 || strings.TrimSpace(req.Token) == "" {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(node.BranchName) == "" {
		return nil, domain.ErrInvalidInput
	}
	baseBranch := strings.TrimSpace(req.BaseBranch)
	if baseBranch == "" {
		baseBranch = repository.DefaultBranch
	}
	if baseBranch == "" {
		baseBranch = "main"
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = node.Title
	}
	draft := true
	if req.Draft != nil {
		draft = *req.Draft
	}
	client, err := s.clientFactory.NewRepositoryClient(strings.TrimSpace(req.Token))
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("github integration: repository client is required")
	}
	pr, err := client.CreatePullRequest(ctx, CreatePullRequestInput{
		Owner: repository.GitHubOwner,
		Repo:  repository.GitHubRepo,
		Title: title,
		Head:  node.BranchName,
		Base:  baseBranch,
		Body:  prDescription(node, strings.TrimSpace(req.Body)),
		Draft: draft,
	})
	if err != nil {
		return nil, err
	}
	if pr == nil || pr.Number == 0 || strings.TrimSpace(pr.HTMLURL) == "" {
		return nil, fmt.Errorf("github integration: pull request response missing number or URL")
	}
	node.GitHubPRNumber = &pr.Number
	node.GitHubPRURL = pr.HTMLURL
	node.Status = domain.PRNodeStatusPROpened
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error) {
	if req == nil || strings.TrimSpace(req.EventType) == "" || strings.TrimSpace(req.DeliveryID) == "" || len(req.Body) == 0 {
		return nil, domain.ErrInvalidInput
	}
	existing, err := s.repo.FindWebhookEventByDeliveryID(ctx, strings.TrimSpace(req.DeliveryID))
	if err == nil {
		if applyErr := s.applyWebhookToPRNode(ctx, existing.EventType, req.Body); applyErr != nil {
			return nil, applyErr
		}
		return existing, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	metadata := parseWebhookMetadata(req.Body)
	event := &domain.GitHubWebhookEvent{
		DeliveryID:         strings.TrimSpace(req.DeliveryID),
		EventType:          strings.TrimSpace(req.EventType),
		Action:             metadata.Action,
		InstallationID:     metadata.InstallationID,
		RepositoryFullName: metadata.RepositoryFullName,
		Payload:            string(req.Body),
		Signature:          strings.TrimSpace(req.Signature),
		Status:             "received",
		ReceivedAt:         time.Now(),
	}
	if err := s.repo.CreateWebhookEvent(ctx, event); err != nil {
		return nil, fmt.Errorf("record github webhook: %w", err)
	}
	if err := s.applyWebhookToPRNode(ctx, event.EventType, req.Body); err != nil {
		return nil, err
	}
	return event, nil
}

func prDescription(node *domain.SpecForgePRNode, body string) string {
	if body != "" {
		return body
	}
	return fmt.Sprintf("## Summary\n\n%s\n\n## PR Node\n\n%s\n\n## Test Plan\n\n%s\n\nGenerated by SpecForge.\n",
		strings.TrimSpace(node.Goal),
		strings.TrimSpace(node.NodeKey),
		formatMarkdownList(node.TestCommands),
	)
}

func formatMarkdownList(items []string) string {
	if len(items) == 0 {
		return "- Not run yet"
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		lines = append(lines, "- [ ] "+item)
	}
	if len(lines) == 0 {
		return "- Not run yet"
	}
	return strings.Join(lines, "\n")
}

func (s *service) applyWebhookToPRNode(ctx context.Context, eventType string, body []byte) error {
	if s.planningRepo == nil {
		return nil
	}
	event, err := ParseGitHubWebhookPayload(eventType, body)
	if err != nil {
		return nil
	}
	switch {
	case event.PullRequest != nil:
		return s.updatePRNodeFromPullRequest(ctx, event.PullRequest)
	case event.WorkflowRun != nil:
		return s.updatePRNodeFromWorkflowRun(ctx, event.WorkflowRun)
	default:
		return nil
	}
}

func (s *service) updatePRNodeFromPullRequest(ctx context.Context, pr *WebhookPullRequest) error {
	if strings.TrimSpace(pr.HeadBranch) == "" {
		return nil
	}
	node, err := s.planningRepo.FindPRNodeByBranchName(ctx, pr.HeadBranch)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	node.GitHubPRNumber = &pr.Number
	node.GitHubPRURL = pr.HTMLURL
	node.GitHubHeadSHA = pr.HeadSHA
	node.Status = domain.PRNodeStatusPROpened
	return s.planningRepo.UpdatePRNode(ctx, node)
}

func (s *service) updatePRNodeFromWorkflowRun(ctx context.Context, run *WebhookWorkflowRun) error {
	if strings.TrimSpace(run.HeadBranch) == "" {
		return nil
	}
	node, err := s.planningRepo.FindPRNodeByBranchName(ctx, run.HeadBranch)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	node.GitHubHeadSHA = run.HeadSHA
	if strings.TrimSpace(run.Status) != "completed" {
		node.Status = domain.PRNodeStatusCIRunning
	} else if strings.TrimSpace(run.Conclusion) == "success" {
		node.Status = domain.PRNodeStatusReadyForReview
	} else if strings.TrimSpace(run.Conclusion) != "" {
		node.Status = domain.PRNodeStatusBlocked
	}
	return s.planningRepo.UpdatePRNode(ctx, node)
}

func normalizePermissions(permissions map[string]string) map[string]string {
	out := make(map[string]string, len(permissions))
	for key, value := range permissions {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		out[key] = value
	}
	return out
}

func verifyGitHubSignature(secret string, body []byte, signature string) bool {
	secret = strings.TrimSpace(secret)
	signature = strings.TrimSpace(signature)
	if secret == "" || len(body) == 0 || !strings.HasPrefix(signature, "sha256=") {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

type webhookMetadata struct {
	Action             string
	InstallationID     int64
	RepositoryFullName string
}

func parseWebhookMetadata(body []byte) webhookMetadata {
	event, err := ParseGitHubWebhookPayload("metadata", body)
	if err != nil {
		return webhookMetadata{}
	}
	return webhookMetadata{
		Action:             event.Action,
		InstallationID:     event.InstallationID,
		RepositoryFullName: event.RepositoryFullName,
	}
}
