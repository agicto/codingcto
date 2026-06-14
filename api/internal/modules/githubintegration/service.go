package githubintegration

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
	"github.com/zgiai/luas/api/internal/infra/events"
)

type Service interface {
	StartOAuth(ctx context.Context, userID uint, req *OAuthStartRequest) (*OAuthStartResponse, error)
	HandleOAuthCallback(ctx context.Context, req *OAuthCallbackRequest) (*GitHubConnectionSummary, string, error)
	GetConnection(ctx context.Context, workspaceID string) (*GitHubConnectionSummary, error)
	DisconnectConnection(ctx context.Context, workspaceID string) error
	SyncRepositories(ctx context.Context, req *SyncRepositoriesRequest) (*SyncRepositoriesResponse, error)
	ListRepositoryAccesses(ctx context.Context, req *ListRepositoryAccessesRequest) (*ListRepositoryAccessesResponse, error)
	UpsertInstallation(ctx context.Context, userID uint, req *UpsertInstallationRequest) (*domain.GitHubInstallation, error)
	SyncInstallation(ctx context.Context, userID uint, req *SyncInstallationRequest) (*SyncInstallationResponse, error)
	SyncInstallationByID(ctx context.Context, userID uint, installationID int64, req *SyncInstallationByIDRequest) (*SyncInstallationResponse, error)
	GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error)
	GetInstallationStatus(ctx context.Context, workspaceID string) (*GitHubInstallationStatusResponse, error)
	UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error)
	GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error)
	ListRepositories(ctx context.Context, workspaceID string) ([]*domain.Repository, error)
	CheckRepositoryReadiness(ctx context.Context, repositoryID string) (*GitHubRepositoryReadinessResponse, error)
	GetSettings(ctx context.Context, workspaceID string) (*domain.GitHubSettings, error)
	UpsertSettings(ctx context.Context, userID uint, req *UpsertSettingsRequest) (*domain.GitHubSettings, error)
	CreateIssue(ctx context.Context, req *CreateIssueRequest) (*GitHubIssueResponse, error)
	ListRepositoryTree(ctx context.Context, req *ListRepositoryTreeRequest) (*RepositoryTreeSnapshot, error)
	ReadRepositoryFile(ctx context.Context, req *ReadRepositoryFileRequest) (*RepositoryFileSnapshot, error)
	PreparePRNodeBranch(ctx context.Context, req *PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error)
	DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error)
	MergePRNode(ctx context.Context, req *MergePRNodeRequest) (*MergePRNodeResponse, error)
	RefreshPRNodeCI(ctx context.Context, req *RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error)
	ReadPRNodeFailureLog(ctx context.Context, req *ReadPRNodeFailureLogRequest) (*PRNodeFailureLog, error)
	RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error)
	ListWebhookEvents(ctx context.Context, req *ListWebhookEventsRequest) ([]*domain.GitHubWebhookEvent, error)
}

type service struct {
	repo          domain.GitHubIntegrationRepository
	planningRepo  domain.SpecForgePlanningRepository
	clientFactory RepositoryClientFactory
	tokenProvider InstallationTokenProvider
	oauthClient   OAuthClient
	eventBus      *events.EventBus
}

func NewService(repo domain.GitHubIntegrationRepository, planningRepo domain.SpecForgePlanningRepository, clientFactory RepositoryClientFactory, tokenProvider InstallationTokenProvider, eventBus *events.EventBus) *service {
	if clientFactory == nil {
		clientFactory = defaultRepositoryClientFactory{}
	}
	if tokenProvider == nil {
		tokenProvider = defaultInstallationTokenProvider{}
	}
	return &service{repo: repo, planningRepo: planningRepo, clientFactory: clientFactory, tokenProvider: tokenProvider, oauthClient: NewDefaultOAuthClient(), eventBus: eventBus}
}

type githubOAuthStore interface {
	UpsertAccountConnection(ctx context.Context, connection *domain.GitHubAccountConnection) error
	FindAccountConnectionByWorkspaceID(ctx context.Context, workspaceID string) (*domain.GitHubAccountConnection, error)
	DeleteAccountConnectionByWorkspaceID(ctx context.Context, workspaceID string) error
	TouchAccountConnectionSyncedAt(ctx context.Context, workspaceID string, syncedAt time.Time) error
	UpsertRepositoryAccess(ctx context.Context, access *domain.GitHubRepositoryAccess) error
	FindRepositoryAccessByID(ctx context.Context, id uint) (*domain.GitHubRepositoryAccess, error)
	ListRepositoryAccesses(ctx context.Context, workspaceID, sourceType, organizationLogin, query string) ([]*domain.GitHubRepositoryAccess, error)
}

func (s *service) oauthStore() (githubOAuthStore, error) {
	store, ok := s.repo.(githubOAuthStore)
	if !ok || store == nil {
		return nil, fmt.Errorf("github integration: oauth repository store is not available")
	}
	return store, nil
}

func (s *service) StartOAuth(ctx context.Context, userID uint, req *OAuthStartRequest) (*OAuthStartResponse, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" {
		return nil, domain.ErrInvalidInput
	}
	state, err := newOAuthState(req.WorkspaceID, userID, req.RedirectTo)
	if err != nil {
		return nil, err
	}
	authorizationURL, err := s.oauthClient.AuthorizationURL(state)
	if err != nil {
		return nil, err
	}
	return &OAuthStartResponse{AuthorizationURL: authorizationURL, State: state}, nil
}

func (s *service) HandleOAuthCallback(ctx context.Context, req *OAuthCallbackRequest) (*GitHubConnectionSummary, string, error) {
	if req == nil || strings.TrimSpace(req.Code) == "" || strings.TrimSpace(req.State) == "" {
		return nil, "", domain.ErrInvalidInput
	}
	state, err := parseOAuthState(req.State)
	if err != nil {
		return nil, "", err
	}
	token, err := s.oauthClient.ExchangeCode(ctx, req.Code)
	if err != nil {
		return nil, "", err
	}
	user, err := s.oauthClient.GetAuthenticatedUser(ctx, token.AccessToken)
	if err != nil {
		return nil, "", err
	}
	encryptedAccessToken, err := encryptGitHubToken(token.AccessToken)
	if err != nil {
		return nil, "", err
	}
	encryptedRefreshToken, err := encryptGitHubToken(token.RefreshToken)
	if err != nil {
		return nil, "", err
	}
	now := time.Now().UTC()
	connection := &domain.GitHubAccountConnection{
		WorkspaceID:           strings.TrimSpace(state.WorkspaceID),
		UserID:                state.UserID,
		GitHubUserID:          user.ID,
		GitHubLogin:           strings.TrimSpace(user.Login),
		GitHubName:            strings.TrimSpace(user.Name),
		GitHubAvatarURL:       strings.TrimSpace(user.AvatarURL),
		AccessTokenEncrypted:  encryptedAccessToken,
		RefreshTokenEncrypted: encryptedRefreshToken,
		ScopeString:           strings.TrimSpace(token.Scope),
		TokenStatus:           domain.GitHubConnectionStatusConnected,
		LastVerifiedAt:        &now,
	}
	store, err := s.oauthStore()
	if err != nil {
		return nil, "", err
	}
	if err := store.UpsertAccountConnection(ctx, connection); err != nil {
		return nil, "", fmt.Errorf("upsert github oauth connection: %w", err)
	}
	return summarizeConnection(connection), strings.TrimSpace(state.RedirectTo), nil
}

