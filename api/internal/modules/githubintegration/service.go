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
	"github.com/zgiai/luas/api/internal/infra/events"
)

type Service interface {
	UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error)
	GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error)
	UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error)
	GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error)
	ListRepositoryTree(ctx context.Context, req *ListRepositoryTreeRequest) (*RepositoryTreeSnapshot, error)
	ReadRepositoryFile(ctx context.Context, req *ReadRepositoryFileRequest) (*RepositoryFileSnapshot, error)
	PreparePRNodeBranch(ctx context.Context, req *PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error)
	DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error)
	RefreshPRNodeCI(ctx context.Context, req *RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error)
	ReadPRNodeFailureLog(ctx context.Context, req *ReadPRNodeFailureLogRequest) (*PRNodeFailureLog, error)
	RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error)
	ListWebhookEvents(ctx context.Context, req *ListWebhookEventsRequest) ([]*domain.GitHubWebhookEvent, error)
}

type service struct {
	repo          domain.GitHubIntegrationRepository
	planningRepo  domain.SpecForgePlanningRepository
	clientFactory RepositoryClientFactory
	tokenProvider InstallationTokenProvider
	eventBus      *events.EventBus
}

func NewService(repo domain.GitHubIntegrationRepository, planningRepo domain.SpecForgePlanningRepository, clientFactory RepositoryClientFactory, tokenProvider InstallationTokenProvider, eventBus *events.EventBus) *service {
	if clientFactory == nil {
		clientFactory = defaultRepositoryClientFactory{}
	}
	if tokenProvider == nil {
		tokenProvider = defaultInstallationTokenProvider{}
	}
	return &service{repo: repo, planningRepo: planningRepo, clientFactory: clientFactory, tokenProvider: tokenProvider, eventBus: eventBus}
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

func (s *service) ListRepositoryTree(ctx context.Context, req *ListRepositoryTreeRequest) (*RepositoryTreeSnapshot, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		ref = repository.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	tree, err := client.ListRepositoryTree(ctx, repository.GitHubOwner, repository.GitHubRepo, ref, req.Recursive)
	if err != nil {
		return nil, err
	}
	if tree == nil {
		return nil, fmt.Errorf("github integration: repository tree response is required")
	}
	paths := make([]string, 0, len(tree.Tree))
	for _, entry := range tree.Tree {
		path := strings.TrimSpace(entry.Path)
		if path == "" {
			continue
		}
		paths = append(paths, path)
	}
	return &RepositoryTreeSnapshot{
		RepositoryID: repository.RepositoryID,
		Ref:          ref,
		Truncated:    tree.Truncated,
		Paths:        paths,
	}, nil
}

func (s *service) ReadRepositoryFile(ctx context.Context, req *ReadRepositoryFileRequest) (*RepositoryFileSnapshot, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || strings.TrimSpace(req.Path) == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		ref = repository.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	file, err := client.GetRepositoryFile(ctx, repository.GitHubOwner, repository.GitHubRepo, req.Path, ref)
	if err != nil {
		return nil, err
	}
	if file == nil {
		return nil, fmt.Errorf("github integration: repository file response is required")
	}
	content := file.DecodedContent
	if content == "" && !strings.EqualFold(file.Encoding, "base64") {
		content = file.Content
	}
	return &RepositoryFileSnapshot{
		RepositoryID: repository.RepositoryID,
		Ref:          ref,
		Path:         file.Path,
		SHA:          file.SHA,
		Content:      content,
	}, nil
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
	if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeCIFailedFromWorkflowRun(ctx, repository, node, latest); err != nil {
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

func (s *service) ListWebhookEvents(ctx context.Context, req *ListWebhookEventsRequest) ([]*domain.GitHubWebhookEvent, error) {
	if req == nil {
		req = &ListWebhookEventsRequest{}
	}
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.repo.ListWebhookEvents(ctx, strings.TrimSpace(req.Status), strings.TrimSpace(req.RepositoryFullName), limit)
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
		node, err := s.updatePRNodeFromPullRequest(ctx, event.PullRequest)
		if err != nil {
			return err
		}
		if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
			return err
		}
		return s.publishReviewFeedback(ctx, event, node)
	case event.WorkflowRun != nil:
		node, err := s.updatePRNodeFromWorkflowRun(ctx, event.WorkflowRun)
		if err != nil {
			return err
		}
		if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
			return err
		}
		return s.publishPRNodeCIFailed(ctx, event, node)
	default:
		return nil
	}
}

