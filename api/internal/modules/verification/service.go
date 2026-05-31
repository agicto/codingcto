package verification

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

const maxFixAttemptsPerPRNode = 3
const maxConsecutiveFixAttemptsPerFailureType = 2

type Service interface {
	VerifyPRNodeCI(ctx context.Context, userID, prNodeID uint, req *VerifyPRNodeCIRequest) (*VerifyPRNodeCIResponse, error)
	CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error)
	CreateFixAttemptFromCI(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptFromCIRequest) (*domain.SpecForgeFixAttempt, error)
	UpdateFixAttemptStatus(ctx context.Context, fixAttemptID uint, status string) error
	RecordFixTaskFinished(ctx context.Context, event domain.SpecForgeFixTaskFinishedEvent) error
	ListFixAttempts(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error)
	GetEscalationSummary(ctx context.Context, prNodeID uint) (*EscalationSummary, error)
}

type CIFailureReader interface {
	ReadPRNodeFailureLog(ctx context.Context, req *githubintegration.ReadPRNodeFailureLogRequest) (*githubintegration.PRNodeFailureLog, error)
}

type PRNodeCIRefresher interface {
	RefreshPRNodeCI(ctx context.Context, req *githubintegration.RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error)
}

type service struct {
	repo          domain.SpecForgeVerificationRepository
	ciRefresher   PRNodeCIRefresher
	failureReader CIFailureReader
	eventBus      *events.EventBus
}

func NewService(repo domain.SpecForgeVerificationRepository, ciRefresher PRNodeCIRefresher, failureReader CIFailureReader, eventBus *events.EventBus) *service {
	return &service{repo: repo, ciRefresher: ciRefresher, failureReader: failureReader, eventBus: eventBus}
}

func (s *service) VerifyPRNodeCI(ctx context.Context, userID, prNodeID uint, req *VerifyPRNodeCIRequest) (*VerifyPRNodeCIResponse, error) {
	if prNodeID == 0 || req == nil || strings.TrimSpace(req.RepositoryID) == "" || s.ciRefresher == nil {
		return nil, domain.ErrInvalidInput
	}
	repositoryID := strings.TrimSpace(req.RepositoryID)
	node, err := s.ciRefresher.RefreshPRNodeCI(ctx, &githubintegration.RefreshPRNodeCIRequest{
		RepositoryID: repositoryID,
		PRNodeID:     prNodeID,
	})
	if err != nil {
		return nil, err
	}
	response := &VerifyPRNodeCIResponse{
		PRNode:            node,
		VerificationState: verificationStateForPRNode(node),
		NextAction:        nextActionForPRNode(node),
	}
	if node == nil || node.Status != domain.PRNodeStatusBlocked {
		return response, nil
	}
	attempt, err := s.CreateFixAttemptFromCI(ctx, userID, prNodeID, &CreateFixAttemptFromCIRequest{
		RepositoryID: repositoryID,
	})
	if errors.Is(err, domain.ErrNotFound) {
		attempt, err = s.createMissingCILogAttempt(ctx, userID, prNodeID, &CreateFixAttemptFromCIRequest{
			RepositoryID: repositoryID,
			Conclusion:   "failure",
		})
	}
	if err == nil {
		response.FixAttempt = attempt
		response.VerificationState = verificationStateForFixAttempt(attempt)
		response.NextAction = nextActionForFixAttempt(attempt)
	}
	if err != nil && !errors.Is(err, domain.ErrConflict) {
		return nil, err
	}
	summary, summaryErr := s.GetEscalationSummary(ctx, prNodeID)
	if summaryErr != nil {
		return nil, summaryErr
	}
	response.EscalationSummary = summary
	if response.FixAttempt == nil {
		response.VerificationState = "needs_user_decision"
		response.NextAction = summary.RecommendedOption
	}
	return response, nil
}

func verificationStateForPRNode(node *domain.SpecForgePRNode) string {
	if node == nil {
		return "unknown"
	}
	switch node.Status {
	case domain.PRNodeStatusReadyForReview:
		return "ci_passed"
	case domain.PRNodeStatusCIRunning:
		return "ci_running"
	case domain.PRNodeStatusBlocked:
		return "ci_failed"
	default:
		return "ci_not_ready"
	}
}