func (s *service) GetConnection(ctx context.Context, workspaceID string) (*GitHubConnectionSummary, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	store, err := s.oauthStore()
	if err != nil {
		return nil, err
	}
	connection, err := store.FindAccountConnectionByWorkspaceID(ctx, workspaceID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return summarizeConnection(connection), nil
}

func (s *service) DisconnectConnection(ctx context.Context, workspaceID string) error {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return domain.ErrInvalidInput
	}
	store, err := s.oauthStore()
	if err != nil {
		return err
	}
	err = store.DeleteAccountConnectionByWorkspaceID(ctx, workspaceID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	return err
}

func (s *service) SyncRepositories(ctx context.Context, req *SyncRepositoriesRequest) (*SyncRepositoriesResponse, error) {
	if req == nil || strings.TrimSpace(req.WorkspaceID) == "" {
		return nil, domain.ErrInvalidInput
	}
	store, err := s.oauthStore()
	if err != nil {
		return nil, err
	}
	connection, err := store.FindAccountConnectionByWorkspaceID(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	if connection.TokenStatus != domain.GitHubConnectionStatusConnected {
		return nil, fmt.Errorf("%w: github connection is %s", domain.ErrInvalidInput, connection.TokenStatus)
	}
	token, err := decryptGitHubToken(connection.AccessTokenEncrypted)
	if err != nil {
		return nil, err
	}
	repositories, err := s.oauthClient.ListAuthenticatedRepositories(ctx, token)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	options := make([]GitHubRepositoryOption, 0, len(repositories))
	personalCount := 0
	organizationCount := 0
	for _, repository := range repositories {
		owner, repoName := splitRepositoryFullName(repository.FullName)
		if owner == "" {
			owner = strings.TrimSpace(repository.Owner.Login)
		}
		if repoName == "" {
			repoName = strings.TrimSpace(repository.Name)
		}
		if owner == "" || repoName == "" || repository.ID == 0 {
			continue
		}
		sourceType := domain.GitHubRepositoryAccessSourcePersonal
		organizationLogin := ""
		if strings.EqualFold(strings.TrimSpace(repository.Owner.Type), "Organization") {
			sourceType = domain.GitHubRepositoryAccessSourceOrganization
			organizationLogin = owner
			organizationCount++
		} else {
			personalCount++
		}
		defaultBranch := defaultText(strings.TrimSpace(repository.DefaultBranch), "main")
		access := &domain.GitHubRepositoryAccess{
			WorkspaceID:       strings.TrimSpace(connection.WorkspaceID),
			ConnectionID:      connection.ID,
			GitHubRepoID:      repository.ID,
			OwnerLogin:        owner,
			RepoName:          repoName,
			FullName:          defaultText(strings.TrimSpace(repository.FullName), owner+"/"+repoName),
			HTMLURL:           strings.TrimSpace(repository.HTMLURL),
			DefaultBranch:     defaultBranch,
			Visibility:        defaultText(strings.TrimSpace(repository.Visibility), repositoryVisibility(repository.Private)),
			IsPrivate:         repository.Private,
			SourceType:        sourceType,
			OrganizationLogin: organizationLogin,
			Permissions:       repository.Permissions,
			Archived:          repository.Archived,
			Disabled:          repository.Disabled,
			LastSeenAt:        now,
		}
		if err := store.UpsertRepositoryAccess(ctx, access); err != nil {
			return nil, fmt.Errorf("upsert github repository access: %w", err)
		}
		if err := s.repo.UpsertRepository(ctx, &domain.Repository{
			RepositoryID:             githubRepositoryID(owner, repoName),
			WorkspaceID:              connection.WorkspaceID,
			GitHubConnectionID:       connection.ID,
			GitHubRepositoryAccessID: access.ID,
			AccessSource:             domain.RepositoryAccessSourceOAuthUser,
			GitHubOwner:              owner,
			GitHubRepo:               repoName,
			DefaultBranch:            defaultBranch,
			IsPrivate:                repository.Private,
			CreatedBy:                connection.UserID,
		}); err != nil {
			return nil, fmt.Errorf("upsert oauth repository: %w", err)
		}
		options = append(options, GitHubRepositoryOption{
			ID:            repository.ID,
			Name:          repoName,
			FullName:      access.FullName,
			Owner:         owner,
			Repo:          repoName,
			DefaultBranch: defaultBranch,
			IsPrivate:     repository.Private,
			HTMLURL:       repository.HTMLURL,
		})
	}
	if err := store.TouchAccountConnectionSyncedAt(ctx, connection.WorkspaceID, now); err != nil {
		return nil, fmt.Errorf("touch github oauth connection sync time: %w", err)
	}
	connection.LastSyncedAt = &now
	return &SyncRepositoriesResponse{
		Connection:        summarizeConnection(connection),
		RepositoryCount:   len(options),
		PersonalCount:     personalCount,
		OrganizationCount: organizationCount,
		SyncedAt:          now.Format(time.RFC3339),
		Repositories:      options,
	}, nil
}

func (s *service) ListRepositoryAccesses(ctx context.Context, req *ListRepositoryAccessesRequest) (*ListRepositoryAccessesResponse, error) {
	if req == nil || strings.TrimSpace(req.WorkspaceID) == "" {
		return nil, domain.ErrInvalidInput
	}
	store, err := s.oauthStore()
	if err != nil {
		return nil, err
	}
	repositories, err := store.ListRepositoryAccesses(ctx, req.WorkspaceID, req.SourceType, req.OrganizationLogin, req.Query)
	if err != nil {
		return nil, err
	}
	personalCount := 0
	organizationCount := 0
	for _, repository := range repositories {
		if repository == nil {
			continue
		}
		if repository.SourceType == domain.GitHubRepositoryAccessSourceOrganization {
			organizationCount++
		} else {
			personalCount++
		}
	}
	return &ListRepositoryAccessesResponse{
		Repositories:      repositories,
		RepositoryCount:   len(repositories),
		PersonalCount:     personalCount,
		OrganizationCount: organizationCount,
	}, nil
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

func (s *service) SyncInstallation(ctx context.Context, userID uint, req *SyncInstallationRequest) (*SyncInstallationResponse, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || req.InstallationID == 0 {
		return nil, domain.ErrInvalidInput
	}
	appInstallation, err := s.tokenProvider.Installation(ctx, req.InstallationID)
	if err != nil {
		return nil, err
	}
	installation := &domain.GitHubInstallation{
		WorkspaceID:    strings.TrimSpace(req.WorkspaceID),
		InstallationID: req.InstallationID,
		AccountLogin:   strings.TrimSpace(appInstallation.Account.Login),
		Permissions:    normalizePermissions(appInstallation.Permissions),
		CreatedBy:      userID,
	}
	if err := s.repo.UpsertInstallation(ctx, installation); err != nil {
		return nil, fmt.Errorf("sync github installation: %w", err)
	}

	token, err := s.tokenProvider.InstallationToken(ctx, req.InstallationID)
	if err != nil {
		return nil, err
	}
	client, err := s.clientFactory.NewRepositoryClient(token.Token)
	if err != nil {
		return nil, err
	}
	repositories, err := client.ListInstallationRepositories(ctx)
	if err != nil {
		return nil, err
	}
	options := make([]GitHubRepositoryOption, 0, len(repositories))
	for _, repository := range repositories {
		owner, repoName := splitRepositoryFullName(repository.FullName)
		if owner == "" {
			owner = strings.TrimSpace(repository.Owner.Login)
		}
		if repoName == "" {
			repoName = strings.TrimSpace(repository.Name)
		}
		defaultBranch := defaultText(strings.TrimSpace(repository.DefaultBranch), "main")
		options = append(options, GitHubRepositoryOption{
			ID:            repository.ID,
			Name:          repository.Name,
			FullName:      repository.FullName,
			Owner:         owner,
			Repo:          repoName,
			DefaultBranch: defaultBranch,
			IsPrivate:     repository.Private,
			HTMLURL:       repository.HTMLURL,
		})
		if owner == "" || repoName == "" {
			continue
		}
		if err := s.repo.UpsertRepository(ctx, &domain.Repository{
			RepositoryID:         fmt.Sprintf("github_%s__%s", owner, repoName),
			WorkspaceID:          installation.WorkspaceID,
			GitHubInstallationID: installation.ID,
			GitHubOwner:          owner,
			GitHubRepo:           repoName,
			DefaultBranch:        defaultBranch,
			IsPrivate:            repository.Private,
			CreatedBy:            userID,
		}); err != nil {
			return nil, fmt.Errorf("sync github repository: %w", err)
		}
	}
	return &SyncInstallationResponse{Installation: installation, Repositories: options}, nil
}

func (s *service) SyncInstallationByID(ctx context.Context, userID uint, installationID int64, req *SyncInstallationByIDRequest) (*SyncInstallationResponse, error) {
	if req == nil {
		return nil, domain.ErrInvalidInput
	}
	return s.SyncInstallation(ctx, userID, &SyncInstallationRequest{
		WorkspaceID:    strings.TrimSpace(req.WorkspaceID),
		InstallationID: installationID,
	})
}

func (s *service) GetInstallation(ctx context.Context, id uint) (*domain.GitHubInstallation, error) {
	if id == 0 {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindInstallationByID(ctx, id)
}

func (s *service) GetInstallationStatus(ctx context.Context, workspaceID string) (*GitHubInstallationStatusResponse, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	installations, err := s.repo.ListInstallationsByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	repositories, err := s.repo.ListRepositoriesByWorkspaceID(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	repositoryCountByInstallation := map[uint]int{}
	for _, repository := range repositories {
		if repository == nil || repository.GitHubInstallationID == 0 {
			continue
		}
		repositoryCountByInstallation[repository.GitHubInstallationID]++
	}
	items := make([]*GitHubInstallationStatusItem, 0, len(installations))
	for _, installation := range installations {
		if installation == nil {
			continue
		}
		items = append(items, &GitHubInstallationStatusItem{
			ID:              installation.ID,
			InstallationID:  installation.InstallationID,
			AccountLogin:    installation.AccountLogin,
			Permissions:     normalizePermissions(installation.Permissions),
			RepositoryCount: repositoryCountByInstallation[installation.ID],
			UpdatedAt:       installation.UpdatedAt.UTC().Format(time.RFC3339),
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].UpdatedAt > items[j].UpdatedAt
	})
	return &GitHubInstallationStatusResponse{
		WorkspaceID:     workspaceID,
		RepositoryCount: len(repositories),
		Installations:   items,
	}, nil
}

func (s *service) UpsertRepository(ctx context.Context, userID uint, req *UpsertRepositoryRequest) (*domain.Repository, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" || strings.TrimSpace(req.GitHubOwner) == "" || strings.TrimSpace(req.GitHubRepo) == "" {
		return nil, domain.ErrInvalidInput
	}
	defaultBranch := strings.TrimSpace(req.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	repositoryID := strings.TrimSpace(req.RepositoryID)
	if repositoryID == "" {
		repositoryID = githubRepositoryID(req.GitHubOwner, req.GitHubRepo)
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
	installationAssociatedFromSync, err := s.associateRepositoryInstallationFromWorkspace(ctx, repository)
	if err != nil {
		return nil, err
	}
	needsAccessValidation := repository.GitHubInstallationID > 0 && !installationAssociatedFromSync
	if needsAccessValidation {
		existing, err := s.repo.FindRepositoryByRepositoryID(ctx, repository.RepositoryID)
		if err == nil && sameGitHubRepositoryAccess(existing, repository) {
			needsAccessValidation = false
		} else if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, err
		}
	}
	if needsAccessValidation {
		if err := s.validateRepositoryAccess(ctx, repository); err != nil {
			return nil, err
		}
	}
	if err := s.repo.UpsertRepository(ctx, repository); err != nil {
		return nil, fmt.Errorf("upsert repository: %w", err)
	}
	return repository, nil
}

func (s *service) associateRepositoryInstallationFromWorkspace(ctx context.Context, repository *domain.Repository) (bool, error) {
	if repository == nil || repository.GitHubInstallationID > 0 || strings.TrimSpace(repository.WorkspaceID) == "" {
		return false, nil
	}
	repositories, err := s.repo.ListRepositoriesByWorkspaceID(ctx, repository.WorkspaceID)
	if err != nil {
		return false, err
	}
	for _, candidate := range repositories {
		if candidate == nil || candidate.GitHubInstallationID == 0 {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(candidate.GitHubOwner), strings.TrimSpace(repository.GitHubOwner)) &&
			strings.EqualFold(strings.TrimSpace(candidate.GitHubRepo), strings.TrimSpace(repository.GitHubRepo)) {
			repository.GitHubInstallationID = candidate.GitHubInstallationID
			return true, nil
		}
	}
	return false, nil
}

func sameGitHubRepositoryAccess(existing, next *domain.Repository) bool {
	if existing == nil || next == nil {
		return false
	}
	return existing.GitHubInstallationID == next.GitHubInstallationID &&
		strings.EqualFold(strings.TrimSpace(existing.GitHubOwner), strings.TrimSpace(next.GitHubOwner)) &&
		strings.EqualFold(strings.TrimSpace(existing.GitHubRepo), strings.TrimSpace(next.GitHubRepo))
}

func githubRepositoryID(owner, repo string) string {
	return fmt.Sprintf("github_%s__%s", strings.TrimSpace(owner), strings.TrimSpace(repo))
}

func (s *service) GetRepository(ctx context.Context, repositoryID string) (*domain.Repository, error) {
	if strings.TrimSpace(repositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(repositoryID))
}

func (s *service) ListRepositories(ctx context.Context, workspaceID string) ([]*domain.Repository, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.ListRepositoriesByWorkspaceID(ctx, workspaceID)
}

func (s *service) CheckRepositoryReadiness(ctx context.Context, repositoryID string) (*GitHubRepositoryReadinessResponse, error) {
	repositoryID = strings.TrimSpace(repositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, repositoryID)
	if err != nil {
		return nil, err
	}

	checks := []GitHubReadinessCheck{
		readinessOK(
			"repository",
			"仓库已绑定到当前项目",
			strings.TrimSpace(repository.GitHubOwner)+"/"+strings.TrimSpace(repository.GitHubRepo),
			true,
		),
	}

	settings, err := s.settingsForRepository(ctx, repository)
	if err != nil {
		checks = append(checks, readinessError("settings", "读取 GitHub 设置失败", err.Error(), true))
	} else if !settings.Enabled {
		checks = append(checks, readinessError("settings", "GitHub 功能已关闭", "请在 GitHub 设置中启用 GitHub 功能。", true))
	} else {
		checks = append(checks, readinessOK("settings", "GitHub 功能已启用", "", true))
	}

	if repositoryUsesOAuth(repository) {
		checks = append(checks, s.oauthRepositoryReadinessChecks(ctx, repository)...)
	} else {
		var installation *domain.GitHubInstallation
		if repository.GitHubInstallationID == 0 {
			checks = append(checks, readinessError("installation", "仓库没有关联 GitHub App 安装记录", "请先连接 GitHub 账号并刷新仓库，或使用兼容的 GitHub App 安装记录。", true))
		} else {
			installation, err = s.repo.FindInstallationByID(ctx, repository.GitHubInstallationID)
			if err != nil {
				checks = append(checks, readinessError("installation", "找不到 GitHub App 安装记录", err.Error(), true))
			} else {
				checks = append(checks, readinessOK("installation", "GitHub App 安装记录已同步", installation.AccountLogin, true))
				checks = append(checks, permissionReadinessChecks(installation.Permissions)...)
			}
		}

		if installation != nil {
			token, err := s.tokenProvider.InstallationToken(ctx, installation.InstallationID)
			if err != nil {
				checks = append(checks, readinessError("installation_token", "GitHub App 令牌交换失败", userFacingGitHubError(err), true))
			} else if token == nil || strings.TrimSpace(token.Token) == "" {
				checks = append(checks, readinessError("installation_token", "GitHub App 令牌为空", "请检查 GITHUB_APP_ID 和 GITHUB_APP_PRIVATE_KEY 是否对应当前安装。", true))
			} else {
				checks = append(checks, readinessOK("installation_token", "GitHub App 令牌可用", "", true))
			}
		}
	}

	return &GitHubRepositoryReadinessResponse{
		RepositoryID: repository.RepositoryID,
		WorkspaceID:  repository.WorkspaceID,
		GitHubOwner:  repository.GitHubOwner,
		GitHubRepo:   repository.GitHubRepo,
		Ready:        readinessIsReady(checks),
		Checks:       checks,
	}, nil
}

func (s *service) GetSettings(ctx context.Context, workspaceID string) (*domain.GitHubSettings, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil, domain.ErrInvalidInput
	}
	settings, err := s.repo.FindSettingsByWorkspaceID(ctx, workspaceID)
	if err == nil {
		return settings, nil
	}
	if errors.Is(err, domain.ErrNotFound) {
		return defaultGitHubSettings(workspaceID), nil
	}
	return nil, err
}

func (s *service) UpsertSettings(ctx context.Context, userID uint, req *UpsertSettingsRequest) (*domain.GitHubSettings, error) {
	if userID == 0 || req == nil || strings.TrimSpace(req.WorkspaceID) == "" {
		return nil, domain.ErrInvalidInput
	}
	settings, err := s.GetSettings(ctx, req.WorkspaceID)
	if err != nil {
		return nil, err
	}
	settings.Enabled = boolValue(req.Enabled, settings.Enabled)
	settings.PullRequestSidebar = boolValue(req.PullRequestSidebar, settings.PullRequestSidebar)
	settings.CoAuthoredByTrailer = boolValue(req.CoAuthoredByTrailer, settings.CoAuthoredByTrailer)
	settings.IssuePRAutoLink = boolValue(req.IssuePRAutoLink, settings.IssuePRAutoLink)
	settings.UpdatedBy = userID
	if err := s.repo.UpsertSettings(ctx, settings); err != nil {
		return nil, fmt.Errorf("upsert github settings: %w", err)
	}
	return settings, nil
}

func (s *service) CreateIssue(ctx context.Context, req *CreateIssueRequest) (*GitHubIssueResponse, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || strings.TrimSpace(req.Title) == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	settings, err := s.settingsForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if !settings.Enabled {
		return nil, domain.ErrInvalidInput
	}
	if !repositoryUsesOAuth(repository) {
		installation, err := s.repo.FindInstallationByID(ctx, repository.GitHubInstallationID)
		if err != nil {
			return nil, err
		}
		if !permissionAllows(installation.Permissions, "issues", "write") {
			return nil, fmt.Errorf("github integration: GitHub App requires issues:write permission to create issues")
		}
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	issue, err := client.CreateIssue(ctx, CreateIssueInput{
		Owner:  repository.GitHubOwner,
		Repo:   repository.GitHubRepo,
		Title:  strings.TrimSpace(req.Title),
		Body:   strings.TrimSpace(req.Body),
		Labels: compactStrings(req.Labels),
	})
	if err != nil {
		return nil, err
	}
	if issue == nil || issue.Number == 0 || strings.TrimSpace(issue.HTMLURL) == "" {
		return nil, fmt.Errorf("github integration: issue response missing number or URL")
	}
	return &GitHubIssueResponse{
		RepositoryID: repository.RepositoryID,
		Number:       issue.Number,
		HTMLURL:      issue.HTMLURL,
		State:        issue.State,
		Title:        issue.Title,
	}, nil
}

func (s *service) ListRepositoryTree(ctx context.Context, req *ListRepositoryTreeRequest) (*RepositoryTreeSnapshot, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		ref = repository.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	tree, err := client.ListRepositoryTree(ctx, repository.GitHubOwner, repository.GitHubRepo, ref, req.Recursive)
	if err != nil {
		return nil, err
	}
	if tree == nil {
		return nil, fmt.Errorf("github integration: repository tree response is required")
	}
	paths := make([]string, 0, len(tree.Tree))
	for _, entry := range tree.Tree {
		path := strings.TrimSpace(entry.Path)
		if path == "" {
			continue
		}
		paths = append(paths, path)
	}
	return &RepositoryTreeSnapshot{
		RepositoryID: repository.RepositoryID,
		Ref:          ref,
		Truncated:    tree.Truncated,
		Paths:        paths,
	}, nil
}

func (s *service) ReadRepositoryFile(ctx context.Context, req *ReadRepositoryFileRequest) (*RepositoryFileSnapshot, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || strings.TrimSpace(req.Path) == "" {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	ref := strings.TrimSpace(req.Ref)
	if ref == "" {
		ref = repository.DefaultBranch
	}
	if ref == "" {
		ref = "main"
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	file, err := client.GetRepositoryFile(ctx, repository.GitHubOwner, repository.GitHubRepo, req.Path, ref)
	if err != nil {
		return nil, err
	}
	if file == nil {
		return nil, fmt.Errorf("github integration: repository file response is required")
	}
	content := file.DecodedContent
	if content == "" && !strings.EqualFold(file.Encoding, "base64") {
		content = file.Content
	}
	return &RepositoryFileSnapshot{
		RepositoryID: repository.RepositoryID,
		Ref:          ref,
		Path:         file.Path,
		SHA:          file.SHA,
		Content:      content,
	}, nil
}

func (s *service) PreparePRNodeBranch(ctx context.Context, req *PreparePRNodeBranchRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	settings, err := s.settingsForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if !settings.Enabled {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if err := validatePRNodeTargetRepository(repository.RepositoryID, node); err != nil {
		return nil, err
	}
	if strings.TrimSpace(node.BranchName) == "" {
		return nil, domain.ErrInvalidInput
	}
	baseBranch, err := s.resolvePRNodeBaseBranch(ctx, repository, node, req.BaseBranch)
	if err != nil {
		return nil, err
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	baseRef, err := client.GetBranchRef(ctx, repository.GitHubOwner, repository.GitHubRepo, baseBranch)
	if err != nil {
		return nil, err
	}
	if baseRef == nil || strings.TrimSpace(baseRef.Object.SHA) == "" {
		return nil, fmt.Errorf("github integration: base branch response missing sha")
	}
	if _, err := client.CreateBranch(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName, baseRef.Object.SHA); err != nil {
		if !isBranchAlreadyExistsError(err) {
			return nil, err
		}
	}
	return node, nil
}

func (s *service) DeliverPRNode(ctx context.Context, req *DeliverPRNodeRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	settings, err := s.settingsForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if !settings.Enabled {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if err := validatePRNodeTargetRepository(repository.RepositoryID, node); err != nil {
		return nil, err
	}
	if strings.TrimSpace(node.BranchName) == "" {
		return nil, domain.ErrInvalidInput
	}
	baseBranch, err := s.resolvePRNodeBaseBranch(ctx, repository, node, req.BaseBranch)
	if err != nil {
		return nil, err
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = node.Title
	}
	draft := true
	if req.Draft != nil {
		draft = *req.Draft
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("github integration: repository client is required")
	}
	pr, err := client.CreatePullRequest(ctx, CreatePullRequestInput{
		Owner: repository.GitHubOwner,
		Repo:  repository.GitHubRepo,
		Title: title,
		Head:  node.BranchName,
		Base:  baseBranch,
		Body:  prDescription(node, strings.TrimSpace(req.Body), settings),
		Draft: draft,
	})
	if err != nil {
		return nil, err
	}
	if pr == nil || pr.Number == 0 || strings.TrimSpace(pr.HTMLURL) == "" {
		return nil, fmt.Errorf("github integration: pull request response missing number or URL")
	}
	node.GitHubPRNumber = &pr.Number
	node.GitHubPRURL = pr.HTMLURL
	if strings.TrimSpace(pr.Head.SHA) != "" {
		node.GitHubHeadSHA = strings.TrimSpace(pr.Head.SHA)
	}
	node.Status = domain.PRNodeStatusPROpened
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) MergePRNode(ctx context.Context, req *MergePRNodeRequest) (*MergePRNodeResponse, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 || strings.TrimSpace(req.ExpectedHeadSHA) == "" {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	settings, err := s.settingsForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if !settings.Enabled {
		return nil, domain.ErrInvalidInput
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if err := validatePRNodeTargetRepository(repository.RepositoryID, node); err != nil {
		return nil, err
	}
	if node.GitHubPRNumber == nil || *node.GitHubPRNumber == 0 || strings.TrimSpace(node.GitHubPRURL) == "" {
		return nil, domain.ErrConflict
	}
	currentHeadSHA := strings.TrimSpace(node.GitHubHeadSHA)
	expectedHeadSHA := strings.TrimSpace(req.ExpectedHeadSHA)
	if currentHeadSHA == "" || currentHeadSHA != expectedHeadSHA {
		return nil, fmt.Errorf("github integration: pull request head SHA changed before merge: %w", domain.ErrConflict)
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("github integration: repository client is required")
	}
	result, err := client.MergePullRequest(ctx, MergePullRequestInput{
		Owner:         repository.GitHubOwner,
		Repo:          repository.GitHubRepo,
		Number:        *node.GitHubPRNumber,
		SHA:           expectedHeadSHA,
		MergeMethod:   strings.TrimSpace(req.MergeMethod),
		CommitTitle:   strings.TrimSpace(req.CommitTitle),
		CommitMessage: strings.TrimSpace(req.CommitMessage),
	})
	if err != nil {
		return nil, err
	}
	if result == nil || !result.Merged {
		message := "GitHub did not accept the merge request."
		if result != nil && strings.TrimSpace(result.Message) != "" {
			message = strings.TrimSpace(result.Message)
		}
		return nil, fmt.Errorf("github integration: %s: %w", message, domain.ErrConflict)
	}
	node.Status = domain.PRNodeStatusMerged
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
		return nil, err
	}
	return &MergePRNodeResponse{
		PRNode:  node,
		Merged:  result.Merged,
		Message: strings.TrimSpace(result.Message),
		SHA:     strings.TrimSpace(result.SHA),
	}, nil
}

func (s *service) RefreshPRNodeCI(ctx context.Context, req *RefreshPRNodeCIRequest) (*domain.SpecForgePRNode, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if err := validatePRNodeTargetRepository(repository.RepositoryID, node); err != nil {
		return nil, err
	}
	if strings.TrimSpace(node.BranchName) == "" {
		return nil, domain.ErrInvalidInput
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	runs, err := client.ListWorkflowRuns(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName)
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return node, nil
	}
	latest := latestWorkflowRun(runs)
	applyWorkflowRunState(node, latest.HeadSHA, latest.Status, latest.Conclusion)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
		return nil, err
	}
	if err := s.publishPRNodeCIFailedFromWorkflowRun(ctx, repository, node, latest); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) ReadPRNodeFailureLog(ctx context.Context, req *ReadPRNodeFailureLogRequest) (*PRNodeFailureLog, error) {
	if req == nil || strings.TrimSpace(req.RepositoryID) == "" || req.PRNodeID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if s.planningRepo == nil {
		return nil, domain.ErrInvalidInput
	}
	repository, err := s.repo.FindRepositoryByRepositoryID(ctx, strings.TrimSpace(req.RepositoryID))
	if err != nil {
		return nil, err
	}
	node, err := s.planningRepo.FindPRNodeByID(ctx, req.PRNodeID)
	if err != nil {
		return nil, err
	}
	if err := validatePRNodeTargetRepository(repository.RepositoryID, node); err != nil {
		return nil, err
	}
	if strings.TrimSpace(node.BranchName) == "" {
		return nil, domain.ErrInvalidInput
	}
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		return nil, err
	}
	runs, err := client.ListWorkflowRuns(ctx, repository.GitHubOwner, repository.GitHubRepo, node.BranchName)
	if err != nil {
		return nil, err
	}
	if len(runs) == 0 {
		return nil, domain.ErrNotFound
	}
	latest := latestWorkflowRun(runs)
	jobs, err := client.ListWorkflowJobs(ctx, repository.GitHubOwner, repository.GitHubRepo, latest.ID)
	if err != nil {
		return nil, err
	}
	job := firstFailedWorkflowJob(jobs)
	if job == nil {
		return nil, domain.ErrNotFound
	}
	logs, err := client.GetWorkflowJobLogs(ctx, repository.GitHubOwner, repository.GitHubRepo, job.ID)
	if err != nil {
		return nil, err
	}
	return &PRNodeFailureLog{
		PRNodeID:      node.ID,
		WorkflowRunID: latest.ID,
		JobID:         job.ID,
		JobName:       job.Name,
		HeadSHA:       latest.HeadSHA,
		LogExcerpt:    trimLogExcerpt(logs, 20000),
		FailedSteps:   failedStepNames(job.Steps),
	}, nil
}

func (s *service) repositoryClientForRepository(ctx context.Context, repository *domain.Repository) (RepositoryClient, error) {
	if repositoryUsesOAuth(repository) {
		token, err := s.oauthTokenForRepository(ctx, repository)
		if err == nil && strings.TrimSpace(token) != "" {
			client, err := s.clientFactory.NewRepositoryClient(strings.TrimSpace(token))
			if err != nil {
				return nil, err
			}
			if client == nil {
				return nil, fmt.Errorf("github integration: repository client is required")
			}
			return client, nil
		}
		if repository.GitHubInstallationID == 0 {
			if err != nil {
				return nil, err
			}
			return nil, fmt.Errorf("github integration: oauth token is required")
		}
	}
	installation, err := s.repo.FindInstallationByID(ctx, repository.GitHubInstallationID)
	if err != nil {
		return nil, err
	}
	token, err := s.tokenProvider.InstallationToken(ctx, installation.InstallationID)
	if err != nil {
		return nil, err
	}
	if token == nil || strings.TrimSpace(token.Token) == "" {
		return nil, fmt.Errorf("github integration: installation token is required")
	}
	client, err := s.clientFactory.NewRepositoryClient(strings.TrimSpace(token.Token))
	if err != nil {
		return nil, err
	}
	if client == nil {
		return nil, fmt.Errorf("github integration: repository client is required")
	}
	return client, nil
}

func (s *service) validateRepositoryAccess(ctx context.Context, repository *domain.Repository) error {
	client, err := s.repositoryClientForRepository(ctx, repository)
	if err != nil {
		if errors.Is(err, errGitHubAppConfigMissing) {
			return nil
		}
		return err
	}
	branch := strings.TrimSpace(repository.DefaultBranch)
	if branch == "" {
		branch = "main"
	}
	ref, err := client.GetBranchRef(ctx, repository.GitHubOwner, repository.GitHubRepo, branch)
	if err != nil {
		return fmt.Errorf("github integration: validate repository access: %w", err)
	}
	if ref == nil || strings.TrimSpace(ref.Object.SHA) == "" {
		return fmt.Errorf("github integration: validate repository access: default branch response missing sha")
	}
	return nil
}

func (s *service) settingsForRepository(ctx context.Context, repository *domain.Repository) (*domain.GitHubSettings, error) {
	workspaceID := "default"
	if repository != nil && strings.TrimSpace(repository.WorkspaceID) != "" {
		workspaceID = strings.TrimSpace(repository.WorkspaceID)
	}
	return s.GetSettings(ctx, workspaceID)
}

func (s *service) oauthTokenForRepository(ctx context.Context, repository *domain.Repository) (string, error) {
	if repository == nil || strings.TrimSpace(repository.WorkspaceID) == "" {
		return "", domain.ErrInvalidInput
	}
	store, err := s.oauthStore()
	if err != nil {
		return "", err
	}
	connection, err := store.FindAccountConnectionByWorkspaceID(ctx, repository.WorkspaceID)
	if err != nil {
		return "", err
	}
	if connection.TokenStatus != domain.GitHubConnectionStatusConnected {
		return "", fmt.Errorf("%w: github connection is %s", domain.ErrInvalidInput, connection.TokenStatus)
	}
	token, err := decryptGitHubToken(connection.AccessTokenEncrypted)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(token) == "" {
		return "", fmt.Errorf("github integration: oauth token is required")
	}
	return token, nil
}

func (s *service) oauthRepositoryReadinessChecks(ctx context.Context, repository *domain.Repository) []GitHubReadinessCheck {
	checks := []GitHubReadinessCheck{}
	store, err := s.oauthStore()
	if err != nil {
		return append(checks, readinessError("connection", "GitHub OAuth 存储不可用", err.Error(), true))
	}
	connection, err := store.FindAccountConnectionByWorkspaceID(ctx, repository.WorkspaceID)
	if err != nil {
		return append(checks, readinessError("connection", "未连接 GitHub 账号", "请在工作区设置中连接 GitHub 账号并刷新仓库。", true))
	}
	if connection.TokenStatus != domain.GitHubConnectionStatusConnected {
		checks = append(checks, readinessError("connection", "GitHub 账号连接不可用", "当前状态："+connection.TokenStatus+"。请重新连接 GitHub。", true))
	} else {
		checks = append(checks, readinessOK("connection", "GitHub 账号已连接", connection.GitHubLogin, true))
	}
	if repository.GitHubRepositoryAccessID > 0 {
		access, err := store.FindRepositoryAccessByID(ctx, repository.GitHubRepositoryAccessID)
		if err != nil {
			checks = append(checks, readinessError("repository_access", "找不到 OAuth 仓库访问记录", err.Error(), true))
		} else {
			readAllowed := access.Permissions["pull"] || access.Permissions["push"] || access.Permissions["maintain"] || access.Permissions["admin"]
			writeAllowed := access.Permissions["push"] || access.Permissions["maintain"] || access.Permissions["admin"]
			if readAllowed {
				checks = append(checks, readinessOK("repository_read", "仓库读取权限可用", access.FullName, true))
			} else {
				checks = append(checks, readinessError("repository_read", "仓库读取权限不足", "请确认 OAuth 授权仍可读取该仓库。", true))
			}
			if writeAllowed {
				checks = append(checks, readinessOK("repository_write", "仓库写入权限可用", access.FullName, true))
			} else {
				checks = append(checks, readinessError("repository_write", "仓库写入权限不足", "主仓库需要写入权限才能创建分支和 PR。", true))
			}
		}
	} else {
		checks = append(checks, readinessError("repository_access", "仓库没有 OAuth 访问记录", "请刷新 GitHub 仓库后重新绑定。", true))
	}
	token, err := s.oauthTokenForRepository(ctx, repository)
	if err != nil {
		return append(checks, readinessError("oauth_token", "GitHub OAuth 令牌不可用", userFacingGitHubError(err), true))
	}
	checks = append(checks, readinessOK("oauth_token", "GitHub OAuth 令牌可用", "", true))
	client, err := s.clientFactory.NewRepositoryClient(token)
	if err != nil {
		return append(checks, readinessError("repository_client", "GitHub 仓库客户端初始化失败", err.Error(), true))
	}
	branch := resolveBaseBranch(repository, "")
	ref, err := client.GetBranchRef(ctx, repository.GitHubOwner, repository.GitHubRepo, branch)
	if err != nil {
		return append(checks, readinessError("repository_ref", "无法读取默认分支", userFacingGitHubError(err), true))
	}
	if ref == nil || strings.TrimSpace(ref.Object.SHA) == "" {
		return append(checks, readinessError("repository_ref", "默认分支响应缺少 SHA", branch, true))
	}
	return append(checks, readinessOK("repository_ref", "默认分支可读取", branch, true))
}

func (s *service) RecordWebhook(ctx context.Context, req *GitHubWebhookRequest) (*domain.GitHubWebhookEvent, error) {
	if req == nil || strings.TrimSpace(req.EventType) == "" || strings.TrimSpace(req.DeliveryID) == "" || len(req.Body) == 0 {
		return nil, domain.ErrInvalidInput
	}
	existing, err := s.repo.FindWebhookEventByDeliveryID(ctx, strings.TrimSpace(req.DeliveryID))
	if err == nil {
		return existing, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	metadata := parseWebhookMetadata(req.Body)
	event := &domain.GitHubWebhookEvent{
		DeliveryID:         strings.TrimSpace(req.DeliveryID),
		EventType:          strings.TrimSpace(req.EventType),
		Action:             metadata.Action,
		InstallationID:     metadata.InstallationID,
		RepositoryFullName: metadata.RepositoryFullName,
		Payload:            string(req.Body),
		Signature:          strings.TrimSpace(req.Signature),
		Status:             GitHubWebhookStatusReceived,
		ReceivedAt:         time.Now(),
	}
	if err := s.repo.CreateWebhookEvent(ctx, event); err != nil {
		return nil, fmt.Errorf("record github webhook: %w", err)
	}
	if err := s.applyWebhookToPRNode(ctx, event.EventType, req.Body); err != nil {
		if updateErr := s.repo.UpdateWebhookEventStatus(ctx, event.DeliveryID, GitHubWebhookStatusFailed); updateErr != nil {
			return nil, fmt.Errorf("mark github webhook failed: %w", updateErr)
		}
		event.Status = GitHubWebhookStatusFailed
		return nil, err
	}
	if err := s.repo.UpdateWebhookEventStatus(ctx, event.DeliveryID, GitHubWebhookStatusProcessed); err != nil {
		return nil, fmt.Errorf("mark github webhook processed: %w", err)
	}
	event.Status = GitHubWebhookStatusProcessed
	return event, nil
}

func (s *service) ListWebhookEvents(ctx context.Context, req *ListWebhookEventsRequest) ([]*domain.GitHubWebhookEvent, error) {
	if req == nil {
		req = &ListWebhookEventsRequest{}
	}
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	return s.repo.ListWebhookEvents(ctx, strings.TrimSpace(req.Status), strings.TrimSpace(req.RepositoryFullName), limit)
}

func prDescription(node *domain.SpecForgePRNode, body string, settings *domain.GitHubSettings) string {
	if body != "" {
		return applyGitHubSettingsToPRDescription(body, node, settings)
	}
	description := fmt.Sprintf("## Summary\n\n%s\n\n## Linked Spec\n\nPR Node: %s\n\n## Scope\n\n%s\n\n## Non-goals\n\n%s\n\n## Acceptance Criteria\n\n%s\n\n## Test Plan\n\n%s\n\n## Risks\n\n- Estimated risk: %s\n\n## Dependencies\n\n%s\n\nGenerated by CodingCTO.\n",
		defaultText(strings.TrimSpace(node.Goal), "No summary provided."),
		defaultText(strings.TrimSpace(node.NodeKey), "Unassigned"),
		formatMarkdownList(node.ExpectedFiles),
		formatMarkdownList(node.NonGoals),
		formatMarkdownList(node.AcceptanceCriteria),
		formatMarkdownChecklist(node.TestCommands),
		defaultText(strings.TrimSpace(node.EstimatedRisk), "unknown"),
		formatDependencies(node.DependsOn),
	)
	return applyGitHubSettingsToPRDescription(description, node, settings)
}

func applyGitHubSettingsToPRDescription(body string, node *domain.SpecForgePRNode, settings *domain.GitHubSettings) string {
	body = strings.TrimSpace(body)
	if settings == nil {
		return body
	}
	extras := []string{}
	if settings.IssuePRAutoLink && node != nil && strings.TrimSpace(node.NodeKey) != "" {
		extras = append(extras, fmt.Sprintf("CodingCTO issue key: %s", strings.TrimSpace(node.NodeKey)))
	}
	if settings.CoAuthoredByTrailer {
		extras = append(extras, "Co-authored-by: codingcto-agent <github@codingcto.local>")
	}
	if len(extras) == 0 {
		return body
	}
	return strings.TrimSpace(body) + "\n\n" + strings.Join(extras, "\n") + "\n"
}

func defaultGitHubSettings(workspaceID string) *domain.GitHubSettings {
	return &domain.GitHubSettings{
		WorkspaceID:         strings.TrimSpace(workspaceID),
		Enabled:             true,
		PullRequestSidebar:  true,
		CoAuthoredByTrailer: true,
		IssuePRAutoLink:     true,
	}
}

func boolValue(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

func splitRepositoryFullName(fullName string) (string, string) {
	parts := strings.SplitN(strings.TrimSpace(fullName), "/", 2)
	if len(parts) != 2 {
		return "", ""
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
}

func defaultText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func summarizeConnection(connection *domain.GitHubAccountConnection) *GitHubConnectionSummary {
	if connection == nil {
		return nil
	}
	return &GitHubConnectionSummary{
		ID:              connection.ID,
		WorkspaceID:     connection.WorkspaceID,
		GitHubUserID:    connection.GitHubUserID,
		GitHubLogin:     connection.GitHubLogin,
		GitHubName:      connection.GitHubName,
		GitHubAvatarURL: connection.GitHubAvatarURL,
		ScopeString:     connection.ScopeString,
		TokenStatus:     connection.TokenStatus,
		LastVerifiedAt:  optionalTimeString(connection.LastVerifiedAt),
		LastSyncedAt:    optionalTimeString(connection.LastSyncedAt),
	}
}

func optionalTimeString(value *time.Time) *string {
	if value == nil {
		return nil
	}
	formatted := value.UTC().Format(time.RFC3339)
	return &formatted
}

func repositoryVisibility(private bool) string {
	if private {
		return "private"
	}
	return "public"
}

func repositoryUsesOAuth(repository *domain.Repository) bool {
	if repository == nil {
		return false
	}
	return repository.AccessSource == domain.RepositoryAccessSourceOAuthUser ||
		repository.GitHubConnectionID > 0 ||
		repository.GitHubRepositoryAccessID > 0
}

func compactStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" {
			out = append(out, value)
		}
	}
	return out
}

func resolveBaseBranch(repository *domain.Repository, override string) string {
	baseBranch := strings.TrimSpace(override)
	if baseBranch == "" && repository != nil {
		baseBranch = strings.TrimSpace(repository.DefaultBranch)
	}
	if baseBranch == "" {
		baseBranch = "main"
	}
	return baseBranch
}

func (s *service) resolvePRNodeBaseBranch(ctx context.Context, repository *domain.Repository, node *domain.SpecForgePRNode, override string) (string, error) {
	if strings.TrimSpace(override) != "" || node == nil || len(node.DependsOn) == 0 {
		return resolveBaseBranch(repository, override), nil
	}
	if node.PlanID == 0 {
		return resolveBaseBranch(repository, ""), nil
	}
	bundle, err := s.planningRepo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if err != nil {
		return "", err
	}
	dependencyKeys := make(map[string]struct{}, len(node.DependsOn))
	for _, dependency := range node.DependsOn {
		dependency = strings.TrimSpace(dependency)
		if dependency != "" {
			dependencyKeys[dependency] = struct{}{}
		}
	}
	var baseNode *domain.SpecForgePRNode
	for _, candidate := range bundle.PRNodes {
		if candidate == nil {
			continue
		}
		if _, ok := dependencyKeys[strings.TrimSpace(candidate.NodeKey)]; !ok {
			continue
		}
		if strings.TrimSpace(candidate.BranchName) == "" {
			return "", domain.ErrInvalidInput
		}
		if baseNode == nil || candidate.Order > baseNode.Order {
			baseNode = candidate
		}
	}
	if baseNode == nil {
		return "", domain.ErrInvalidInput
	}
	return strings.TrimSpace(baseNode.BranchName), nil
}

func isBranchAlreadyExistsError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "reference already exists")
}

func latestWorkflowRun(runs []WorkflowRun) WorkflowRun {
	latest := runs[0]
	for _, run := range runs[1:] {
		if run.CreatedAt.After(latest.CreatedAt) {
			latest = run
		}
	}
	return latest
}

func firstFailedWorkflowJob(jobs []WorkflowJob) *WorkflowJob {
	for i := range jobs {
		conclusion := strings.TrimSpace(jobs[i].Conclusion)
		if conclusion != "" && conclusion != "success" {
			return &jobs[i]
		}
	}
	return nil
}

func failedStepNames(steps []WorkflowStep) []string {
	out := []string{}
	for _, step := range steps {
		conclusion := strings.TrimSpace(step.Conclusion)
		if conclusion == "" || conclusion == "success" {
			continue
		}
		name := strings.TrimSpace(step.Name)
		if name != "" {
			out = append(out, name)
		}
	}
	return out
}

func trimLogExcerpt(logs string, limit int) string {
	logs = strings.TrimSpace(logs)
	if limit <= 0 || len(logs) <= limit {
		return logs
	}
	return logs[len(logs)-limit:]
}

func applyWorkflowRunState(node *domain.SpecForgePRNode, headSHA, status, conclusion string) {
	if strings.TrimSpace(headSHA) != "" {
		node.GitHubHeadSHA = strings.TrimSpace(headSHA)
	}
	if strings.TrimSpace(status) != "completed" {
		node.Status = domain.PRNodeStatusCIRunning
	} else if strings.TrimSpace(conclusion) == "success" {
		node.Status = domain.PRNodeStatusReadyForReview
	} else if strings.TrimSpace(conclusion) != "" {
		node.Status = domain.PRNodeStatusBlocked
	}
}

func formatMarkdownList(items []string) string {
	if len(items) == 0 {
		return "- None declared"
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		lines = append(lines, "- "+item)
	}
	if len(lines) == 0 {
		return "- None declared"
	}
	return strings.Join(lines, "\n")
}

func formatDependencies(items []string) string {
	if len(items) == 0 {
		return "- None"
	}
	return formatMarkdownList(items)
}

func formatMarkdownChecklist(items []string) string {
	if len(items) == 0 {
		return "- [ ] Not run yet"
	}
	lines := make([]string, 0, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		lines = append(lines, "- [ ] "+item)
	}
	if len(lines) == 0 {
		return "- [ ] Not run yet"
	}
	return strings.Join(lines, "\n")
}

func (s *service) applyWebhookToPRNode(ctx context.Context, eventType string, body []byte) error {
	if s.planningRepo == nil {
		return nil
	}
	event, err := ParseGitHubWebhookPayload(eventType, body)
	if err != nil {
		return nil
	}
	switch {
	case event.PullRequest != nil:
		node, err := s.updatePRNodeFromPullRequestWebhook(ctx, event)
		if err != nil {
			return err
		}
		if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
			return err
		}
		if err := s.publishPRNodeClosed(ctx, node); err != nil {
			return err
		}
		return s.publishReviewFeedback(ctx, event, node)
	case event.WorkflowRun != nil:
		node, err := s.updatePRNodeFromWorkflowRun(ctx, event.WorkflowRun)
		if err != nil {
			return err
		}
		if err := s.publishPRNodeDependencySatisfied(ctx, node); err != nil {
			return err
		}
		return s.publishPRNodeCIFailed(ctx, event, node)
	default:
		return nil
	}
}

func (s *service) updatePRNodeFromPullRequestWebhook(ctx context.Context, event *StructuredGitHubWebhook) (*domain.SpecForgePRNode, error) {
	if event == nil {
		return nil, nil
	}
	if event.EventType == GitHubWebhookEventPullRequest {
		return s.updatePRNodeFromPullRequest(ctx, event.PullRequest)
	}
	return s.touchPRNodeFromFeedbackPullRequest(ctx, event)
}

func (s *service) updatePRNodeFromPullRequest(ctx context.Context, pr *WebhookPullRequest) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(pr.HeadBranch) == "" && pr.Number <= 0 {
		return nil, nil
	}
	node, err := s.findPRNodeForWebhookPullRequest(ctx, pr)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	node.GitHubPRNumber = &pr.Number
	node.GitHubPRURL = pr.HTMLURL
	node.GitHubHeadSHA = pr.HeadSHA
	node.Status = prNodeStatusFromPullRequest(pr)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) touchPRNodeFromFeedbackPullRequest(ctx context.Context, event *StructuredGitHubWebhook) (*domain.SpecForgePRNode, error) {
	if event == nil {
		return nil, nil
	}
	pr := event.PullRequest
	if strings.TrimSpace(pr.HeadBranch) == "" && pr.Number <= 0 {
		return nil, nil
	}
	node, err := s.findPRNodeForWebhookPullRequest(ctx, pr)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	changed := false
	if pr.Number > 0 && node.GitHubPRNumber == nil {
		node.GitHubPRNumber = &pr.Number
		changed = true
	}
	if strings.TrimSpace(pr.HTMLURL) != "" && strings.TrimSpace(node.GitHubPRURL) == "" {
		node.GitHubPRURL = pr.HTMLURL
		changed = true
	}
	if strings.TrimSpace(pr.HeadSHA) != "" && strings.TrimSpace(node.GitHubHeadSHA) == "" {
		node.GitHubHeadSHA = pr.HeadSHA
		changed = true
	}
	if event.EventType == GitHubWebhookEventPullRequestReview && strings.TrimSpace(event.ReviewState) == "changes_requested" {
		switch node.Status {
		case domain.PRNodeStatusMerged, domain.PRNodeStatusClosed:
		default:
			if node.Status != domain.PRNodeStatusBlocked {
				node.Status = domain.PRNodeStatusBlocked
				changed = true
			}
		}
	}
	if changed {
		if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
			return nil, err
		}
	}
	return node, nil
}

func prNodeStatusFromPullRequest(pr *WebhookPullRequest) string {
	if pr == nil {
		return domain.PRNodeStatusPROpened
	}
	if pr.Merged {
		return domain.PRNodeStatusMerged
	}
	if strings.TrimSpace(pr.State) == "closed" {
		return domain.PRNodeStatusClosed
	}
	return domain.PRNodeStatusPROpened
}

func (s *service) findPRNodeForWebhookPullRequest(ctx context.Context, pr *WebhookPullRequest) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(pr.HeadBranch) != "" {
		node, err := s.planningRepo.FindPRNodeByBranchName(ctx, pr.HeadBranch)
		if err == nil || !errors.Is(err, domain.ErrNotFound) || pr.Number <= 0 {
			return node, err
		}
	}
	return s.planningRepo.FindPRNodeByGitHubPRNumber(ctx, pr.Number)
}

func (s *service) publishReviewFeedback(ctx context.Context, event *StructuredGitHubWebhook, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || event == nil || node == nil || event.ReviewComment == nil {
		return nil
	}
	comment := event.ReviewComment
	if strings.TrimSpace(comment.Body) == "" || comment.PullRequestNumber <= 0 {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgeReviewFeedbackReceivedEvent(
		node.ID,
		comment.PullRequestNumber,
		event.RepositoryFullName,
		comment.Body,
		comment.AuthorLogin,
		comment.HTMLURL,
		comment.Path,
		comment.CommitSHA,
	))
}

func (s *service) publishPRNodeDependencySatisfied(ctx context.Context, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || node == nil {
		return nil
	}
	switch node.Status {
	case domain.PRNodeStatusPROpened, domain.PRNodeStatusReadyForReview, domain.PRNodeStatusMerged:
		return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeDependencySatisfiedEvent(node))
	default:
		return nil
	}
}

func (s *service) publishPRNodeClosed(ctx context.Context, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || node == nil || node.Status != domain.PRNodeStatusClosed {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeClosedEvent(node))
}

func (s *service) updatePRNodeFromWorkflowRun(ctx context.Context, run *WebhookWorkflowRun) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(run.HeadBranch) == "" && len(run.PullRequestNumbers) == 0 {
		return nil, nil
	}
	node, err := s.findPRNodeForWorkflowRun(ctx, run)
	if errors.Is(err, domain.ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	applyWorkflowRunState(node, run.HeadSHA, run.Status, run.Conclusion)
	if err := s.planningRepo.UpdatePRNode(ctx, node); err != nil {
		return nil, err
	}
	return node, nil
}

func (s *service) findPRNodeForWorkflowRun(ctx context.Context, run *WebhookWorkflowRun) (*domain.SpecForgePRNode, error) {
	if strings.TrimSpace(run.HeadBranch) != "" {
		node, err := s.planningRepo.FindPRNodeByBranchName(ctx, run.HeadBranch)
		if err == nil || !errors.Is(err, domain.ErrNotFound) {
			return node, err
		}
	}
	for _, prNumber := range run.PullRequestNumbers {
		if prNumber <= 0 {
			continue
		}
		node, err := s.planningRepo.FindPRNodeByGitHubPRNumber(ctx, prNumber)
		if err == nil || !errors.Is(err, domain.ErrNotFound) {
			return node, err
		}
	}
	return nil, domain.ErrNotFound
}

func (s *service) publishPRNodeCIFailed(ctx context.Context, event *StructuredGitHubWebhook, node *domain.SpecForgePRNode) error {
	if s.eventBus == nil || event == nil || event.WorkflowRun == nil || node == nil {
		return nil
	}
	run := event.WorkflowRun
	if !isUnsuccessfulCompletedWorkflowRun(run.Status, run.Conclusion) {
		return nil
	}
	bundle, err := s.planningRepo.FindPlanBundleByPlanID(ctx, node.PlanID)
	if errors.Is(err, domain.ErrNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	repositoryID := ""
	if bundle != nil && bundle.Idea != nil {
		repositoryID = strings.TrimSpace(bundle.Idea.RepositoryID)
	}
	if repositoryID == "" {
		return nil
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeCIFailedEvent(
		node.ID,
		repositoryID,
		event.RepositoryFullName,
		run.ID,
		run.HTMLURL,
		run.HeadSHA,
		run.Conclusion,
	))
}

func (s *service) publishPRNodeCIFailedFromWorkflowRun(ctx context.Context, repository *domain.Repository, node *domain.SpecForgePRNode, run WorkflowRun) error {
	if s.eventBus == nil || repository == nil || node == nil {
		return nil
	}
	if !isUnsuccessfulCompletedWorkflowRun(run.Status, run.Conclusion) {
		return nil
	}
	repositoryFullName := strings.TrimSpace(repository.GitHubOwner + "/" + repository.GitHubRepo)
	if repositoryFullName == "/" {
		repositoryFullName = ""
	}
	return s.eventBus.Publish(ctx, domain.NewSpecForgePRNodeCIFailedEvent(
		node.ID,
		repository.RepositoryID,
		repositoryFullName,
		run.ID,
		run.HTMLURL,
		run.HeadSHA,
		run.Conclusion,
	))
}

func isUnsuccessfulCompletedWorkflowRun(status, conclusion string) bool {
	status = strings.TrimSpace(status)
	conclusion = strings.TrimSpace(conclusion)
	return status == "completed" && conclusion != "" && conclusion != "success"
}

func validatePRNodeTargetRepository(requestRepositoryID string, node *domain.SpecForgePRNode) error {
	if node == nil {
		return domain.ErrInvalidInput
	}
	targetRepositoryID := strings.TrimSpace(node.RepositoryID)
	if targetRepositoryID == "" {
		return nil
	}
	if targetRepositoryID != strings.TrimSpace(requestRepositoryID) {
		return domain.ErrConflict
	}
	return nil
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

func permissionReadinessChecks(permissions map[string]string) []GitHubReadinessCheck {
	required := []struct {
		key      string
		level    string
		message  string
		missing  string
		required bool
	}{
		{key: "metadata", level: "read", message: "metadata:read 权限可用", missing: "GitHub App 缺少 metadata:read 权限", required: true},
		{key: "contents", level: "write", message: "contents:write 权限可用", missing: "GitHub App 缺少 contents:write 权限", required: true},
		{key: "pull_requests", level: "write", message: "pull_requests:write 权限可用", missing: "GitHub App 缺少 pull_requests:write 权限", required: true},
		{key: "issues", level: "write", message: "issues:write 权限可用", missing: "GitHub App 缺少 issues:write 权限", required: true},
		{key: "actions", level: "read", message: "actions:read 权限可用", missing: "GitHub App 缺少 actions:read 权限，后续 CI 读取可能不可用", required: false},
		{key: "statuses", level: "read", message: "statuses:read 权限可用", missing: "GitHub App 缺少 statuses:read 权限，后续状态检查可能不可用", required: false},
	}
	checks := make([]GitHubReadinessCheck, 0, len(required))
	for _, item := range required {
		actual := strings.TrimSpace(permissions[item.key])
		if permissionAllows(permissions, item.key, item.level) {
			checks = append(checks, readinessOK("permission_"+item.key, item.message, actual, item.required))
			continue
		}
		status := "error"
		if !item.required {
			status = "warning"
		}
		checks = append(checks, GitHubReadinessCheck{
			Key:      "permission_" + item.key,
			Status:   status,
			Message:  item.missing,
			Detail:   fmt.Sprintf("当前权限：%s，需要：%s", defaultText(actual, "none"), item.level),
			Required: item.required,
		})
	}
	return checks
}

func permissionAllows(permissions map[string]string, key string, required string) bool {
	return permissionRank(permissions[strings.TrimSpace(key)]) >= permissionRank(required)
}

func permissionRank(value string) int {
	switch strings.TrimSpace(value) {
	case "admin":
		return 3
	case "write":
		return 2
	case "read":
		return 1
	default:
		return 0
	}
}

func readinessOK(key, message, detail string, required bool) GitHubReadinessCheck {
	return GitHubReadinessCheck{
		Key:      key,
		Status:   "ok",
		Message:  message,
		Detail:   detail,
		Required: required,
	}
}

func readinessError(key, message, detail string, required bool) GitHubReadinessCheck {
	return GitHubReadinessCheck{
		Key:      key,
		Status:   "error",
		Message:  message,
		Detail:   detail,
		Required: required,
	}
}

func userFacingGitHubError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	replacements := map[string]string{
		"github app client":              "GitHub App 客户端",
		"token request failed":           "令牌请求失败",
		"token request failed with HTTP": "令牌请求失败，HTTP 状态码",
		"token response missing token":   "令牌响应缺少令牌",
		"read token response":            "读取令牌响应失败",
		"decode token response":          "解析令牌响应失败",
		"Not Found":                      "未找到",
	}
	for old, next := range replacements {
		message = strings.ReplaceAll(message, old, next)
	}
	return message
}

func readinessIsReady(checks []GitHubReadinessCheck) bool {
	for _, check := range checks {
		if check.Required && check.Status != "ok" {
			return false
		}
	}
	return true
}

func verifyGitHubSignature(secret string, body []byte, signature string) bool {
	secret = strings.TrimSpace(secret)
	signature = strings.TrimSpace(signature)
	if secret == "" || len(body) == 0 || !strings.HasPrefix(signature, "sha256=") {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write(body)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}

type webhookMetadata struct {
	Action             string
	InstallationID     int64
	RepositoryFullName string
}

func parseWebhookMetadata(body []byte) webhookMetadata {
	event, err := ParseGitHubWebhookPayload("metadata", body)
	if err != nil {
		return webhookMetadata{}
	}
	return webhookMetadata{
		Action:             event.Action,
		InstallationID:     event.InstallationID,
		RepositoryFullName: event.RepositoryFullName,
	}
}
