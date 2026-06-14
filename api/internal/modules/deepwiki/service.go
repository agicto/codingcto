package deepwiki

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/capabilities/ai"
	"github.com/zgiai/luas/api/internal/capabilities/crypto"
	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	CreateSource(ctx context.Context, userID uint, req *CreateSourceRequest) (*domain.DeepWikiSource, error)
	ListSources(ctx context.Context, userID uint, filter domain.DeepWikiSourceFilter, page, pageSize int) ([]*domain.DeepWikiSource, int64, error)
	GetSource(ctx context.Context, userID, sourceID uint) (*domain.DeepWikiSource, error)
	IndexSource(ctx context.Context, userID, sourceID uint, req *IndexSourceRequest) (*domain.DeepWikiIndex, error)
	EnsureRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error)
	ReindexRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error)
	DeleteRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) error
	GetLatestIndex(ctx context.Context, userID, sourceID uint) (*domain.DeepWikiIndex, error)
	ListPages(ctx context.Context, userID, indexID uint) ([]*domain.DeepWikiPage, error)
	GetPage(ctx context.Context, userID, pageID uint) (*domain.DeepWikiPage, error)
	GetPageByIndexAndSlug(ctx context.Context, userID, indexID uint, slug string) (*domain.DeepWikiPage, error)
	Search(ctx context.Context, userID, indexID uint, query string) ([]*domain.DeepWikiSearchResult, error)
	SourceSnippet(ctx context.Context, userID, indexID uint, path string, startLine, endLine int) (*SourceSnippetResponse, error)
	BrowseLocalDirectories(ctx context.Context, userID uint, path string) (*LocalDirectoryListResponse, error)
}

type IndexSourceRequest struct {
	PAT string `json:"pat" binding:"omitempty,max=4000"`
}

type service struct {
	repo      domain.DeepWikiRepository
	reader    RepoReader
	analyzer  repositoryAnalyzer
	chunker   chunker
	generator llmWikiEngine
	now       func() time.Time
}

func NewService(repo domain.DeepWikiRepository, reader RepoReader, aiManager *ai.Manager) *service {
	var generator deepWikiTextGenerator
	if aiManager != nil {
		generator = aiManager
	}
	return &service{
		repo:      repo,
		reader:    reader,
		analyzer:  newRepositoryAnalyzer(),
		chunker:   newChunker(),
		generator: newLLMWikiEngine(generator),
		now:       time.Now,
	}
}

func (s *service) CreateSource(ctx context.Context, userID uint, req *CreateSourceRequest) (*domain.DeepWikiSource, error) {
	if userID == 0 || req == nil {
		return nil, domain.ErrInvalidInput
	}
	sourceType := strings.TrimSpace(req.SourceType)
	repoURL := strings.TrimSpace(req.RepoURL)
	localPath := strings.TrimSpace(req.LocalPath)
	if sourceType == domain.DeepWikiSourceTypeGitHubURL && repoURL == "" {
		return nil, domain.ErrInvalidInput
	}
	if sourceType == domain.DeepWikiSourceTypeLocalPath && localPath == "" {
		return nil, domain.ErrInvalidInput
	}
	if sourceType == domain.DeepWikiSourceTypeGitHubRepository && strings.TrimSpace(req.RepositoryID) == "" {
		return nil, domain.ErrInvalidInput
	}
	encryptedPAT, patSecretRef, err := encryptPAT(strings.TrimSpace(req.PAT))
	if err != nil {
		return nil, err
	}
	source := &domain.DeepWikiSource{
		CreatedBy:     userID,
		WorkspaceID:   strings.TrimSpace(req.WorkspaceID),
		ProjectID:     req.ProjectID,
		RepositoryID:  strings.TrimSpace(req.RepositoryID),
		SourceType:    sourceType,
		RepoURL:       repoURL,
		LocalPath:     localPath,
		Branch:        strings.TrimSpace(req.Branch),
		GitHubOwner:   strings.TrimSpace(req.GitHubOwner),
		GitHubRepo:    strings.TrimSpace(req.GitHubRepo),
		DefaultBranch: strings.TrimSpace(req.DefaultBranch),
		PATSecretRef:  patSecretRef,
		EncryptedPAT:  encryptedPAT,
		Status:        domain.DeepWikiStatusQueued,
	}
	if err := s.repo.CreateSource(ctx, source); err != nil {
		return nil, fmt.Errorf("create deepwiki source: %w", err)
	}
	return source, nil
}

