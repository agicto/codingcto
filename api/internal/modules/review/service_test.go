package review

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

func TestApproveReviewDecisionMarksCurrentHeadAsApproved(t *testing.T) {
	svc := NewService(
		&memoryReviewRepo{},
		&memoryPRNodeReader{
			nodes: map[uint]*domain.SpecForgePRNode{
				7: readyForReviewNode(),
			},
		},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)
	svc.now = func() time.Time { return time.Date(2026, 6, 11, 11, 0, 0, 0, time.UTC) }

	decision, err := svc.ApproveReviewDecision(context.Background(), 42, 7, &ApproveReviewDecisionRequest{
		Reason: "CI is green and scope matches the approved plan.",
	})

	require.NoError(t, err)
	require.True(t, decision.MergeReady)
	require.Equal(t, domain.ReviewDecisionStatusApproved, decision.DecisionStatus)
	require.NotNil(t, decision.Decision)
	require.Equal(t, "abc123def456", decision.Decision.HeadSHA)
	require.Equal(t, uint(42), decision.Decision.DecidedBy)
}

func TestApproveReviewDecisionRejectsBlockedPRNode(t *testing.T) {
	node := readyForReviewNode()
	node.Status = domain.PRNodeStatusBlocked
	svc := NewService(
		&memoryReviewRepo{},
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: node}},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)

	_, err := svc.ApproveReviewDecision(context.Background(), 42, 7, &ApproveReviewDecisionRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestGetReviewDecisionExpiresApprovalWhenHeadChanges(t *testing.T) {
	reviewRepo := &memoryReviewRepo{
		decisions: []*domain.SpecForgeReviewDecision{
			{
				ID:        1,
				PRNodeID:  7,
				Status:    domain.ReviewDecisionStatusApproved,
				HeadSHA:   "old-head-sha",
				DecidedBy: 42,
				DecidedAt: time.Date(2026, 6, 11, 10, 0, 0, 0, time.UTC),
			},
		},
	}
	svc := NewService(
		reviewRepo,
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)
	svc.now = func() time.Time { return time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC) }

	decision, err := svc.GetReviewDecision(context.Background(), 7)

	require.NoError(t, err)
	require.False(t, decision.MergeReady)
	require.Equal(t, domain.ReviewDecisionStatusExpired, decision.DecisionStatus)
	require.NotNil(t, decision.Decision)
	require.NotNil(t, decision.Decision.ExpiredAt)
	require.Equal(t, domain.ReviewDecisionStatusExpired, reviewRepo.decisions[0].Status)
}

func TestRejectReviewDecisionRecordsReason(t *testing.T) {
	svc := NewService(
		&memoryReviewRepo{},
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)
	svc.now = func() time.Time { return time.Date(2026, 6, 11, 13, 0, 0, 0, time.UTC) }

	decision, err := svc.RejectReviewDecision(context.Background(), 42, 7, &RejectReviewDecisionRequest{
		Reason: "The PR still needs a rollback note for the migration path.",
	})

	require.NoError(t, err)
	require.False(t, decision.MergeReady)
	require.Equal(t, domain.ReviewDecisionStatusRejected, decision.DecisionStatus)
	require.NotNil(t, decision.Decision)
	require.Equal(t, "The PR still needs a rollback note for the migration path.", decision.Decision.Reason)
	require.Equal(t, reviewCheckStatusBlocked, checkStatusByKey(decision.Checks, "approval"))
}

