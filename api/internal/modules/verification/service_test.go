package verification

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	infraevents "github.com/zgiai/luas/api/internal/infra/events"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestCreateFixAttemptAssignsAttemptNumberAndDefaults(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

	first, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType:       " type_error ",
		CILogExcerpt:      "  TS2322  ",
		Confidence:        0.91,
		LikelyCause:       " null role ",
		RecommendedAction: " patch type guard ",
		CanAutoFix:        true,
	})
	require.NoError(t, err)
	second, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "lint_failure",
		Status:      domain.FixAttemptStatusFailed,
	})
	require.NoError(t, err)

	require.Equal(t, 1, first.AttemptNumber)
	require.Equal(t, 2, second.AttemptNumber)
	require.Equal(t, domain.FixAttemptStatusQueued, first.Status)
	require.Equal(t, "type_error", first.FailureType)
	require.Equal(t, "TS2322", first.CILogExcerpt)
	require.True(t, first.CanAutoFix)
}

func TestCreateFixAttemptRejectsAfterRetryLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

	failureTypes := []string{"type_error", "lint_failure", "type_error"}
	for _, failureType := range failureTypes {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: failureType,
		})
		require.NoError(t, err)
	}

	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCreateFixAttemptRejectsRepeatedSameFailureType(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

	for i := 0; i < maxConsecutiveFixAttemptsPerFailureType; i++ {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: "type_error",
		})
		require.NoError(t, err)
	}

	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestCreateFixAttemptAllowsSameFailureTypeAfterDifferentFailure(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

	for _, failureType := range []string{"type_error", "lint_failure"} {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType: failureType,
		})
		require.NoError(t, err)
	}

	attempt, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType: "type_error",
	})

	require.NoError(t, err)
	require.Equal(t, 3, attempt.AttemptNumber)
}

func TestListFixAttemptsReturnsPRNodeAttempts(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)
	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{FailureType: "type_error"})
	require.NoError(t, err)
	_, err = svc.CreateFixAttempt(context.Background(), 7, 99, &CreateFixAttemptRequest{FailureType: "lint_failure"})
	require.NoError(t, err)

	attempts, err := svc.ListFixAttempts(context.Background(), 42)

	require.NoError(t, err)
	require.Len(t, attempts, 1)
	require.Equal(t, uint(42), attempts[0].PRNodeID)
}

func TestCreateFixAttemptFromCIClassifiesFailedLogs(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "API",
			LogExcerpt:  "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps: []string{"go test"},
		},
	}
	svc := NewService(repo, reader, nil)

	attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
	require.Equal(t, uint(42), reader.request.PRNodeID)
	require.Equal(t, 1, attempt.AttemptNumber)
	require.Equal(t, "unit_test_failure", attempt.FailureType)
	require.Contains(t, attempt.CILogExcerpt, "TestInvite")
	require.Contains(t, attempt.LikelyCause, "go test")
	require.True(t, attempt.CanAutoFix)
}

func TestCreateFixAttemptFromCIPublishesQueuedAutoFixEvent(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "Web",
			LogExcerpt:  "pnpm typecheck\nTS2322: Type mismatch\n",
			FailedSteps: []string{"pnpm typecheck"},
		},
	}
	bus := infraevents.NewEventBus()
	var published domain.SpecForgeFixAttemptQueuedEvent
	bus.Subscribe(domain.EventSpecForgeFixAttemptQueued, func(ctx context.Context, event infraevents.Event) error {
		var underlying any = event
		if wrapped, ok := event.(infraevents.WrappedEvent); ok {
			underlying = wrapped.Event
		}
		typed, ok := underlying.(domain.SpecForgeFixAttemptQueuedEvent)
		require.True(t, ok)
		published = typed
		return nil
	})
	svc := NewService(repo, reader, bus)

	attempt, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.NoError(t, err)
	require.Equal(t, attempt.ID, published.FixAttemptID)
	require.Equal(t, uint(42), published.PRNodeID)
	require.Equal(t, "type_error", published.FailureType)
	require.Contains(t, published.CILogExcerpt, "TS2322")
	require.Contains(t, published.LikelyCause, "pnpm typecheck")
	require.NotEmpty(t, published.RecommendedAction)
}