func (s *service) ListSources(ctx context.Context, userID uint, filter domain.DeepWikiSourceFilter, page, pageSize int) ([]*domain.DeepWikiSource, int64, error) {
	if userID == 0 {
		return nil, 0, domain.ErrInvalidInput
	}
	filter.CreatedBy = userID
	return s.repo.ListSources(ctx, filter, page, pageSize)
}

func (s *service) GetSource(ctx context.Context, userID, sourceID uint) (*domain.DeepWikiSource, error) {
	source, err := s.repo.FindSourceByID(ctx, sourceID)
	if err != nil {
		return nil, err
	}
	if source.CreatedBy != userID {
		return nil, domain.ErrPermissionDenied
	}
	return source, nil
}

func (s *service) IndexSource(ctx context.Context, userID, sourceID uint, req *IndexSourceRequest) (*domain.DeepWikiIndex, error) {
	source, err := s.GetSource(ctx, userID, sourceID)
	if err != nil {
		return nil, err
	}
	pat := ""
	if req != nil {
		pat = strings.TrimSpace(req.PAT)
	}
	if pat == "" {
		pat, err = decryptPAT(source.EncryptedPAT)
		if err != nil {
			return nil, err
		}
	}
	return s.indexSource(ctx, source, pat)
}

func (s *service) EnsureRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error) {
	source, err := s.ensureRepositorySource(ctx, userID, projectID, repository)
	if err != nil {
		return nil, nil, err
	}
	index, err := s.repo.FindLatestIndexBySourceID(ctx, source.ID)
	if err == nil {
		if index.Status == domain.DeepWikiStatusReady {
			return source, index, nil
		}
		if index.Status != domain.DeepWikiStatusFailed {
			return source, index, nil
		}
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, nil, err
	}
	index, err = s.indexSource(ctx, source, "")
	return source, index, err
}

func (s *service) ReindexRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, *domain.DeepWikiIndex, error) {
	source, err := s.ensureRepositorySource(ctx, userID, projectID, repository)
	if err != nil {
		return nil, nil, err
	}
	index, err := s.indexSource(ctx, source, "")
	return source, index, err
}

func (s *service) DeleteRepositoryWiki(ctx context.Context, userID, projectID uint, repository *domain.Repository) error {
	if userID == 0 || projectID == 0 || repository == nil || strings.TrimSpace(repository.RepositoryID) == "" || strings.TrimSpace(repository.WorkspaceID) == "" {
		return domain.ErrInvalidInput
	}
	sources, _, err := s.repo.ListSources(ctx, domain.DeepWikiSourceFilter{
		WorkspaceID:  strings.TrimSpace(repository.WorkspaceID),
		RepositoryID: strings.TrimSpace(repository.RepositoryID),
		SourceType:   domain.DeepWikiSourceTypeGitHubRepository,
	}, 1, 100)
	if err != nil {
		return err
	}
	for _, source := range sources {
		if source == nil {
			continue
		}
		if err := s.repo.DeleteSource(ctx, source.ID); err != nil && !errors.Is(err, domain.ErrNotFound) {
			return fmt.Errorf("delete repository deepwiki source: %w", err)
		}
	}
	return nil
}