func TestApproveReviewDecisionBlocksQueuedFixAttempt(t *testing.T) {
	svc := NewService(
		&memoryReviewRepo{},
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{
			attempts: map[uint][]*domain.SpecForgeFixAttempt{
				7: {
					{ID: 1, PRNodeID: 7, Status: domain.FixAttemptStatusQueued},
				},
			},
		},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)

	_, err := svc.ApproveReviewDecision(context.Background(), 42, 7, &ApproveReviewDecisionRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestRequestMergeReviewDecisionPassesApprovedHeadSHA(t *testing.T) {
	reviewRepo := &memoryReviewRepo{
		decisions: []*domain.SpecForgeReviewDecision{
			{
				ID:        1,
				PRNodeID:  7,
				Status:    domain.ReviewDecisionStatusApproved,
				HeadSHA:   "abc123def456",
				DecidedBy: 42,
				DecidedAt: time.Date(2026, 6, 11, 11, 0, 0, 0, time.UTC),
			},
		},
	}
	mergeRequester := &memoryMergeRequester{
		response: &githubintegration.MergePRNodeResponse{
			PRNode:  readyForReviewNode(),
			Merged:  true,
			Message: "Pull Request successfully merged",
			SHA:     "merge123",
		},
	}
	svc := NewService(
		reviewRepo,
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		mergeRequester,
	)

	result, err := svc.RequestMergeReviewDecision(context.Background(), 42, 7, &RequestMergeReviewDecisionRequest{
		MergeMethod:   "squash",
		CommitTitle:   "feat: merge invite flow",
		CommitMessage: "approved via CodingCTO",
	})

	require.NoError(t, err)
	require.True(t, result.MergeAccepted)
	require.Equal(t, "abc123def456", mergeRequester.request.ExpectedHeadSHA)
	require.Equal(t, "squash", mergeRequester.request.MergeMethod)
	require.Equal(t, "feat: merge invite flow", mergeRequester.request.CommitTitle)
}

func TestRequestMergeReviewDecisionRequiresCurrentApproval(t *testing.T) {
	svc := NewService(
		&memoryReviewRepo{},
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{},
		&memoryCIRefresher{},
		&memoryMergeRequester{},
	)

	_, err := svc.RequestMergeReviewDecision(context.Background(), 42, 7, &RequestMergeReviewDecisionRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
}

func TestRequestMergeReviewDecisionRefreshesCIAndRejectsBlockedNode(t *testing.T) {
	reviewRepo := &memoryReviewRepo{
		decisions: []*domain.SpecForgeReviewDecision{
			{
				ID:        1,
				PRNodeID:  7,
				Status:    domain.ReviewDecisionStatusApproved,
				HeadSHA:   "abc123def456",
				DecidedBy: 42,
				DecidedAt: time.Date(2026, 6, 11, 11, 0, 0, 0, time.UTC),
			},
		},
	}
	refresher := &memoryCIRefresher{
		response: func() *domain.SpecForgePRNode {
			node := readyForReviewNode()
			node.Status = domain.PRNodeStatusBlocked
			return node
		}(),
	}
	svc := NewService(
		reviewRepo,
		&memoryPRNodeReader{nodes: map[uint]*domain.SpecForgePRNode{7: readyForReviewNode()}},
		&memoryFixAttemptReader{},
		refresher,
		&memoryMergeRequester{},
	)

	_, err := svc.RequestMergeReviewDecision(context.Background(), 42, 7, &RequestMergeReviewDecisionRequest{})

	require.ErrorIs(t, err, domain.ErrConflict)
	require.NotNil(t, refresher.request)
	require.Equal(t, "github_agicto__codingcto", refresher.request.RepositoryID)
	require.Equal(t, uint(7), refresher.request.PRNodeID)
}

func readyForReviewNode() *domain.SpecForgePRNode {
	number := 81
	return &domain.SpecForgePRNode{
		ID:             7,
		RepositoryID:   "github_agicto__codingcto",
		NodeKey:        "PR-007",
		GitHubPRNumber: &number,
		GitHubPRURL:    "https://github.com/agicto/codingcto/pull/81",
		GitHubHeadSHA:  "abc123def456",
		Status:         domain.PRNodeStatusReadyForReview,
	}
}

func checkStatusByKey(checks []ReviewDecisionCheckDTO, key string) string {
	for _, check := range checks {
		if check.Key == key {
			return check.Status
		}
	}
	return ""
}

type memoryReviewRepo struct {
	decisions []*domain.SpecForgeReviewDecision
}

func (r *memoryReviewRepo) CreateReviewDecision(_ context.Context, decision *domain.SpecForgeReviewDecision) error {
	copied := *decision
	copied.ID = uint(len(r.decisions) + 1)
	copied.CreatedAt = copied.DecidedAt
	copied.UpdatedAt = copied.DecidedAt
	r.decisions = append(r.decisions, &copied)
	decision.ID = copied.ID
	decision.CreatedAt = copied.CreatedAt
	decision.UpdatedAt = copied.UpdatedAt
	return nil
}

func (r *memoryReviewRepo) UpdateReviewDecision(_ context.Context, decision *domain.SpecForgeReviewDecision) error {
	for i, existing := range r.decisions {
		if existing.ID != decision.ID {
			continue
		}
		copied := *decision
		copied.UpdatedAt = time.Date(2026, 6, 11, 12, 0, 0, 0, time.UTC)
		r.decisions[i] = &copied
		decision.UpdatedAt = copied.UpdatedAt
		return nil
	}
	return domain.ErrNotFound
}

func (r *memoryReviewRepo) FindLatestReviewDecisionByPRNodeID(_ context.Context, prNodeID uint) (*domain.SpecForgeReviewDecision, error) {
	for i := len(r.decisions) - 1; i >= 0; i-- {
		if r.decisions[i].PRNodeID != prNodeID {
			continue
		}
		copied := *r.decisions[i]
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

type memoryPRNodeReader struct {
	nodes map[uint]*domain.SpecForgePRNode
}

func (r *memoryPRNodeReader) FindPRNodeByID(_ context.Context, prNodeID uint) (*domain.SpecForgePRNode, error) {
	node, ok := r.nodes[prNodeID]
	if !ok {
		return nil, domain.ErrNotFound
	}
	copied := *node
	return &copied, nil
}

type memoryFixAttemptReader struct {
	attempts map[uint][]*domain.SpecForgeFixAttempt
}

func (r *memoryFixAttemptReader) ListFixAttemptsByPRNodeID(_ context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	attempts := r.attempts[prNodeID]
	out := make([]*domain.SpecForgeFixAttempt, len(attempts))
	for i, attempt := range attempts {
		copied := *attempt
		out[i] = &copied
	}
	return out, nil
}

type memoryMergeRequester struct {
	request  *githubintegration.MergePRNodeRequest
	response *githubintegration.MergePRNodeResponse
	err      error
}

func (r *memoryMergeRequester) MergePRNode(_ context.Context, req *githubintegration.MergePRNodeRequest) (*githubintegration.MergePRNodeResponse, error) {
	copied := *req
	r.request = &copied
	return r.response, r.err
}

type memoryCIRefresher struct {
	request  *githubintegration.RefreshPRNodeCIRequest
	response *domain.SpecForgePRNode
	err      error
}

func (r *memoryCIRefresher) RefreshPRNodeCI(_ context.Context, req *githubintegration.RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error) {
	copied := *req
	r.request = &copied
	if r.response == nil {
		return nil, r.err
	}
	node := *r.response
	return &node, r.err
}
