package workspace

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateWorkspace(ctx context.Context, userID uint, req *CreateWorkspaceRequest) (*domain.Workspace, error)
	UpdateWorkspace(ctx context.Context, workspaceID string, req *UpdateWorkspaceRequest) (*domain.Workspace, error)
	GetWorkspace(ctx context.Context, workspaceID string) (*domain.Workspace, error)
	ListWorkspaces(ctx context.Context, userID uint, req *ListWorkspacesRequest) ([]*domain.Workspace, error)
}

type service struct {
	repo domain.WorkspaceRepository
}

func NewService(repo domain.WorkspaceRepository) *service {
	return &service{repo: repo}
}

func (s *service) CreateWorkspace(ctx context.Context, userID uint, req *CreateWorkspaceRequest) (*domain.Workspace, error) {
	if userID == 0 || req == nil {
		return nil, domain.ErrInvalidInput
	}
	name := strings.TrimSpace(req.Name)
	slug := normalizeSlug(req.Slug)
	if slug == "" {
		slug = normalizeSlug(name)
	}
	workspaceID := normalizeWorkspaceID(req.WorkspaceID)
	if workspaceID == "" {
		workspaceID = "workspace_" + strings.ReplaceAll(slug, "-", "_")
	}
	if name == "" || slug == "" || workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	if _, err := s.repo.FindWorkspaceByWorkspaceID(ctx, workspaceID); err == nil {
		return nil, domain.ErrConflict
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	if _, err := s.repo.FindWorkspaceBySlug(ctx, slug); err == nil {
		return nil, domain.ErrConflict
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	workspace := &domain.Workspace{
		WorkspaceID: workspaceID,
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(req.Description),
		Status:      domain.WorkspaceStatusActive,
		CreatedBy:   userID,
	}
	if err := s.repo.CreateWorkspace(ctx, workspace); err != nil {
		return nil, fmt.Errorf("create workspace: %w", err)
	}
	return workspace, nil
}

func (s *service) UpdateWorkspace(ctx context.Context, workspaceID string, req *UpdateWorkspaceRequest) (*domain.Workspace, error) {
	if req == nil {
		return nil, domain.ErrInvalidInput
	}
	workspace, err := s.GetWorkspace(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, domain.ErrInvalidInput
		}
		workspace.Name = name
	}
	if req.Description != nil {
		workspace.Description = strings.TrimSpace(*req.Description)
	}
	if req.Status != nil {
		status := strings.TrimSpace(*req.Status)
		if status != domain.WorkspaceStatusActive && status != domain.WorkspaceStatusArchived {
			return nil, domain.ErrInvalidInput
		}
		workspace.Status = status
	}
	if err := s.repo.UpdateWorkspace(ctx, workspace); err != nil {
		return nil, fmt.Errorf("update workspace: %w", err)
	}
	return workspace, nil
}

func (s *service) GetWorkspace(ctx context.Context, workspaceID string) (*domain.Workspace, error) {
	workspaceID = normalizeWorkspaceID(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindWorkspaceByWorkspaceID(ctx, workspaceID)
}

func (s *service) ListWorkspaces(ctx context.Context, userID uint, req *ListWorkspacesRequest) ([]*domain.Workspace, error) {
	if userID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if req == nil {
		req = &ListWorkspacesRequest{}
	}
	return s.repo.ListWorkspaces(ctx, userID, strings.TrimSpace(req.Status), req.Limit)
}

var slugNonWord = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeSlug(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	value = slugNonWord.ReplaceAllString(value, "-")
	return strings.Trim(value, "-")
}

func normalizeWorkspaceID(value string) string {
	return domain.NormalizeWorkspaceID(value)
}
