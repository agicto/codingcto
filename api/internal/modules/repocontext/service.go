package repocontext

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	UpsertProfile(ctx context.Context, userID uint, repoID string, req *UpsertRepoProfileRequest) (*domain.SpecForgeRepoProfile, error)
	GetProfile(ctx context.Context, repoID string) (*domain.SpecForgeRepoProfile, error)
}

type service struct {
	repo domain.SpecForgeRepoProfileRepository
}

func NewService(repo domain.SpecForgeRepoProfileRepository) *service {
	return &service{repo: repo}
}

func (s *service) UpsertProfile(ctx context.Context, userID uint, repoID string, req *UpsertRepoProfileRequest) (*domain.SpecForgeRepoProfile, error) {
	if userID == 0 || strings.TrimSpace(repoID) == "" || req == nil {
		return nil, domain.ErrInvalidInput
	}

	defaultBranch := strings.TrimSpace(req.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	ciProvider := strings.TrimSpace(req.CIProvider)
	if ciProvider == "" {
		ciProvider = "unknown"
	}

	profile := &domain.SpecForgeRepoProfile{
		RepositoryID:      strings.TrimSpace(repoID),
		DefaultBranch:     defaultBranch,
		Stack:             normalizeList(req.Stack),
		TestCommands:      normalizeList(req.TestCommands),
		CIProvider:        ciProvider,
		AppStructure:      normalizeList(req.AppStructure),
		CodingConventions: normalizeList(req.CodingConventions),
		RiskAreas:         normalizeList(req.RiskAreas),
		Summary:           strings.TrimSpace(req.Summary),
		CreatedBy:         userID,
		LastIndexedAt:     time.Now(),
	}
	if err := s.repo.UpsertProfile(ctx, profile); err != nil {
		return nil, fmt.Errorf("upsert repo profile: %w", err)
	}
	return profile, nil
}

func (s *service) GetProfile(ctx context.Context, repoID string) (*domain.SpecForgeRepoProfile, error) {
	if strings.TrimSpace(repoID) == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindProfileByRepositoryID(ctx, strings.TrimSpace(repoID))
}

func normalizeList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}
