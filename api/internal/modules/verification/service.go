package verification

import (
	"context"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

const maxFixAttemptsPerPRNode = 3

type Service interface {
	CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error)
	CreateFixAttemptFromCI(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptFromCIRequest) (*domain.SpecForgeFixAttempt, error)
	ListFixAttempts(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error)
}

type CIFailureReader interface {
	ReadPRNodeFailureLog(ctx context.Context, req *githubintegration.ReadPRNodeFailureLogRequest) (*githubintegration.PRNodeFailureLog, error)
}

type service struct {
	repo          domain.SpecForgeVerificationRepository
	failureReader CIFailureReader
}

func NewService(repo domain.SpecForgeVerificationRepository, failureReader CIFailureReader) *service {
	return &service{repo: repo, failureReader: failureReader}
}

func (s *service) CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error) {
	if userID == 0 || prNodeID == 0 || req == nil || strings.TrimSpace(req.FailureType) == "" {
		return nil, domain.ErrInvalidInput
	}
	count, err := s.repo.CountFixAttemptsByPRNodeID(ctx, prNodeID)
	if err != nil {
		return nil, fmt.Errorf("count fix attempts: %w", err)
	}
	if count >= maxFixAttemptsPerPRNode {
		return nil, domain.ErrConflict
	}
	status := strings.TrimSpace(req.Status)
	if status == "" {
		status = domain.FixAttemptStatusQueued
	}
	attempt := &domain.SpecForgeFixAttempt{
		PRNodeID:          prNodeID,
		FailureType:       strings.TrimSpace(req.FailureType),
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
	return attempt, nil
}

func (s *service) CreateFixAttemptFromCI(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptFromCIRequest) (*domain.SpecForgeFixAttempt, error) {
	if userID == 0 || prNodeID == 0 || req == nil || strings.TrimSpace(req.RepositoryID) == "" || s.failureReader == nil {
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