func nextActionForPRNode(node *domain.SpecForgePRNode) string {
	if node == nil {
		return "Refresh the PR node again after GitHub reports a workflow run."
	}
	switch node.Status {
	case domain.PRNodeStatusReadyForReview:
		return "Review the pull request in GitHub."
	case domain.PRNodeStatusCIRunning:
		return "Wait for GitHub Actions to complete, then verify CI again."
	case domain.PRNodeStatusBlocked:
		return "Read the failed workflow logs and create a bounded fix attempt."
	default:
		return "Open or update the pull request, then wait for CI."
	}
}

func verificationStateForFixAttempt(attempt *domain.SpecForgeFixAttempt) string {
	if attempt == nil {
		return "needs_user_decision"
	}
	if attempt.CanAutoFix && attempt.Status == domain.FixAttemptStatusQueued {
		return "fix_attempt_queued"
	}
	return "needs_user_decision"
}

func nextActionForFixAttempt(attempt *domain.SpecForgeFixAttempt) string {
	if attempt == nil {
		return "Review the escalation summary and choose the next action."
	}
	if attempt.CanAutoFix && attempt.Status == domain.FixAttemptStatusQueued {
		return "Dispatch the queued fix attempt to the Codex runtime."
	}
	return strings.TrimSpace(attempt.RecommendedAction)
}

func (s *service) CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 || req == nil || strings.TrimSpace(req.FailureType) == "" {
		return nil, domain.ErrInvalidInput
	}
	if req.WorkflowRunID > 0 {
		attempt, err := s.repo.FindFixAttemptByPRNodeIDAndWorkflowRunID(ctx, prNodeID, req.WorkflowRunID)
		if err == nil {
			return attempt, nil
		}
		if !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("find existing CI fix attempt: %w", err)
		}
	}
	count, err := s.repo.CountFixAttemptsByPRNodeID(ctx, prNodeID)
	if err != nil {
		return nil, fmt.Errorf("count fix attempts: %w", err)
	}
	if count >= maxFixAttemptsPerPRNode {
		return nil, domain.ErrConflict
	}
	failureType := strings.TrimSpace(req.FailureType)
	attempts, err := s.repo.ListFixAttemptsByPRNodeID(ctx, prNodeID)
	if err != nil {
		return nil, fmt.Errorf("list fix attempts: %w", err)
	}
	if consecutiveFailureTypeCount(attempts, failureType) >= maxConsecutiveFixAttemptsPerFailureType {
		return nil, domain.ErrConflict
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = domain.FixAttemptStatusQueued
	}
	attempt := &domain.SpecForgeFixAttempt{
		PRNodeID:          prNodeID,
		FailureType:       failureType,
		CILogExcerpt:      strings.TrimSpace(req.CILogExcerpt),
		AttemptNumber:     count + 1,
		Status:            status,
		Confidence:        req.Confidence,
		LikelyCause:       strings.TrimSpace(req.LikelyCause),
		RecommendedAction: strings.TrimSpace(req.RecommendedAction),
		CanAutoFix:        req.CanAutoFix,
		WorkflowRunID:     req.WorkflowRunID,
		WorkflowRunURL:    strings.TrimSpace(req.WorkflowRunURL),
		Conclusion:        strings.TrimSpace(req.Conclusion),
		CreatedBy:         userID,
	}
	if err := s.repo.CreateFixAttempt(ctx, attempt); err != nil {
		return nil, fmt.Errorf("create fix attempt: %w", err)
	}
	if err := s.publishFixAttemptQueued(ctx, attempt); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeNeedsDecision(ctx, attempt); err != nil {
		return nil, err
	}
	return attempt, nil
}

func (s *service) publishFixAttemptQueued(ctx context.Context, attempt *domain.SpecForgeFixAttempt) error {
	if s.eventBus == nil || attempt == nil || attempt.Status != domain.FixAttemptStatusQueued || !attempt.CanAutoFix {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgeFixAttemptQueuedEvent(attempt))
}

