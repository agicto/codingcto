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

type service struct {
	repo          domain.SpecForgeVerificationRepository
	failureReader CIFailureReader
	eventBus      *events.EventBus
}

func NewService(repo domain.SpecForgeVerificationRepository, failureReader CIFailureReader, eventBus *events.EventBus) *service {
	return &service{repo: repo, failureReader: failureReader, eventBus: eventBus}
}

func (s *service) CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 || req == nil || strings.TrimSpace(req.FailureType) == "" {
		return nil, domain.ErrInvalidInput
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
		CreatedBy:         userID,
	}
	if err := s.repo.CreateFixAttempt(ctx, attempt); err != nil {
		return nil, fmt.Errorf("create fix attempt: %w", err)
	}
	if err := s.publishFixAttemptQueued(ctx, attempt); err != nil {
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
		return nil
	}
	return err
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
		return nil, err
	}
	if failure == nil {
		return nil, domain.ErrNotFound
	}
	return s.CreateFixAttempt(ctx, userID, prNodeID, &CreateFixAttemptRequest{
		FailureType:       classifyFailureType(failure),
		CILogExcerpt:      failure.LogExcerpt,
		Confidence:        0.7,
		LikelyCause:       likelyCause(failure),
		RecommendedAction: recommendedAction(failure),
		CanAutoFix:        canAutoFix(failure),
	})
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
	logs := strings.ToLower(failure.LogExcerpt)
	switch {
	case strings.Contains(logs, "eslint") || strings.Contains(logs, "lint"):
		return "lint_failure"
	case strings.Contains(logs, "tsc") || strings.Contains(logs, "ts23") || strings.Contains(logs, "type error") || strings.Contains(logs, "typecheck"):
		return "type_error"
	case strings.Contains(logs, "test") || strings.Contains(logs, "fail:") || strings.Contains(logs, "--- fail"):
		return "unit_test_failure"
	default:
		return "ci_failure"
	}
}

func likelyCause(failure *githubintegration.PRNodeFailureLog) string {
	step := firstString(failure.FailedSteps)
	if step != "" {
		return fmt.Sprintf("GitHub Actions job %q failed at step %q.", failure.JobName, step)
	}
	return fmt.Sprintf("GitHub Actions job %q failed.", failure.JobName)
}

func recommendedAction(failure *githubintegration.PRNodeFailureLog) string {
	return "Inspect the CI log excerpt, patch the failing code or test, then rerun the affected local command before pushing a fix."
}

func canAutoFix(failure *githubintegration.PRNodeFailureLog) bool {
	failureType := classifyFailureType(failure)
	return failureType == "lint_failure" || failureType == "type_error" || failureType == "unit_test_failure"
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
