package verification

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestCreateFixAttemptAssignsAttemptNumberAndDefaults(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

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
	svc := NewService(repo, nil)

	for i := 0; i < maxFixAttemptsPerPRNode; i++ {
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

func TestListFixAttemptsReturnsPRNodeAttempts(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)
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
	svc := NewService(repo, reader)

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

func TestCreateFixAttemptFromCIRejectsMissingReader(t *testing.T) {
	repo := &memoryRepo{}
	svc := NewService(repo, nil)

	_, err := svc.CreateFixAttemptFromCI(context.Background(), 7, 42, &CreateFixAttemptFromCIRequest{
		RepositoryID: "github_agicto__codingcto",
	})

	require.ErrorIs(t, err, domain.ErrInvalidInput)
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
