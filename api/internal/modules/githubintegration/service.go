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
	PreparePRNodeBranch(ctx context.Context, req *PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error)
	DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error)
	RefreshPRNodeCI(ctx context.Context, req *RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error)
	ReadPRNodeFailureLog(ctx context.Context, req *ReadPRNodeFailureLogRequest) (*PRNodeFailureLog, error)
	RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error)
}

type service struct {
	repo          domain.GitHubIntegrationRepository
	planningRepo  domain.SpecForgePlanningRepository
	clientFactory RepositoryClientFactory
	tokenProvider InstallationTokenProvider
}

func NewService(repo domain.GitHubIntegrationRepository, planningRepo domain.SpecForgePlanningRepository, clientFactory RepositoryClientFactory, tokenProvider InstallationTokenProvider) *service {
	if clientFactory == nil {
		clientFactory = defaultRepositoryClientFactory{}
	}
	if tokenProvider == nil {
		tokenProvider = defaultInstallationTokenProvider{}
	}
	return &service{repo: repo, planningRepo: planningRepo, clientFactory: clientFactory, tokenProvider: tokenProvider}
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

func (s *service) PreparePRNodeBranch(ctx context.Context, req *PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
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
	baseBranch := resolveBaseBranch(repository, req.BaseBranch)
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	baseRef, err := client.GetBranchRef(ctx, repository.GitHubOwner, repository.GitHubRepo, baseBranch)
	if err != nil {
		return nil, err
	}
	if baseRef == nil || strings.TrimSpace(baseRef.Object.SHA) == "" {
		return nil, fmt.Errorf("github integration: base branch response missing sha")
	}
	if _, err := client.CreateBranch(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName, baseRef.Object.SHA); err != nil {
		if !isBranchAlreadyExistsError(err) {
			return nil, err
		}
	}
	return node, nil
}

func (s *service) DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
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
	baseBranch := resolveBaseBranch(repository, req.BaseBranch)
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = node.Title
	}
	draft := true
	if req.Draft != nil {
		draft = *req.Draft
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
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
	if strings.TrimSpace(pr.Head.SHA) != "" {
		node.GitHubHeadSHA = strings.TrimSpace(pr.Head.SHA)
	}
	node.Status = domain.PRNodeStatusPROpened
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) RefreshPRNodeCI(ctx context.Context, req *RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
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
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	runs, err := client.ListWorkflowRuns(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName)
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return node, nil
	}
	latest := latestWorkflowRun(runs)
	applyWorkflowRunState(node, latest.HeadSHA, latest.Status, latest.Conclusion)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) ReadPRNodeFailureLog(ctx context.Context, req *ReadPRNodeFailureLogRequest) (*PRNodeFailureLog, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
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
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	runs, err := client.ListWorkflowRuns(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName)
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return nil, domain.ErrNotFound
	}
	latest := latestWorkflowRun(runs)
	jobs, err := client.ListWorkflowJobs(ctx, repository.GitHubOwner, repository.GitHubRepo, latest.ID)
	if err != nil {
		return nil, err
	}
	job := firstFailedWorkflowJob(jobs)
	if job == nil {
		return nil, domain.ErrNotFound
	}
	logs, err := client.GetWorkflowJobLogs(ctx, repository.GitHubOwner, repository.GitHubRepo, job.ID)
	if err != nil {
		return nil, err
	}
	return &PRNodeFailureLog{
		PRNodeID:      node.ID,
		WorkflowRunID: latest.ID,
		JobID:         job.ID,
		JobName:       job.Name,
		HeadSHA:       latest.HeadSHA,
		LogExcerpt:    trimLogExcerpt(logs, 20000),
		FailedSteps:   failedStepNames(job.Steps),
	}, nil
}