func (s *service) publishPRNodeNeedsDecision(ctx context.Context, attempt *domain.SpecForgeFixAttempt) error {
	if s.eventBus == nil || attempt == nil || attempt.CanAutoFix {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeNeedsDecisionEvent(
		attempt.PRNodeID,
		attempt.FailureType,
		strings.TrimSpace(attempt.LikelyCause),
		strings.TrimSpace(attempt.RecommendedAction),
	))
}

func (s *service) UpdateFixAttemptStatus(ctx context.Context, fixAttemptID uint, status string) error {
	status = strings.TrimSpace(status)
	switch status {
	case domain.FixAttemptStatusQueued, domain.FixAttemptStatusSuccess, domain.FixAttemptStatusFailed:
	default:
		return domain.ErrInvalidInput
	}
	if err := s.repo.UpdateFixAttemptStatus(ctx, fixAttemptID, status); err != nil {
		return fmt.Errorf("update fix attempt status: %w", err)
	}
	return nil
}

func (s *service) RecordFixTaskFinished(ctx context.Context, event domain.SpecForgeFixTaskFinishedEvent) error {
	if event.FixAttemptID == 0 || event.FixAttemptStatus == "" {
		return nil
	}
	if err := s.UpdateFixAttemptStatus(ctx, event.FixAttemptID, event.FixAttemptStatus); err != nil {
		return err
	}
	if event.FixAttemptStatus != domain.FixAttemptStatusFailed {
		return nil
	}
	_, err := s.CreateFixAttempt(ctx, 0, event.PRNodeID, &CreateFixAttemptRequest{
		FailureType:       fixTaskFailureType(event),
		CILogExcerpt:      fixTaskLogExcerpt(event),
		Confidence:        0.55,
		LikelyCause:       fixTaskLikelyCause(event),
		RecommendedAction: "Inspect the failed fix task output, patch the smallest remaining cause, and rerun the affected local command before pushing.",
		CanAutoFix:        true,
	})
	if err == nil {
		return nil
	}
	if errors.Is(err, domain.ErrConflict) {
		return s.publishPRNodeAutoFixBudgetExhausted(ctx, event)
	}
	return err
}

func (s *service) publishPRNodeAutoFixBudgetExhausted(ctx context.Context, event domain.SpecForgeFixTaskFinishedEvent) error {
	if s.eventBus == nil || event.PRNodeID == 0 {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeNeedsDecisionEvent(
		event.PRNodeID,
		fixTaskFailureType(event),
		"The PR node reached the automatic fix limit or repeated the same failure type.",
		"Review the latest fix task output, then choose whether to continue with a narrower patch, replan this PR node, pause it, or cancel the execution run.",
	))
}

func fixTaskFailureType(event domain.SpecForgeFixTaskFinishedEvent) string {
	reason := strings.TrimSpace(event.FailureReason)
	if reason != "" {
		return reason
	}
	return "fix_task_failed"
}

func fixTaskLogExcerpt(event domain.SpecForgeFixTaskFinishedEvent) string {
	logs := strings.TrimSpace(event.ErrorLog)
	if output := strings.TrimSpace(event.OutputLog); output != "" {
		if logs != "" {
			logs += "\n\n"
		}
		logs += output
	}
	if logs == "" {
		logs = fmt.Sprintf("Fix task %d failed without captured logs.", event.TaskID)
	}
	if len(logs) > 20000 {
		return logs[len(logs)-20000:]
	}
	return logs
}

func fixTaskLikelyCause(event domain.SpecForgeFixTaskFinishedEvent) string {
	reason := strings.TrimSpace(event.FailureReason)
	if reason == "" {
		reason = "unknown failure"
	}
	return fmt.Sprintf("Automatic fix task %d failed with %s.", event.TaskID, reason)
}

func consecutiveFailureTypeCount(attempts []*domain.SpecForgeFixAttempt, failureType string) int {
	failureType = strings.TrimSpace(failureType)
	count := 0
	for i := len(attempts) - 1; i >= 0; i-- {
		attempt := attempts[i]
		if attempt == nil {
			continue
		}
		if strings.TrimSpace(attempt.FailureType) != failureType {
			break
		}
		count++
	}
	return count
}