func TestHandlerCreatesFixAttemptFromPRNodeCIFailedEvent(t *testing.T) {
	repo := &memoryRepo{}
	reader := &fakeFailureReader{
		failure: &githubintegration.PRNodeFailureLog{
			PRNodeID:    42,
			JobName:     "API",
			LogExcerpt:  "go test ./...\n--- FAIL: TestInvite\n",
			FailedSteps: []string{"go test"},
		},
	}
	handler := NewHandler(NewService(repo, reader, nil))
	bus := infraevents.NewEventBus()
	handler.RegisterEvents(bus)

	err := bus.Publish(context.Background(), domain.NewSpecForgePRNodeCIFailedEvent(
		42,
		"github_agicto__codingcto",
		"agicto/codingcto",
		987,
		"https://github.com/agicto/codingcto/actions/runs/987",
		"abc123",
		"failure",
	))

	require.NoError(t, err)
	require.Len(t, repo.attempts, 1)
	require.Equal(t, uint(42), repo.attempts[0].PRNodeID)
	require.Equal(t, "unit_test_failure", repo.attempts[0].FailureType)
	require.Equal(t, uint(0), repo.attempts[0].CreatedBy)
	require.Equal(t, "github_agicto__codingcto", reader.request.RepositoryID)
}

func TestCreateFixAttemptFromCIRejectsMissingReader(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)

	_, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestGetEscalationSummaryAllowsAutoFixBeforeLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)
	_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
		FailureType:       "type_error",
		LikelyCause:       "GitHub Actions job failed at typecheck.",
		RecommendedAction: "Patch the type guard.",
		CanAutoFix:        true,
	})
	require.NoError(t, err)

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, uint(42), summary.PRNodeID)
	require.Equal(t, "auto_fix_available", summary.Status)
	require.Equal(t, 1, summary.AttemptsUsed)
	require.Equal(t, maxFixAttemptsPerPRNode, summary.MaxAttempts)
	require.Equal(t, []string{"type_error"}, summary.FailureTypes)
	require.True(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.RecommendedOption, "Continue auto-fix")
	require.Equal(t, "Patch the type guard.", summary.LatestAction)
}

func TestGetEscalationSummaryRequiresDecisionAfterLimit(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil, nil)
	for i := 0; i < maxFixAttemptsPerPRNode; i++ {
		_, err := svc.CreateFixAttempt(context.Background(), 7, 42, &CreateFixAttemptRequest{
			FailureType:       []string{"unit_test_failure", "lint_failure", "unit_test_failure"}[i],
			LikelyCause:       "Invite acceptance test failed.",
			RecommendedAction: "Narrow the failing assertion.",
		})
		require.NoError(t, err)
	}

	summary, err := svc.GetEscalationSummary(context.Background(), 42)

	require.NoError(t, err)
	require.Equal(t, "needs_user_decision", summary.Status)
	require.Equal(t, maxFixAttemptsPerPRNode, summary.AttemptsUsed)
	require.False(t, summary.CanContinueAutoFix)
	require.Contains(t, summary.Reason, "used all 3 automatic fix attempts")
	require.Contains(t, summary.DecisionOptions, "Replan this PR node")
	require.Equal(t, "unit_test_failure", summary.LatestFailureType)
}

type fakeFailureReader struct {
	request githubintegration.ReadPRNodeFailureLogRequest
	failure *githubintegration.PRNodeFailureLog
	err     error
}

func (r *fakeFailureReader) ReadPRNodeFailureLog(ctx context.Context, req *githubintegration.ReadPRNodeFailureLogRequest) (*githubintegration.PRNodeFailureLog, error) {
	if req != nil {
		r.request = *req
	}
	return r.failure, r.err
}

type memoryRepo struct {
	nextID   uint
	attempts []*domain.SpecForgeFixAttempt
}

func (r *memoryRepo) CreateFixAttempt(ctx context.Context, attempt *domain.SpecForgeFixAttempt) error {
	r.nextID++
	attempt.ID = r.nextID
	copied := *attempt
	r.attempts = append(r.attempts, &copied)
	return nil
}

func (r *memoryRepo) ListFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	out := []*domain.SpecForgeFixAttempt{}
	for _, attempt := range r.attempts {
		if attempt.PRNodeID == prNodeID {
			copied := *attempt
			out = append(out, &copied)
		}
	}
	return out, nil
}

func (r *memoryRepo) CountFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) (int, error) {
	count := 0
	for _, attempt := range r.attempts {
		if attempt.PRNodeID == prNodeID {
			count++
		}
	}
	return count, nil
}