func (s *service) repositoryClientForRepository(ctx context.Context, repository *domain.Repository) (RepositoryClient, error) {
	installation, err := s.repo.FindInstallationByID(ctx, repository.GitHubInstallationID)
	if err != nil {
		return nil, err
	}
	token, err := s.tokenProvider.InstallationToken(ctx, installation.InstallationID)
	if err != nil {
		return nil, err
	}
	if token == nil || strings.TrimSpace(token.Token) == "" {
		return nil, fmt.Errorf("github integration: installation token is required")
	}
	client, err := s.clientFactory.NewRepositoryClient(strings.TrimSpace(token.Token))
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("github integration: repository client is required")
	}
	return client, nil
}

func (s *service) RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error) {
	if req == nil || strings.TrimSpace(req.EventType) == "" || strings.TrimSpace(req.DeliveryID) == "" || len(req.Body) == 0 {
		return nil, domain.ErrInvalidInput
	}
	existing, err := s.repo.FindWebhookEventByDeliveryID(ctx, strings.TrimSpace(req.DeliveryID))
	if err == nil {
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
		Status:             GitHubWebhookStatusReceived,
		ReceivedAt:         time.Now(),
	}
	if err := s.repo.CreateWebhookEvent(ctx, event); err != nil {
		return nil, fmt.Errorf("record github webhook: %w", err)
	}
	if err := s.applyWebhookToPRNode(ctx, event.EventType, req.Body); err != nil {
		if updateErr := s.repo.UpdateWebhookEventStatus(ctx, event.DeliveryID, GitHubWebhookStatusFailed); updateErr != nil {
			return nil, fmt.Errorf("mark github webhook failed: %w", updateErr)
		}
		event.Status = GitHubWebhookStatusFailed
		return nil, err
	}
	if err := s.repo.UpdateWebhookEventStatus(ctx, event.DeliveryID, GitHubWebhookStatusProcessed); err != nil {
		return nil, fmt.Errorf("mark github webhook processed: %w", err)
	}
	event.Status = GitHubWebhookStatusProcessed
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

func resolveBaseBranch(repository *domain.Repository, override string) string {
	baseBranch := strings.TrimSpace(override)
	if baseBranch == "" && repository != nil {
		baseBranch = strings.TrimSpace(repository.DefaultBranch)
	}
	if baseBranch == "" {
		baseBranch = "main"
	}
	return baseBranch
}

func isBranchAlreadyExistsError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "reference already exists")
}

func latestWorkflowRun(runs []WorkflowRun) WorkflowRun {
	latest := runs[0]
	for _, run := range runs[1:] {
		if run.CreatedAt.After(latest.CreatedAt) {
			latest = run
		}
	}
	return latest
}

func firstFailedWorkflowJob(jobs []WorkflowJob) *WorkflowJob {
	for i := range jobs {
		conclusion := strings.TrimSpace(jobs[i].Conclusion)
		if conclusion != "" && conclusion != "success" {
			return &jobs[i]
		}
	}
	return nil
}

func failedStepNames(steps []WorkflowStep) []string {
	out := []string{}
	for _, step := range steps {
		conclusion := strings.TrimSpace(step.Conclusion)
		if conclusion == "" || conclusion == "success" {
			continue
		}
		name := strings.TrimSpace(step.Name)
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}

func trimLogExcerpt(logs string, limit int) string {
	logs = strings.TrimSpace(logs)
	if limit <= 0 || len(logs) <= limit {
		return logs
	}
	return logs[len(logs)-limit:]
}

func applyWorkflowRunState(node *domain.SpecForgePRNode, headSHA, status, conclusion string) {
	if strings.TrimSpace(headSHA) != "" {
		node.GitHubHeadSHA = strings.TrimSpace(headSHA)
	}
	if strings.TrimSpace(status) != "completed" {
		node.Status = domain.PRNodeStatusCIRunning
	} else if strings.TrimSpace(conclusion) == "success" {
		node.Status = domain.PRNodeStatusReadyForReview
	} else if strings.TrimSpace(conclusion) != "" {
		node.Status = domain.PRNodeStatusBlocked
	}
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
	applyWorkflowRunState(node, run.HeadSHA, run.Status, run.Conclusion)
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