func (s *service) indexSource(ctx context.Context, source *domain.DeepWikiSource, pat string) (*domain.DeepWikiIndex, error) {
	if source == nil {
		return nil, domain.ErrInvalidInput
	}
	if err := s.setSourceStatus(ctx, source, domain.DeepWikiStatusReading, "", ""); err != nil {
		return nil, err
	}
	snapshot, err := s.reader.Read(ctx, source, pat)
	if err != nil {
		_ = s.failSource(ctx, source, domain.DeepWikiFailureRead, err)
		return nil, fmt.Errorf("read repository: %w", err)
	}

	if err := s.setSourceStatus(ctx, source, domain.DeepWikiStatusAnalyzing, "", ""); err != nil {
		return nil, err
	}
	profile := s.analyzer.Analyze(snapshot)
	index := &domain.DeepWikiIndex{
		SourceID:        source.ID,
		CommitSHA:       snapshot.CommitSHA,
		FileCount:       len(snapshot.Files),
		LanguageSummary: profile.LanguageSummary,
		FileTree:        profile.FileTree,
		Entrypoints:     profile.Entrypoints,
		Routes:          profile.Routes,
		Services:        profile.Services,
		Models:          profile.Models,
		Configs:         profile.Configs,
		Frameworks:      profile.Frameworks,
		PackageManager:  profile.PackageManager,
		GenerationMode:  domain.DeepWikiGenerationModeLLM,
		PromptVersion:   deepWikiLLMPromptVersion,
		Status:          domain.DeepWikiStatusIndexing,
	}
	if err := s.repo.CreateIndex(ctx, index); err != nil {
		_ = s.failSource(ctx, source, domain.DeepWikiFailureAnalyze, err)
		return nil, fmt.Errorf("create deepwiki index: %w", err)
	}

	chunks := s.chunker.Chunk(index.ID, snapshot)
	if err := s.repo.CreateChunks(ctx, chunks); err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailureIndex, err)
	}
	index.ChunkCount = len(chunks)
	index.Status = domain.DeepWikiStatusPlanning
	if err := s.repo.UpdateIndex(ctx, index); err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailureIndex, err)
	}

	if err := s.setSourceStatus(ctx, source, domain.DeepWikiStatusPlanning, "", ""); err != nil {
		return nil, err
	}
	index.Status = domain.DeepWikiStatusGenerating
	if err := s.repo.UpdateIndex(ctx, index); err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailurePlan, err)
	}

	if err := s.setSourceStatus(ctx, source, domain.DeepWikiStatusGenerating, "", ""); err != nil {
		return nil, err
	}
	pages, generation, err := s.generator.Generate(ctx, index.ID, profile, chunks)
	if err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailureGenerate, err)
	}
	index.GenerationMode = generation.Mode
	index.GeneratorProvider = generation.Provider
	index.GeneratorModel = generation.Model
	index.PromptVersion = generation.PromptVersion
	if err := s.repo.CreatePages(ctx, pages); err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailureGenerate, err)
	}

	index.Status = domain.DeepWikiStatusReady
	if err := s.repo.UpdateIndex(ctx, index); err != nil {
		return nil, s.failIndex(ctx, source, index, domain.DeepWikiFailureGenerate, err)
	}
	now := s.now()
	source.LastIndexedAt = &now
	source.Branch = fallback(source.Branch, snapshot.Branch)
	if err := s.setSourceStatus(ctx, source, domain.DeepWikiStatusReady, "", ""); err != nil {
		return nil, err
	}
	return index, nil
}

