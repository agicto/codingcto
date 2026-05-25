package githubintegration

import (
	"context"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error)
	GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error)
	UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error)
	GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error)
}

type service struct {
	repo domain.GitHubIntegrationRepository
}

func NewService(repo domain.GitHubIntegrationRepository) *service {
	return &service{repo: repo}
}

func (s *service) UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || req.InstallationID == 0 || strings.TrimSpace(req.AccountLogin) == "" {
		return nil, domain.ErrInvalidInput
	}
	installation := &domain.GitHubInstallation{
		WorkspaceID:    strings.TrimSpace(req.WorkspaceID),
		InstallationID: req.InstallationID,
		AccountLogin:   strings.TrimSpace(req.AccountLogin),
		Permissions:    normalizePermissions(req.Permissions),
		CreatedBy:      userID,
	}
	if err := s.repo.UpsertInstallation(ctx, installation); err != nil {
		return nil, fmt.Errorf("upsert github installation: %w", err)
	}
	return installation, nil
}

func (s *service) GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindInstallationByID(ctx, id)
}

func (s *service) UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || req.GitHubInstallationID == 0 || strings.TrimSpace(req.GitHubOwner) == "" || strings.TrimSpace(req.GitHubRepo) == "" {
		return nil, domain.ErrInvalidInput
	}
	defaultBranch := strings.TrimSpace(req.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	repositoryID := strings.TrimSpace(req.RepositoryID)
	if repositoryID == "" {
		repositoryID = fmt.Sprintf("github_%s__%s", strings.TrimSpace(req.GitHubOwner), strings.TrimSpace(req.GitHubRepo))
	}

	repository := &domain.Repository{
		RepositoryID:         repositoryID,
		WorkspaceID:          strings.TrimSpace(req.WorkspaceID),
		GitHubInstallationID: req.GitHubInstallationID,
		GitHubOwner:          strings.TrimSpace(req.GitHubOwner),
		GitHubRepo:           strings.TrimSpace(req.GitHubRepo),
		DefaultBranch:        defaultBranch,
		IsPrivate:            req.IsPrivate,
		CreatedBy:            userID,
	}
	if err := s.repo.UpsertRepository(ctx, repository); err != nil {
		return nil, fmt.Errorf("upsert repository: %w", err)
	}
	return repository, nil
}

func (s *service) GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	if strings.TrimSpace(repositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(repositoryID))
}

func normalizePermissions(permissions map[string]string) map[string]string {
	out := make(map[string]string, len(permissions))
	for key, value := range permissions {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		out[key] = value
	}
	return out
}
