package review

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/modules/githubintegration"
)

const (
	reviewCheckStatusReady     = "ready"
	reviewCheckStatusAttention = "attention"
	reviewCheckStatusBlocked   = "blocked"
)

type Service interface {
	GetReviewDecision(ctx context.Context, prNodeID uint) (*ReviewDecisionResponse, error)
	ApproveReviewDecision(ctx context.Context, userID, prNodeID uint, req *ApproveReviewDecisionRequest) (*ReviewDecisionResponse, error)
	RejectReviewDecision(ctx context.Context, userID, prNodeID uint, req *RejectReviewDecisionRequest) (*ReviewDecisionResponse, error)
	RequestMergeReviewDecision(ctx context.Context, userID, prNodeID uint, req *RequestMergeReviewDecisionRequest) (*RequestMergeReviewDecisionResponse, error)
}

type PRNodeReader interface {
	FindPRNodeByID(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, error)
}

type FixAttemptReader interface {
	ListFixAttemptsByPRNodeID(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error)
}

type PRNodeMergeRequester interface {
	MergePRNode(ctx context.Context, req *githubintegration.MergePRNodeRequest) (*githubintegration.MergePRNodeResponse, error)
}

type PRNodeCIRefresher interface {
	RefreshPRNodeCI(ctx context.Context, req *githubintegration.RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error)
}

type service struct {
	reviewRepo       domain.SpecForgeReviewDecisionRepository
	planningRepo     PRNodeReader
	verificationRepo FixAttemptReader
	ciRefresher      PRNodeCIRefresher
	mergeRequester   PRNodeMergeRequester
	now              func() time.Time
}

type reviewEvaluation struct {
	Decision       *domain.SpecForgeReviewDecision
	Checks         []ReviewDecisionCheckDTO
	DecisionStatus string
	MergeReady     bool
	Summary        string
	NextAction     string
}

func NewService(
	reviewRepo domain.SpecForgeReviewDecisionRepository,
	planningRepo PRNodeReader,
	verificationRepo FixAttemptReader,
	ciRefresher PRNodeCIRefresher,
	mergeRequester PRNodeMergeRequester,
) *service {
	return &service{
		reviewRepo:       reviewRepo,
		planningRepo:     planningRepo,
		verificationRepo: verificationRepo,
		ciRefresher:      ciRefresher,
		mergeRequester:   mergeRequester,
		now:              time.Now,
	}
}