func (s *service) ensureRepositorySource(ctx context.Context, userID, projectID uint, repository *domain.Repository) (*domain.DeepWikiSource, error) {
	if userID == 0 || repository == nil || strings.TrimSpace(repository.RepositoryID) == "" || strings.TrimSpace(repository.WorkspaceID) == "" {
		return nil, domain.ErrInvalidInput
	}
	source, err := s.findLatestRepositorySource(ctx, repository.WorkspaceID, repository.RepositoryID)
	if err != nil {
		return nil, err
	}
	defaultBranch := strings.TrimSpace(repository.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	if source == nil {
		source = &domain.DeepWikiSource{
			CreatedBy:     userID,
			WorkspaceID:   strings.TrimSpace(repository.WorkspaceID),
			ProjectID:     projectID,
			RepositoryID:  strings.TrimSpace(repository.RepositoryID),
			SourceType:    domain.DeepWikiSourceTypeGitHubRepository,
			RepoURL:       repositoryGitHubURL(repository),
			Branch:        defaultBranch,
			GitHubOwner:   strings.TrimSpace(repository.GitHubOwner),
			GitHubRepo:    strings.TrimSpace(repository.GitHubRepo),
			DefaultBranch: defaultBranch,
			Status:        domain.DeepWikiStatusQueued,
		}
		if err := s.repo.CreateSource(ctx, source); err != nil {
			return nil, fmt.Errorf("create repository deepwiki source: %w", err)
		}
		return source, nil
	}

	changed := false
	changed = assignString(&source.WorkspaceID, strings.TrimSpace(repository.WorkspaceID)) || changed
	changed = assignUint(&source.ProjectID, projectID) || changed
	changed = assignString(&source.RepositoryID, strings.TrimSpace(repository.RepositoryID)) || changed
	changed = assignString(&source.SourceType, domain.DeepWikiSourceTypeGitHubRepository) || changed
	changed = assignString(&source.RepoURL, repositoryGitHubURL(repository)) || changed
	changed = assignString(&source.GitHubOwner, strings.TrimSpace(repository.GitHubOwner)) || changed
	changed = assignString(&source.GitHubRepo, strings.TrimSpace(repository.GitHubRepo)) || changed
	changed = assignString(&source.DefaultBranch, defaultBranch) || changed
	if strings.TrimSpace(source.Branch) == "" {
		changed = assignString(&source.Branch, defaultBranch) || changed
	}
	if changed {
		if err := s.repo.UpdateSource(ctx, source); err != nil {
			return nil, fmt.Errorf("update repository deepwiki source: %w", err)
		}
	}
	return source, nil
}

func (s *service) findLatestRepositorySource(ctx context.Context, workspaceID, repositoryID string) (*domain.DeepWikiSource, error) {
	sources, _, err := s.repo.ListSources(ctx, domain.DeepWikiSourceFilter{
		WorkspaceID:  strings.TrimSpace(workspaceID),
		RepositoryID: strings.TrimSpace(repositoryID),
		SourceType:   domain.DeepWikiSourceTypeGitHubRepository,
	}, 1, 1)
	if err != nil {
		return nil, err
	}
	if len(sources) == 0 {
		return nil, nil
	}
	return sources[0], nil
}

func repositoryGitHubURL(repository *domain.Repository) string {
	if repository == nil || strings.TrimSpace(repository.GitHubOwner) == "" || strings.TrimSpace(repository.GitHubRepo) == "" {
		return ""
	}
	return "https://github.com/" + strings.Trim(strings.TrimSpace(repository.GitHubOwner), "/") + "/" + strings.Trim(strings.TrimSpace(repository.GitHubRepo), "/")
}

func assignString(target *string, value string) bool {
	if strings.TrimSpace(*target) == value {
		return false
	}
	*target = value
	return true
}

func assignUint(target *uint, value uint) bool {
	if *target == value {
		return false
	}
	*target = value
	return true
}

func (s *service) GetLatestIndex(ctx context.Context, userID, sourceID uint) (*domain.DeepWikiIndex, error) {
	if _, err := s.GetSource(ctx, userID, sourceID); err != nil {
		return nil, err
	}
	return s.repo.FindLatestIndexBySourceID(ctx, sourceID)
}

func (s *service) ListPages(ctx context.Context, userID, indexID uint) ([]*domain.DeepWikiPage, error) {
	if _, err := s.ensureIndexAccess(ctx, userID, indexID); err != nil {
		return nil, err
	}
	return s.repo.ListPagesByIndexID(ctx, indexID)
}

func (s *service) GetPage(ctx context.Context, userID, pageID uint) (*domain.DeepWikiPage, error) {
	page, err := s.repo.FindPageByID(ctx, pageID)
	if err != nil {
		return nil, err
	}
	if _, err := s.ensureIndexAccess(ctx, userID, page.IndexID); err != nil {
		return nil, err
	}
	return page, nil
}

func (s *service) GetPageByIndexAndSlug(ctx context.Context, userID, indexID uint, slug string) (*domain.DeepWikiPage, error) {
	if _, err := s.ensureIndexAccess(ctx, userID, indexID); err != nil {
		return nil, err
	}
	return s.repo.FindPageByIndexAndSlug(ctx, indexID, slug)
}

func (s *service) Search(ctx context.Context, userID, indexID uint, query string) ([]*domain.DeepWikiSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []*domain.DeepWikiSearchResult{}, nil
	}
	if _, err := s.ensureIndexAccess(ctx, userID, indexID); err != nil {
		return nil, err
	}
	pages, err := s.repo.SearchPages(ctx, indexID, query, 10)
	if err != nil {
		return nil, err
	}
	chunks, err := s.repo.SearchChunks(ctx, indexID, query, 20)
	if err != nil {
		return nil, err
	}
	results := make([]*domain.DeepWikiSearchResult, 0, len(pages)+len(chunks))
	for _, page := range pages {
		results = append(results, &domain.DeepWikiSearchResult{
			Kind:       "page",
			ID:         page.ID,
			Title:      page.Title,
			Slug:       page.Slug,
			Snippet:    snippet(page.Markdown, query),
			SourceRefs: page.SourceRefs,
		})
	}
	for _, chunk := range chunks {
		results = append(results, &domain.DeepWikiSearchResult{
			Kind:      "chunk",
			ID:        chunk.ID,
			Title:     fallback(chunk.SymbolName, chunk.FilePath),
			FilePath:  chunk.FilePath,
			Language:  chunk.Language,
			StartLine: chunk.StartLine,
			EndLine:   chunk.EndLine,
			Snippet:   snippet(chunk.Content, query),
		})
	}
	return results, nil
}