func (s *service) CreateFixAttemptFromCI(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptFromCIRequest) (*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 || req == nil || strings.TrimSpace(req.RepositoryID) == "" || s.failureReader == nil {
		return nil, domain.ErrInvalidInput
	}
	failure, err := s.failureReader.ReadPRNodeFailureLog(ctx, &githubintegration.ReadPRNodeFailureLogRequest{
		RepositoryID: strings.TrimSpace(req.RepositoryID),
		PRNodeID:     prNodeID,
	})
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) && hasCIEventContext(req) {
			return s.createMissingCILogAttempt(ctx, userID, prNodeID, req)
		}
		return nil, err
	}
	if failure == nil {
		if hasCIEventContext(req) {
			return s.createMissingCILogAttempt(ctx, userID, prNodeID, req)
		}
		return nil, domain.ErrNotFound
	}
	workflowRunID := req.WorkflowRunID
	if workflowRunID == 0 {
		workflowRunID = failure.WorkflowRunID
	}
	return s.CreateFixAttempt(ctx, userID, prNodeID, &CreateFixAttemptRequest{
		FailureType:       classifyFailureType(failure),
		CILogExcerpt:      failure.LogExcerpt,
		Confidence:        0.7,
		LikelyCause:       likelyCause(failure),
		RecommendedAction: recommendedAction(failure),
		CanAutoFix:        canAutoFix(failure),
		WorkflowRunID:     workflowRunID,
		WorkflowRunURL:    req.WorkflowRunURL,
		Conclusion:        req.Conclusion,
	})
}

func hasCIEventContext(req *CreateFixAttemptFromCIRequest) bool {
	if req == nil {
		return false
	}
	return req.WorkflowRunID > 0 || strings.TrimSpace(req.WorkflowRunURL) != "" || strings.TrimSpace(req.Conclusion) != ""
}

func (s *service) createMissingCILogAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptFromCIRequest) (*domain.SpecForgeFixAttempt, error) {
	conclusion := strings.TrimSpace(req.Conclusion)
	if conclusion == "" {
		conclusion = "unknown"
	}
	return s.CreateFixAttempt(ctx, userID, prNodeID, &CreateFixAttemptRequest{
		FailureType:       "ci_log_unavailable",
		CILogExcerpt:      missingCILogExcerpt(req),
		Status:            domain.FixAttemptStatusFailed,
		Confidence:        0.35,
		LikelyCause:       fmt.Sprintf("GitHub Actions completed with %s, but CodingCTO could not read a failed job log.", conclusion),
		RecommendedAction: "Open the workflow run in GitHub, inspect the failed or incomplete job, then decide whether to retry auto-fix with a narrower prompt or replan this PR node.",
		CanAutoFix:        false,
		WorkflowRunID:     req.WorkflowRunID,
		WorkflowRunURL:    req.WorkflowRunURL,
		Conclusion:        conclusion,
	})
}

func missingCILogExcerpt(req *CreateFixAttemptFromCIRequest) string {
	if req == nil {
		return "CI failed, but no workflow metadata was available."
	}
	lines := []string{"CI failed, but CodingCTO could not read failed job logs."}
	if req.WorkflowRunID > 0 {
		lines = append(lines, fmt.Sprintf("Workflow run ID: %d", req.WorkflowRunID))
	}
	if value := strings.TrimSpace(req.WorkflowRunURL); value != "" {
		lines = append(lines, "Workflow run URL: "+value)
	}
	if value := strings.TrimSpace(req.Conclusion); value != "" {
		lines = append(lines, "Conclusion: "+value)
	}
	return strings.Join(lines, "\n")
}

func (s *service) ListFixAttempts(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ListFixAttemptsByPRNodeID(ctx, prNodeID)
}