func (s *service) GetReviewDecision(ctx context.Context, prNodeID uint) (*ReviewDecisionResponse, error) {
	node, decision, fixAttempts, err := s.loadReviewInputs(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	evaluation, err := s.evaluateReviewDecision(ctx, node, decision, fixAttempts)
	if err != nil {
		return nil, err
	}
	return &ReviewDecisionResponse{
		PRNode:         node,
		Decision:       toReviewDecisionDTO(evaluation.Decision),
		DecisionStatus: evaluation.DecisionStatus,
		MergeReady:     evaluation.MergeReady,
		Summary:        evaluation.Summary,
		NextAction:     evaluation.NextAction,
		Checks:         evaluation.Checks,
	}, nil
}

func (s *service) ApproveReviewDecision(ctx context.Context, userID, prNodeID uint, req *ApproveReviewDecisionRequest) (*ReviewDecisionResponse, error) {
	if userID == 0 || prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if req == nil {
		req = &ApproveReviewDecisionRequest{}
	}
	node, decision, fixAttempts, err := s.loadReviewInputs(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	evaluation, err := s.evaluateReviewDecision(ctx, node, decision, fixAttempts)
	if err != nil {
		return nil, err
	}
	if node == nil || node.Status == domain.PRNodeStatusMerged || node.Status == domain.PRNodeStatusClosed {
		return nil, domain.ErrConflict
	}
	if !eligibleForApproval(evaluation.Checks) {
		return nil, domain.ErrConflict
	}
	currentHeadSHA := strings.TrimSpace(node.GitHubHeadSHA)
	if evaluation.Decision != nil && evaluation.Decision.Status == domain.ReviewDecisionStatusApproved && evaluation.Decision.HeadSHA == currentHeadSHA {
		return &ReviewDecisionResponse{
			PRNode:         node,
			Decision:       toReviewDecisionDTO(evaluation.Decision),
			DecisionStatus: evaluation.Decision.Status,
			MergeReady:     evaluation.MergeReady,
			Summary:        evaluation.Summary,
			NextAction:     evaluation.NextAction,
			Checks:         evaluation.Checks,
		}, nil
	}
	decision = &domain.SpecForgeReviewDecision{
		PRNodeID:  prNodeID,
		Status:    domain.ReviewDecisionStatusApproved,
		HeadSHA:   currentHeadSHA,
		Reason:    strings.TrimSpace(req.Reason),
		DecidedBy: userID,
		DecidedAt: s.now().UTC(),
	}
	if err := s.reviewRepo.CreateReviewDecision(ctx, decision); err != nil {
		return nil, fmt.Errorf("create review approval: %w", err)
	}
	return s.GetReviewDecision(ctx, prNodeID)
}

func (s *service) RejectReviewDecision(ctx context.Context, userID, prNodeID uint, req *RejectReviewDecisionRequest) (*ReviewDecisionResponse, error) {
	if userID == 0 || prNodeID == 0 || req == nil || strings.TrimSpace(req.Reason) == "" {
		return nil, domain.ErrInvalidInput
	}
	node, decision, fixAttempts, err := s.loadReviewInputs(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	if _, err := s.evaluateReviewDecision(ctx, node, decision, fixAttempts); err != nil {
		return nil, err
	}
	if node == nil || node.Status == domain.PRNodeStatusMerged || node.Status == domain.PRNodeStatusClosed {
		return nil, domain.ErrConflict
	}
	if strings.TrimSpace(node.GitHubPRURL) == "" || node.GitHubPRNumber == nil || strings.TrimSpace(node.GitHubHeadSHA) == "" {
		return nil, domain.ErrConflict
	}
	decision = &domain.SpecForgeReviewDecision{
		PRNodeID:  prNodeID,
		Status:    domain.ReviewDecisionStatusRejected,
		HeadSHA:   strings.TrimSpace(node.GitHubHeadSHA),
		Reason:    strings.TrimSpace(req.Reason),
		DecidedBy: userID,
		DecidedAt: s.now().UTC(),
	}
	if err := s.reviewRepo.CreateReviewDecision(ctx, decision); err != nil {
		return nil, fmt.Errorf("create review rejection: %w", err)
	}
	return s.GetReviewDecision(ctx, prNodeID)
}

func (s *service) RequestMergeReviewDecision(ctx context.Context, userID, prNodeID uint, req *RequestMergeReviewDecisionRequest) (*RequestMergeReviewDecisionResponse, error) {
	if userID == 0 || prNodeID == 0 || req == nil || s.mergeRequester == nil {
		return nil, domain.ErrInvalidInput
	}
	node, decision, fixAttempts, err := s.loadReviewInputs(ctx, prNodeID)
	if err != nil {
		return nil, err
	}
	if s.ciRefresher != nil && node != nil && strings.TrimSpace(node.RepositoryID) != "" {
		refreshedNode, err := s.ciRefresher.RefreshPRNodeCI(ctx, &githubintegration.RefreshPRNodeCIRequest{
			RepositoryID: strings.TrimSpace(node.RepositoryID),
			PRNodeID:     node.ID,
		})
		if err != nil {
			return nil, fmt.Errorf("refresh pull request CI before merge: %w", err)
		}
		if refreshedNode != nil {
			node = refreshedNode
		}
	}
	evaluation, err := s.evaluateReviewDecision(ctx, node, decision, fixAttempts)
	if err != nil {
		return nil, err
	}
	if node == nil || evaluation.Decision == nil || evaluation.Decision.Status != domain.ReviewDecisionStatusApproved || !evaluation.MergeReady {
		return nil, domain.ErrConflict
	}
	mergeResult, err := s.mergeRequester.MergePRNode(ctx, &githubintegration.MergePRNodeRequest{
		RepositoryID:    strings.TrimSpace(node.RepositoryID),
		PRNodeID:        node.ID,
		ExpectedHeadSHA: strings.TrimSpace(evaluation.Decision.HeadSHA),
		MergeMethod:     strings.TrimSpace(req.MergeMethod),
		CommitTitle:     strings.TrimSpace(req.CommitTitle),
		CommitMessage:   strings.TrimSpace(req.CommitMessage),
	})
	if err != nil {
		return nil, err
	}
	prNode := node
	if mergeResult != nil && mergeResult.PRNode != nil {
		prNode = mergeResult.PRNode
	}
	return &RequestMergeReviewDecisionResponse{
		PRNode:         prNode,
		Decision:       toReviewDecisionDTO(evaluation.Decision),
		MergeAccepted:  mergeResult != nil && mergeResult.Merged,
		MergeMessage:   mergeMessage(mergeResult),
		MergeSHA:       mergeSHA(mergeResult),
		DecisionStatus: evaluation.Decision.Status,
	}, nil
}

func (s *service) loadReviewInputs(ctx context.Context, prNodeID uint) (*domain.SpecForgePRNode, *domain.SpecForgeReviewDecision, []*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 || s.planningRepo == nil || s.reviewRepo == nil {
		return nil, nil, nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, prNodeID)
	if err != nil {
		return nil, nil, nil, err
	}
	decision, err := s.reviewRepo.FindLatestReviewDecisionByPRNodeID(ctx, prNodeID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, nil, nil, err
	}
	if errors.Is(err, domain.ErrNotFound) {
		decision = nil
	}
	fixAttempts := []*domain.SpecForgeFixAttempt{}
	if s.verificationRepo != nil {
		fixAttempts, err = s.verificationRepo.ListFixAttemptsByPRNodeID(ctx, prNodeID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, nil, nil, err
		}
	}
	return node, decision, fixAttempts, nil
}

func (s *service) evaluateReviewDecision(ctx context.Context, node *domain.SpecForgePRNode, decision *domain.SpecForgeReviewDecision, fixAttempts []*domain.SpecForgeFixAttempt) (*reviewEvaluation, error) {
	decision, err := s.expireApprovalIfHeadChanged(ctx, node, decision)
	if err != nil {
		return nil, err
	}
	checks := make([]ReviewDecisionCheckDTO, 0, 5)
	checks = append(checks, reviewCheckPRAvailability(node))
	checks = append(checks, reviewCheckHeadSHA(node))
	checks = append(checks, reviewCheckCI(node))
	checks = append(checks, reviewCheckPendingFixAttempts(fixAttempts))
	checks = append(checks, reviewCheckApproval(node, decision))
	mergeReady := mergeReadyForReviewChecks(node, checks)
	return &reviewEvaluation{
		Decision:       decision,
		Checks:         checks,
		DecisionStatus: reviewDecisionStatus(decision),
		MergeReady:     mergeReady,
		Summary:        reviewSummary(node, decision, checks, mergeReady),
		NextAction:     reviewNextAction(node, decision, checks, mergeReady),
	}, nil
}

func (s *service) expireApprovalIfHeadChanged(ctx context.Context, node *domain.SpecForgePRNode, decision *domain.SpecForgeReviewDecision) (*domain.SpecForgeReviewDecision, error) {
	if node == nil || decision == nil || decision.Status != domain.ReviewDecisionStatusApproved {
		return decision, nil
	}
	currentHeadSHA := strings.TrimSpace(node.GitHubHeadSHA)
	if currentHeadSHA == "" || decision.HeadSHA == currentHeadSHA {
		return decision, nil
	}
	expiredAt := s.now().UTC()
	decision.Status = domain.ReviewDecisionStatusExpired
	decision.Reason = "Approval expired because the pull request head SHA changed."
	decision.ExpiredAt = &expiredAt
	if err := s.reviewRepo.UpdateReviewDecision(ctx, decision); err != nil {
		return nil, fmt.Errorf("expire stale review approval: %w", err)
	}
	return decision, nil
}

func reviewCheckPRAvailability(node *domain.SpecForgePRNode) ReviewDecisionCheckDTO {
	check := ReviewDecisionCheckDTO{
		Key:      "pull_request",
		Label:    "Pull request opened",
		Status:   reviewCheckStatusBlocked,
		Detail:   "Open the GitHub pull request before requesting merge approval.",
		Required: true,
	}
	if node == nil {
		return check
	}
	if node.GitHubPRNumber != nil && strings.TrimSpace(node.GitHubPRURL) != "" {
		check.Status = reviewCheckStatusReady
		check.Detail = fmt.Sprintf("GitHub PR #%d is linked to this PR node.", *node.GitHubPRNumber)
	}
	return check
}

func reviewCheckHeadSHA(node *domain.SpecForgePRNode) ReviewDecisionCheckDTO {
	check := ReviewDecisionCheckDTO{
		Key:      "head_sha",
		Label:    "Current head SHA recorded",
		Status:   reviewCheckStatusBlocked,
		Detail:   "Refresh the pull request so CodingCTO can pin approval to the current head SHA.",
		Required: true,
	}
	if node != nil && strings.TrimSpace(node.GitHubHeadSHA) != "" {
		check.Status = reviewCheckStatusReady
		check.Detail = fmt.Sprintf("Approval will be pinned to %s.", truncateSHA(node.GitHubHeadSHA))
	}
	return check
}

func reviewCheckCI(node *domain.SpecForgePRNode) ReviewDecisionCheckDTO {
	check := ReviewDecisionCheckDTO{
		Key:      "ci_status",
		Label:    "CI and review state clear",
		Status:   reviewCheckStatusAttention,
		Detail:   "Wait for CI to finish and for blocking GitHub feedback to clear.",
		Required: true,
	}
	if node == nil {
		return check
	}
	switch node.Status {
	case domain.PRNodeStatusReadyForReview:
		check.Status = reviewCheckStatusReady
		check.Detail = "GitHub reports the PR node ready for review."
	case domain.PRNodeStatusMerged:
		check.Status = reviewCheckStatusReady
		check.Detail = "This PR node is already merged."
	case domain.PRNodeStatusBlocked:
		check.Status = reviewCheckStatusBlocked
		check.Detail = "The PR node is blocked by CI failure or GitHub review feedback."
	case domain.PRNodeStatusCIRunning:
		check.Status = reviewCheckStatusAttention
		check.Detail = "CI is still running for this pull request."
	case domain.PRNodeStatusPROpened:
		check.Status = reviewCheckStatusAttention
		check.Detail = "The pull request is open, but CI has not reported a clean reviewable state yet."
	case domain.PRNodeStatusClosed:
		check.Status = reviewCheckStatusBlocked
		check.Detail = "The pull request is closed."
	default:
		check.Status = reviewCheckStatusBlocked
		check.Detail = "The PR node is not in a reviewable state yet."
	}
	return check
}

func reviewCheckPendingFixAttempts(fixAttempts []*domain.SpecForgeFixAttempt) ReviewDecisionCheckDTO {
	for _, attempt := range fixAttempts {
		if attempt == nil || attempt.Status != domain.FixAttemptStatusQueued {
			continue
		}
		return ReviewDecisionCheckDTO{
			Key:      "fix_attempts",
			Label:    "No queued fix attempts",
			Status:   reviewCheckStatusBlocked,
			Detail:   "A queued fix attempt is still active for this PR node.",
			Required: true,
		}
	}
	return ReviewDecisionCheckDTO{
		Key:      "fix_attempts",
		Label:    "No queued fix attempts",
		Status:   reviewCheckStatusReady,
		Detail:   "No queued fix attempt is blocking merge approval.",
		Required: true,
	}
}

func reviewCheckApproval(node *domain.SpecForgePRNode, decision *domain.SpecForgeReviewDecision) ReviewDecisionCheckDTO {
	check := ReviewDecisionCheckDTO{
		Key:      "approval",
		Label:    "CodingCTO approval current",
		Status:   reviewCheckStatusAttention,
		Detail:   "Approve the current pull request head SHA inside CodingCTO.",
		Required: true,
	}
	if decision == nil {
		return check
	}
	switch decision.Status {
	case domain.ReviewDecisionStatusApproved:
		if node != nil && strings.TrimSpace(node.GitHubHeadSHA) != "" && decision.HeadSHA == strings.TrimSpace(node.GitHubHeadSHA) {
			check.Status = reviewCheckStatusReady
			check.Detail = "The current head SHA is approved for merge in CodingCTO."
			return check
		}
		check.Status = reviewCheckStatusBlocked
		check.Detail = "Approval does not match the current pull request head SHA."
	case domain.ReviewDecisionStatusRejected:
		check.Status = reviewCheckStatusBlocked
		if strings.TrimSpace(decision.Reason) != "" {
			check.Detail = decision.Reason
		} else {
			check.Detail = "Merge approval is explicitly rejected for the current pull request head SHA."
		}
	case domain.ReviewDecisionStatusExpired:
		check.Status = reviewCheckStatusAttention
		if strings.TrimSpace(decision.Reason) != "" {
			check.Detail = decision.Reason
		} else {
			check.Detail = "Approval expired because the pull request changed."
		}
	}
	return check
}

func mergeReadyForReviewChecks(node *domain.SpecForgePRNode, checks []ReviewDecisionCheckDTO) bool {
	if node == nil || node.Status == domain.PRNodeStatusMerged || node.Status == domain.PRNodeStatusClosed {
		return false
	}
	for _, check := range checks {
		if check.Required && check.Status != reviewCheckStatusReady {
			return false
		}
	}
	return true
}

func eligibleForApproval(checks []ReviewDecisionCheckDTO) bool {
	for _, check := range checks {
		if !check.Required || check.Key == "approval" {
			continue
		}
		if check.Status != reviewCheckStatusReady {
			return false
		}
	}
	return true
}

func reviewDecisionStatus(decision *domain.SpecForgeReviewDecision) string {
	if decision == nil {
		return "pending"
	}
	return decision.Status
}

func reviewSummary(node *domain.SpecForgePRNode, decision *domain.SpecForgeReviewDecision, checks []ReviewDecisionCheckDTO, mergeReady bool) string {
	if node == nil {
		return "PR node could not be loaded."
	}
	if node.Status == domain.PRNodeStatusMerged {
		return "This pull request is already merged."
	}
	if node.Status == domain.PRNodeStatusClosed {
		return "This pull request is closed and cannot be merged."
	}
	if mergeReady {
		return "This pull request is approved for the current head SHA and ready to merge."
	}
	for _, check := range checks {
		if check.Status == reviewCheckStatusBlocked {
			return check.Detail
		}
	}
	if decision != nil && decision.Status == domain.ReviewDecisionStatusExpired {
		return "Previous approval expired and must be renewed for the latest commit."
	}
	return "This pull request still needs an explicit CodingCTO approval for the current head SHA."
}

func reviewNextAction(node *domain.SpecForgePRNode, decision *domain.SpecForgeReviewDecision, checks []ReviewDecisionCheckDTO, mergeReady bool) string {
	if node == nil {
		return "Reload the PR node and try again."
	}
	if node.Status == domain.PRNodeStatusMerged {
		return "No further merge decision is required."
	}
	if node.Status == domain.PRNodeStatusClosed {
		return "Re-open or replace the pull request before approving merge."
	}
	if mergeReady {
		return "This PR can proceed to the merge capability step."
	}
	for _, check := range checks {
		switch {
		case check.Key == "pull_request" && check.Status != reviewCheckStatusReady:
			return "Open the GitHub pull request, then refresh the review decision."
		case check.Key == "head_sha" && check.Status != reviewCheckStatusReady:
			return "Refresh pull request metadata so CodingCTO can pin approval to the current head SHA."
		case check.Key == "ci_status" && check.Status == reviewCheckStatusBlocked:
			return "Resolve blocking CI failures or GitHub review feedback before approving merge."
		case check.Key == "ci_status" && check.Status == reviewCheckStatusAttention:
			return "Wait for CI to finish, then refresh the review decision."
		case check.Key == "fix_attempts" && check.Status != reviewCheckStatusReady:
			return "Wait for the queued fix attempt to finish before approving merge."
		case check.Key == "approval" && check.Status == reviewCheckStatusBlocked:
			return "Update the pull request and record a fresh approval after the concerns are resolved."
		}
	}
	if decision != nil && decision.Status == domain.ReviewDecisionStatusExpired {
		return "Approve the latest pull request head SHA again."
	}
	return "Approve the current head SHA to mark this pull request ready for merge."
}

func truncateSHA(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= 12 {
		return value
	}
	return value[:12]
}

func mergeMessage(result *githubintegration.MergePRNodeResponse) string {
	if result == nil || strings.TrimSpace(result.Message) == "" {
		return "GitHub accepted the merge request. Webhook reconciliation will confirm the final PR state."
	}
	return strings.TrimSpace(result.Message)
}

func mergeSHA(result *githubintegration.MergePRNodeResponse) string {
	if result == nil {
		return ""
	}
	return strings.TrimSpace(result.SHA)
}