func (s *service) SourceSnippet(ctx context.Context, userID, indexID uint, path string, startLine, endLine int) (*SourceSnippetResponse, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, domain.ErrInvalidInput
	}
	if _, err := s.ensureIndexAccess(ctx, userID, indexID); err != nil {
		return nil, err
	}
	chunks, err := s.repo.ListChunksByIndexID(ctx, indexID)
	if err != nil {
		return nil, err
	}
	lines := []string{}
	actualStart := 0
	actualEnd := 0
	for _, chunk := range chunks {
		if chunk.FilePath != path {
			continue
		}
		if startLine > 0 && chunk.EndLine < startLine {
			continue
		}
		if endLine > 0 && chunk.StartLine > endLine {
			continue
		}
		chunkStart := chunk.StartLine
		chunkEnd := chunk.EndLine
		if startLine > 0 && startLine > chunkStart {
			chunkStart = startLine
		}
		if endLine > 0 && endLine < chunkEnd {
			chunkEnd = endLine
		}
		chunkLines := splitLines(chunk.Content)
		offsetStart := chunkStart - chunk.StartLine
		offsetEnd := chunkEnd - chunk.StartLine
		if offsetStart < 0 || offsetStart >= len(chunkLines) {
			continue
		}
		if offsetEnd >= len(chunkLines) {
			offsetEnd = len(chunkLines) - 1
		}
		if actualStart == 0 {
			actualStart = chunkStart
		}
		actualEnd = chunkEnd
		lines = append(lines, chunkLines[offsetStart:offsetEnd+1]...)
	}
	if len(lines) == 0 {
		return nil, domain.ErrNotFound
	}
	return &SourceSnippetResponse{
		IndexID:   indexID,
		Path:      path,
		StartLine: actualStart,
		EndLine:   actualEnd,
		Content:   strings.Join(lines, "\n"),
	}, nil
}

func (s *service) BrowseLocalDirectories(ctx context.Context, userID uint, path string) (*LocalDirectoryListResponse, error) {
	if userID == 0 {
		return nil, domain.ErrInvalidInput
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	resolvedPath, err := resolveLocalDirectoryPath(path)
	if err != nil {
		return nil, err
	}
	info, err := os.Stat(resolvedPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, fmt.Errorf("%w: local directory does not exist", domain.ErrNotFound)
		}
		return nil, fmt.Errorf("%w: %s", domain.ErrInvalidInput, err.Error())
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%w: local path is not a directory", domain.ErrInvalidInput)
	}

	rows, err := os.ReadDir(resolvedPath)
	if err != nil {
		return nil, fmt.Errorf("%w: %s", domain.ErrPermissionDenied, err.Error())
	}
	entries := make([]*LocalDirectoryEntryResponse, 0, len(rows))
	for _, row := range rows {
		if !row.IsDir() {
			continue
		}
		entries = append(entries, &LocalDirectoryEntryResponse{
			Name: row.Name(),
			Path: filepath.Join(resolvedPath, row.Name()),
		})
	}
	sort.Slice(entries, func(i, j int) bool {
		return strings.ToLower(entries[i].Name) < strings.ToLower(entries[j].Name)
	})

	parentPath := filepath.Dir(resolvedPath)
	if parentPath == resolvedPath {
		parentPath = ""
	}
	return &LocalDirectoryListResponse{
		Path:       resolvedPath,
		ParentPath: parentPath,
		Entries:    entries,
	}, nil
}