func (s *service) updatePRNodeFromPullRequest(ctx context.Context, pr *WebhookPullRequest) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(pr.HeadBranch) == "" && pr.Number <= 0 {
		return nil, nil
	}
	node, err := s.findPRNodeForWebhookPullRequest(ctx, pr)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	node.GitHubPRNumber = &pr.Number
	node.GitHubPRURL = pr.HTMLURL
	node.GitHubHeadSHA = pr.HeadSHA
	node.Status = prNodeStatusFromPullRequest(pr)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func prNodeStatusFromPullRequest(pr *WebhookPullRequest) string {
	if pr == nil {
		return domain.PRNodeStatusPROpened
	}
	if pr.Merged {
		return domain.PRNodeStatusMerged
	}
	if strings.TrimSpace(pr.State) == "closed" {
		return domain.PRNodeStatusClosed
	}
	return domain.PRNodeStatusPROpened
}

func (s *service) findPRNodeForWebhookPullRequest(ctx context.Context, pr *WebhookPullRequest) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(pr.HeadBranch) != "" {
		node, err := s.planningRepo.FindPRNodeByBranchName(ctx, pr.HeadBranch)
		if err == nil || !errors.Is(err, domain.ErrNotFound) || pr.Number <= 0 {
			return node, err
		}
	}
	return s.planningRepo.FindPRNodeByGitHubPRNumber(ctx, pr.Number)
}

func (s *service) publishReviewFeedback(ctx context.Context, event *StructuredGitHubWebhook, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || event == nil || node == nil || event.ReviewComment == nil {
		return nil
	}
	comment := event.ReviewComment
	if strings.TrimSpace(comment.Body) == "" || comment.PullRequestNumber <= 0 {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgeReviewFeedbackReceivedEvent(
		node.ID,
		comment.PullRequestNumber,
		event.RepositoryFullName,
		comment.Body,
		comment.AuthorLogin,
		comment.HTMLURL,
		comment.Path,
		comment.CommitSHA,
	))
}

func (s *service) publishPRNodeDependencySatisfied(ctx context.Context, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || node == nil {
		return nil
	}
	switch node.Status {
	case domain.PRNodeStatusReadyForReview, domain.PRNodeStatusMerged:
		return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeDependencySatisfiedEvent(node))
	default:
		return nil
	}
}

func (s *service) updatePRNodeFromWorkflowRun(ctx context.Context, run *WebhookWorkflowRun) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(run.HeadBranch) == "" {
		return nil, nil
	}
	node, err := s.planningRepo.FindPRNodeByBranchName(ctx, run.HeadBranch)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	applyWorkflowRunState(node, run.HeadSHA, run.Status, run.Conclusion)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) publishPRNodeCIFailed(ctx context.Context, event *StructuredGitHubWebhook, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || event == nil || event.WorkflowRun == nil || node == nil {
		return nil
	}
	run := event.WorkflowRun
	if !isUnsuccessfulCompletedWorkflowRun(run.Status, run.Conclusion) {
		return nil
	}
	bundle, err := s.planningRepo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	repositoryID := ""
	if bundle != nil && bundle.Idea != nil {
		repositoryID = strings.TrimSpace(bundle.Idea.RepositoryID)
	}
	if repositoryID == "" {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeCIFailedEvent(
		node.ID,
		repositoryID,
		event.RepositoryFullName,
		run.ID,
		run.HTMLURL,
		run.HeadSHA,
		run.Conclusion,
	))
}

func (s *service) publishPRNodeCIFailedFromWorkflowRun(ctx context.Context, repository *domain.Repository, node *domain.SpecForgePRNode, run WorkflowRun) error {
	if s.eventBus == nil || repository == nil || node == nil {
		return nil
	}
	if !isUnsuccessfulCompletedWorkflowRun(run.Status, run.Conclusion) {
		return nil
	}
	repositoryFullName := strings.TrimSpace(repository.GitHubOwner + "/" + repository.GitHubRepo)
	if repositoryFullName == "/" {
		repositoryFullName = ""
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeCIFailedEvent(
		node.ID,
		repository.RepositoryID,
		repositoryFullName,
		run.ID,
		run.HTMLURL,
		run.HeadSHA,
		run.Conclusion,
	))
}

func isUnsuccessfulCompletedWorkflowRun(status, conclusion string) bool {
	status = strings.TrimSpace(status)
	conclusion = strings.TrimSpace(conclusion)
	return status == "completed" && conclusion != "" && conclusion != "success"
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
