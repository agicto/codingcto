package project

import (
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

func buildProjectExpertPolicy(project *domain.SpecForgeProject, userID uint, version int, req *UpsertProjectExpertPolicyRequest) (*domain.SpecForgeProjectExpertPolicy, error) {
	if project == nil || req == nil {
		return nil, domain.ErrInvalidInput
	}
	goalBoundary := strings.TrimSpace(req.GoalBoundary)
	if goalBoundary == "" {
		return nil, domain.ErrInvalidInput
	}
	reviewPolicy := domain.SpecForgeProjectExpertReviewPolicy{
		RequiredApprovals:       req.ReviewPolicy.RequiredApprovals,
		AllowAuthorApproval:     req.ReviewPolicy.AllowAuthorApproval,
		BlockOnChangesRequested: req.ReviewPolicy.BlockOnChangesRequested,
		RequireCIGreen:          req.ReviewPolicy.RequireCIGreen,
	}
	if reviewPolicy.RequiredApprovals < 0 || reviewPolicy.RequiredApprovals > 10 {
		return nil, domain.ErrInvalidInput
	}
	strategy := strings.TrimSpace(req.MergePolicy.Strategy)
	if strategy == "" {
		strategy = domain.ProjectMergeStrategySquash
	}
	switch strategy {
	case domain.ProjectMergeStrategySquash, domain.ProjectMergeStrategyRebase, domain.ProjectMergeStrategyMerge:
	default:
		return nil, domain.ErrInvalidInput
	}
	return &domain.SpecForgeProjectExpertPolicy{
		WorkspaceID:          strings.TrimSpace(project.WorkspaceID),
		ProjectID:            project.ID,
		Version:              version,
		Active:               true,
		GoalBoundary:         goalBoundary,
		AllowedPaths:         normalizeProjectPolicyStrings(req.AllowedPaths),
		ForbiddenPaths:       normalizeProjectPolicyStrings(req.ForbiddenPaths),
		RequiredTestCommands: normalizeProjectPolicyStrings(req.RequiredTestCommands),
		ReviewPolicy:         reviewPolicy,
		MergePolicy: domain.SpecForgeProjectExpertMergePolicy{
			Strategy:              strategy,
			RequireManualApproval: req.MergePolicy.RequireManualApproval,
			AllowAutoMerge:        req.MergePolicy.AllowAutoMerge,
		},
		CreatedBy: userID,
	}, nil
}

func normalizeProjectPolicyStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.Join(strings.Fields(strings.TrimSpace(value)), " ")
		if value == "" {
			continue
		}
		duplicate := false
		for _, existing := range out {
			if existing == value {
				duplicate = true
				break
			}
		}
		if !duplicate {
			out = append(out, value)
		}
	}
	return out
}