func (s *service) setSourceStatus(ctx context.Context, source *domain.DeepWikiSource, status, failure, message string) error {
	source.Status = status
	source.LastFailure = failure
	source.LastError = message
	return s.repo.UpdateSource(ctx, source)
}

func (s *service) failSource(ctx context.Context, source *domain.DeepWikiSource, failure string, err error) error {
	return s.setSourceStatus(ctx, source, domain.DeepWikiStatusFailed, failure, err.Error())
}

func (s *service) failIndex(ctx context.Context, source *domain.DeepWikiSource, index *domain.DeepWikiIndex, failure string, err error) error {
	index.Status = domain.DeepWikiStatusFailed
	index.ErrorMessage = err.Error()
	_ = s.repo.UpdateIndex(ctx, index)
	_ = s.failSource(ctx, source, failure, err)
	return fmt.Errorf("%s: %w", failure, err)
}

func (s *service) ensureIndexAccess(ctx context.Context, userID, indexID uint) (*domain.DeepWikiIndex, error) {
	index, err := s.repo.FindIndexByID(ctx, indexID)
	if err != nil {
		return nil, err
	}
	if _, err := s.GetSource(ctx, userID, index.SourceID); err != nil {
		return nil, err
	}
	return index, nil
}

func encryptPAT(pat string) (string, string, error) {
	if strings.TrimSpace(pat) == "" {
		return "", "", nil
	}
	key := deepWikiEncryptionKey()
	if key == "" {
		return "", "not_persisted", nil
	}
	encrypted, err := crypto.NewAESEncryptorFromString(key).EncryptString(pat)
	if err != nil {
		return "", "", fmt.Errorf("encrypt deepwiki pat: %w", err)
	}
	return encrypted, "encrypted_pat", nil
}

func decryptPAT(encrypted string) (string, error) {
	if strings.TrimSpace(encrypted) == "" {
		return "", nil
	}
	key := deepWikiEncryptionKey()
	if key == "" {
		return "", fmt.Errorf("deepwiki pat encryption key is not configured")
	}
	pat, err := crypto.NewAESEncryptorFromString(key).DecryptString(encrypted)
	if err != nil {
		return "", fmt.Errorf("decrypt deepwiki pat: %w", err)
	}
	return pat, nil
}

func deepWikiEncryptionKey() string {
	for _, key := range []string{"DEEPWIKI_PAT_ENCRYPTION_KEY", "SESSION_SECRET"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func resolveLocalDirectoryPath(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		home, err := os.UserHomeDir()
		if err == nil && strings.TrimSpace(home) != "" {
			return filepath.Clean(home), nil
		}
		workingDir, err := os.Getwd()
		if err != nil {
			return "", fmt.Errorf("%w: %s", domain.ErrInvalidInput, err.Error())
		}
		return filepath.Clean(workingDir), nil
	}
	if path == "~" || strings.HasPrefix(path, "~/") {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return "", fmt.Errorf("%w: home directory is unavailable", domain.ErrInvalidInput)
		}
		if path == "~" {
			path = home
		} else {
			path = filepath.Join(home, strings.TrimPrefix(path, "~/"))
		}
	}
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return "", fmt.Errorf("%w: %s", domain.ErrInvalidInput, err.Error())
	}
	return filepath.Clean(absolutePath), nil
}

func snippet(content, query string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	lower := strings.ToLower(content)
	query = strings.ToLower(strings.TrimSpace(query))
	index := strings.Index(lower, query)
	if index < 0 {
		if len(content) > 240 {
			return content[:240] + "..."
		}
		return content
	}
	start := index - 100
	if start < 0 {
		start = 0
	}
	end := index + len(query) + 140
	if end > len(content) {
		end = len(content)
	}
	prefix := ""
	if start > 0 {
		prefix = "..."
	}
	suffix := ""
	if end < len(content) {
		suffix = "..."
	}
	return prefix + strings.TrimSpace(content[start:end]) + suffix
}

func isNotFound(err error) bool {
	return errors.Is(err, domain.ErrNotFound)
}
