package verification

import (
	"context"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error)
	ListFixAttempts(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error)
}

type service struct {
	repo domain.SpecForgeVerificationRepository
}

func NewService(repo domain.SpecForgeVerificationRepository) *service {
	return &service{repo: repo}
}

func (s *service) CreateFixAttempt(ctx context.Context, userID, prNodeID uint, req *CreateFixAttemptRequest) (*domain.SpecForgeFixAttempt, error) {
	if userID == 0 || prNodeID == 0 || req == nil || strings.TrimSpace(req.FailureType) == "" {
		return nil, domain.ErrInvalidInput
	}
	count, err := s.repo.CountFixAttemptsByPRNodeID(ctx, prNodeID)
	if err != nil {
		return nil, fmt.Errorf("count fix attempts: %w", err)
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

func (s *service) ListFixAttempts(ctx context.Context, prNodeID uint) ([]*domain.SpecForgeFixAttempt, error) {
	if prNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ListFixAttemptsByPRNodeID(ctx, prNodeID)
}