func (s *service) GetEscalationSummary(ctx context.Context, prNodeID uint) (*EscalationSummary, error) {
	attempts, err := s.ListFixAttempts(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	return buildEscalationSummary(prNodeID, attempts), nil
}

func buildEscalationSummary(prNodeID uint, attempts []*domain.SpecForgeFixAttempt) *EscalationSummary {
	types := make([]string, 0, len(attempts))
	seenTypes := map[string]struct{}{}
	var latest *domain.SpecForgeFixAttempt
	for _, attempt := range attempts {
		if attempt == nil {
			continue
		}
		failureType := strings.TrimSpace(attempt.FailureType)
		if failureType != "" {
			if _, ok := seenTypes[failureType]; !ok {
				types = append(types, failureType)
				seenTypes[failureType] = struct{}{}
			}
		}
		if latest == nil || attempt.AttemptNumber >= latest.AttemptNumber {
			latest = attempt
		}
	}

	attemptsUsed := len(attempts)
	summary := &EscalationSummary{
		PRNodeID:           prNodeID,
		Status:             "auto_fix_available",
		AttemptsUsed:       attemptsUsed,
		MaxAttempts:        maxFixAttemptsPerPRNode,
		FailureTypes:       types,
		Reason:             fmt.Sprintf("%d of %d automatic fix attempts have been used.", attemptsUsed, maxFixAttemptsPerPRNode),
		RecommendedOption:  "Continue auto-fix if the next patch is local, testable, and within the PR node scope.",
		DecisionOptions:    []string{"Continue auto-fix", "Pause this PR node", "Cancel the execution run"},
		CanContinueAutoFix: attemptsUsed < maxFixAttemptsPerPRNode,
	}
	if latest != nil {
		summary.LatestFailureType = strings.TrimSpace(latest.FailureType)
		summary.LatestLikelyCause = strings.TrimSpace(latest.LikelyCause)
		summary.LatestAction = strings.TrimSpace(latest.RecommendedAction)
	}
	if latest != nil && !latest.CanAutoFix {
		summary.Status = "needs_user_decision"
		summary.Reason = "The latest CI diagnosis cannot be fixed automatically with enough confidence."
		summary.RecommendedOption = "Inspect the failure in GitHub, then choose whether to continue with a narrower patch, replan this PR node, or pause the run."
		summary.DecisionOptions = []string{"Continue with a narrower patch", "Replan this PR node", "Pause this PR node", "Cancel the execution run"}
		summary.CanContinueAutoFix = false
	}
	if summary.LatestFailureType != "" && consecutiveFailureTypeCount(attempts, summary.LatestFailureType) >= maxConsecutiveFixAttemptsPerFailureType {
		summary.Status = "needs_user_decision"
		summary.Reason = fmt.Sprintf("The PR node hit the limit of %d consecutive %s fix attempts.", maxConsecutiveFixAttemptsPerFailureType, summary.LatestFailureType)
		summary.RecommendedOption = "Pause auto-fix and decide whether this failure needs a narrower patch, a different implementation approach, or a PR node replan."
		summary.DecisionOptions = []string{"Continue with a narrower patch", "Replan this PR node", "Pause this PR node", "Cancel the execution run"}
		summary.CanContinueAutoFix = false
	}
	if attemptsUsed >= maxFixAttemptsPerPRNode {
		summary.Status = "needs_user_decision"
		summary.Reason = fmt.Sprintf("The PR node used all %d automatic fix attempts.", maxFixAttemptsPerPRNode)
		summary.RecommendedOption = "Pause auto-fix and choose whether to continue with a narrower patch, replan the PR node, or cancel this execution path."
		summary.DecisionOptions = []string{"Continue with a narrower patch", "Replan this PR node", "Pause this PR node", "Cancel the execution run"}
		summary.CanContinueAutoFix = false
	}
	return summary
}

func classifyFailureType(failure *githubintegration.PRNodeFailureLog) string {
	if failure == nil {
		return "ci_failure"
	}
	logs := strings.ToLower(strings.Join([]string{
		failure.JobName,
		strings.Join(failure.FailedSteps, "\n"),
		failure.LogExcerpt,
	}, "\n"))
	switch {
	case strings.Contains(logs, "eslint") || strings.Contains(logs, "lint"):
		return "lint_failure"
	case strings.Contains(logs, "tsc") || strings.Contains(logs, "ts23") || strings.Contains(logs, "type error") || strings.Contains(logs, "typecheck"):
		return "type_error"
	case strings.Contains(logs, "flaky") || strings.Contains(logs, "timed out") || strings.Contains(logs, "timeout") || strings.Contains(logs, "context deadline exceeded"):
		return "flaky_test"
	case strings.Contains(logs, "migration") || strings.Contains(logs, "migrate") || strings.Contains(logs, "schema drift") || strings.Contains(logs, "prisma migrate"):
		return "migration_failure"
	case strings.Contains(logs, "cannot find module") || strings.Contains(logs, "module not found") || strings.Contains(logs, "no required module provides") || strings.Contains(logs, "missing dependency") || strings.Contains(logs, "package not found"):
		return "missing_dependency"
	case strings.Contains(logs, "permission denied") || strings.Contains(logs, "unauthorized") || strings.Contains(logs, "forbidden") || strings.Contains(logs, "401") || strings.Contains(logs, "403"):
		return "auth_permission_failure"
	case strings.Contains(logs, "acceptance criteria") || strings.Contains(logs, "spec mismatch") || strings.Contains(logs, "product mismatch"):
		return "product_mismatch"
	case strings.Contains(logs, "test") || strings.Contains(logs, "fail:") || strings.Contains(logs, "--- fail"):
		return "unit_test_failure"
	default:
		return "ci_failure"
	}
}

func likelyCause(failure *githubintegration.PRNodeFailureLog) string {
	failureType := classifyFailureType(failure)
	if failure == nil {
		return failureTypeLikelyCausePrefix(failureType) + " No GitHub Actions failure log was available."
	}
	step := firstString(failure.FailedSteps)
	prefix := failureTypeLikelyCausePrefix(failureType)
	if step != "" {
		return fmt.Sprintf("%s GitHub Actions job %q failed at step %q.", prefix, failure.JobName, step)
	}
	return fmt.Sprintf("%s GitHub Actions job %q failed.", prefix, failure.JobName)
}

func recommendedAction(failure *githubintegration.PRNodeFailureLog) string {
	switch classifyFailureType(failure) {
	case "lint_failure":
		return "Patch the lint violation only, then rerun the lint command before pushing a fix."
	case "type_error":
		return "Patch the type mismatch or missing type guard, then rerun the affected typecheck command before pushing a fix."
	case "unit_test_failure":
		return "Patch the failing code or test expectation within the PR node scope, then rerun the affected test command before pushing a fix."
	case "flaky_test":
		return "Rerun the workflow once; only patch code if the same deterministic failure repeats."
	case "missing_dependency":
		return "Inspect whether the dependency is already declared elsewhere; only add or update package metadata if it is required by this PR node."
	case "migration_failure":
		return "Pause auto-fix and review the migration/schema conflict before changing database state."
	case "auth_permission_failure":
		return "Review the auth and permission assumptions; patch only if the required role or token behavior is already specified by the approved plan."
	case "product_mismatch":
		return "Pause auto-fix and re-check the approved plan, acceptance criteria, and PR node boundary before patching."
	default:
		return "Inspect the CI log excerpt, patch the smallest reproducible failure within scope, then rerun the affected local command before pushing a fix."
	}
}

func canAutoFix(failure *githubintegration.PRNodeFailureLog) bool {
	failureType := classifyFailureType(failure)
	switch failureType {
	case "lint_failure", "type_error", "unit_test_failure":
		return true
	case "missing_dependency":
		return true
	default:
		return false
	}
}

func failureTypeLikelyCausePrefix(failureType string) string {
	switch failureType {
	case "lint_failure":
		return "The failure appears to be a lint or formatting issue."
	case "type_error":
		return "The failure appears to be a type-checking issue."
	case "unit_test_failure":
		return "The failure appears to be a deterministic test failure."
	case "flaky_test":
		return "The failure may be a timeout or flaky test."
	case "missing_dependency":
		return "The failure appears to involve a missing dependency."
	case "migration_failure":
		return "The failure appears to involve a database migration or schema conflict."
	case "auth_permission_failure":
		return "The failure appears to involve authentication or authorization behavior."
	case "product_mismatch":
		return "The failure appears to involve a mismatch with the approved product/spec boundary."
	default:
		return "The failure requires CI log inspection."
	}
}

func firstString(items []string) string {
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item != "" {
			return item
		}
	}
	return ""
}
