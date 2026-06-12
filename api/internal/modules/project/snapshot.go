package project

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

func (s *service) buildProjectContextSnapshot(ctx context.Context, userID uint, contextBundle *domain.SpecForgeProjectContext) (*domain.SpecForgeProjectContextSnapshot, error) {
	if contextBundle == nil || contextBundle.Project == nil {
		return nil, domain.ErrInvalidInput
	}

	snapshot := &domain.SpecForgeProjectContextSnapshot{
		WorkspaceID:         strings.TrimSpace(contextBundle.Project.WorkspaceID),
		ProjectID:           contextBundle.Project.ID,
		PrimaryRepositoryID: strings.TrimSpace(contextBundle.PrimaryRepositoryID),
		Readiness:           contextBundle.Readiness,
		ContextContract:     contextBundle.ContextContract,
		Repositories:        []*domain.SpecForgeProjectContextSnapshotRepository{},
		CreatedBy:           userID,
	}
	if snapshot.ContextContract != nil {
		snapshot.MissingEvidence = append(snapshot.MissingEvidence, snapshot.ContextContract.MissingEvidence...)
	}
	snapshot.EvidenceRefs = append(snapshot.EvidenceRefs, fmt.Sprintf("project:%d", contextBundle.Project.ID))

	deepWikiMatches := 0
	for _, repositoryContext := range contextBundle.RepositoryContexts {
		if repositoryContext == nil || repositoryContext.Repository == nil || !repositoryContext.Repository.Active {
			continue
		}
		repositoryID := strings.TrimSpace(repositoryContext.Repository.RepositoryID)
		repoSnapshot := &domain.SpecForgeProjectContextSnapshotRepository{
			RepositoryID:      repositoryID,
			Role:              strings.TrimSpace(repositoryContext.Repository.Role),
			Writable:          repositoryID != "" && repositoryID == strings.TrimSpace(contextBundle.PrimaryRepositoryID),
			ArchitectureStale: repositoryContext.ArchitectureStale,
			SkillNames:        []string{},
			Warnings:          []string{},
			MissingEvidence:   []string{},
		}

		if repositoryContext.Profile != nil {
			repoSnapshot.ProfileSummary = strings.TrimSpace(repositoryContext.Profile.Summary)
			repoSnapshot.ProfileSource = strings.TrimSpace(repositoryContext.Profile.Source)
			snapshot.EvidenceRefs = appendCompactProjectStrings(snapshot.EvidenceRefs, "repo_profile:"+repositoryID)
		} else {
			repoSnapshot.MissingEvidence = append(repoSnapshot.MissingEvidence, "repo_profile:"+repositoryID)
		}

		if repositoryContext.ArchitectureSnapshot != nil {
			repoSnapshot.ArchitectureSummary = strings.TrimSpace(repositoryContext.ArchitectureSnapshot.Summary)
			repoSnapshot.ArchitectureSnapshotCommit = strings.TrimSpace(repositoryContext.ArchitectureSnapshot.CommitSHA)
			if repoSnapshot.ArchitectureSnapshotCommit != "" {
				snapshot.EvidenceRefs = appendCompactProjectStrings(snapshot.EvidenceRefs, "architecture_snapshot:"+repositoryID+":"+repoSnapshot.ArchitectureSnapshotCommit)
			} else {
				snapshot.EvidenceRefs = appendCompactProjectStrings(snapshot.EvidenceRefs, "architecture_snapshot:"+repositoryID)
			}
		} else {
			repoSnapshot.MissingEvidence = append(repoSnapshot.MissingEvidence, "architecture_snapshot:"+repositoryID)
		}

		for _, warning := range repositoryContext.Warnings {
			repoSnapshot.Warnings = appendCompactProjectStrings(repoSnapshot.Warnings, warning)
		}
		for _, warning := range repositoryContext.ArchitectureWarnings {
			repoSnapshot.Warnings = appendCompactProjectStrings(repoSnapshot.Warnings, warning)
		}
		if repositoryContext.Profile != nil {
			for _, warning := range repositoryContext.Profile.Warnings {
				repoSnapshot.Warnings = appendCompactProjectStrings(repoSnapshot.Warnings, warning)
			}
		}

		for _, skill := range repositoryContext.Skills {
			if skill == nil || !skill.Active {
				continue
			}
			name := strings.TrimSpace(skill.Name)
			if name != "" {
				repoSnapshot.SkillNames = append(repoSnapshot.SkillNames, name)
			}
			if skill.ID > 0 {
				snapshot.EvidenceRefs = appendCompactProjectStrings(snapshot.EvidenceRefs, fmt.Sprintf("skill:%d", skill.ID))
			}
		}
		repoSnapshot.SkillNames = compactProjectSnapshotStrings(repoSnapshot.SkillNames)

		githubRepository, err := s.githubRepo.FindRepositoryByRepositoryID(ctx, repositoryID)
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("load GitHub repository for context snapshot: %w", err)
		}
		deepWikiSummary, deepWikiMissing, deepWikiRefs, err := s.deepWikiSummaryForRepository(ctx, userID, githubRepository)
		if err != nil {
			return nil, err
		}
		if deepWikiSummary != nil {
			repoSnapshot.DeepWiki = deepWikiSummary
			deepWikiMatches++
		}
		repoSnapshot.MissingEvidence = append(repoSnapshot.MissingEvidence, deepWikiMissing...)
		for _, ref := range deepWikiRefs {
			snapshot.EvidenceRefs = appendCompactProjectStrings(snapshot.EvidenceRefs, ref)
		}

		repoSnapshot.MissingEvidence = compactProjectSnapshotStrings(repoSnapshot.MissingEvidence)
		repoSnapshot.Warnings = compactProjectSnapshotStrings(repoSnapshot.Warnings)
		repoSnapshot.WarningCount = len(repoSnapshot.Warnings)
		snapshot.WarningCount += repoSnapshot.WarningCount
		snapshot.MissingEvidence = append(snapshot.MissingEvidence, repoSnapshot.MissingEvidence...)
		snapshot.Repositories = append(snapshot.Repositories, repoSnapshot)
	}

	snapshot.MissingEvidence = compactProjectSnapshotStrings(snapshot.MissingEvidence)
	snapshot.EvidenceRefs = compactProjectSnapshotStrings(snapshot.EvidenceRefs)
	snapshot.SnapshotStatus = projectContextSnapshotStatus(contextBundle, snapshot)
	snapshot.Summary = projectContextSnapshotSummary(contextBundle, snapshot, deepWikiMatches)
	return snapshot, nil
}

func (s *service) deepWikiSummaryForRepository(ctx context.Context, userID uint, repository *domain.Repository) (*domain.SpecForgeProjectContextDeepWikiSummary, []string, []string, error) {
	if s.deepwikiStore == nil || repository == nil || userID == 0 {
		return nil, nil, nil, nil
	}
	repositoryID := strings.TrimSpace(repository.RepositoryID)
	source, err := s.findMatchedDeepWikiSource(ctx, userID, repository)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("load DeepWiki source for %s: %w", repositoryID, err)
	}
	if source == nil {
		return nil, []string{"deepwiki_index:" + repositoryID}, nil, nil
	}

	summary := &domain.SpecForgeProjectContextDeepWikiSummary{
		SourceID:      source.ID,
		SourceType:    strings.TrimSpace(source.SourceType),
		SourceStatus:  strings.TrimSpace(source.Status),
		RepoURL:       strings.TrimSpace(source.RepoURL),
		MatchedBy:     "github_url",
		LastIndexedAt: source.LastIndexedAt,
		Warnings:      []string{},
	}
	evidenceRefs := []string{fmt.Sprintf("deepwiki_source:%d", source.ID)}
	missingEvidence := []string{}

	index, err := s.deepwikiStore.FindLatestIndexBySourceID(ctx, source.ID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			summary.Warnings = append(summary.Warnings, "DeepWiki source exists but no index has been generated yet.")
			return summary, []string{"deepwiki_index:" + repositoryID}, evidenceRefs, nil
		}
		return nil, nil, nil, err
	}
	summary.IndexID = index.ID
	summary.IndexStatus = strings.TrimSpace(index.Status)
	summary.FileCount = index.FileCount
	summary.ChunkCount = index.ChunkCount
	summary.Frameworks = compactProjectSnapshotStrings(index.Frameworks)
	summary.Entrypoints = compactProjectSnapshotStrings(index.Entrypoints)
	summary.Routes = compactProjectSnapshotStrings(index.Routes)
	summary.Services = compactProjectSnapshotStrings(index.Services)
	summary.Models = compactProjectSnapshotStrings(index.Models)
	evidenceRefs = append(evidenceRefs, fmt.Sprintf("deepwiki_index:%d", index.ID))

	if !strings.EqualFold(index.Status, domain.DeepWikiStatusReady) {
		summary.Warnings = append(summary.Warnings, "DeepWiki index is not ready yet.")
		missingEvidence = append(missingEvidence, "deepwiki_index:"+repositoryID)
	}
	if strings.TrimSpace(index.ErrorMessage) != "" {
		summary.Warnings = appendCompactProjectStrings(summary.Warnings, index.ErrorMessage)
	}

	pages, err := s.deepwikiStore.ListPagesByIndexID(ctx, index.ID)
	if err != nil {
		return nil, nil, nil, err
	}
	summary.PageCount = len(pages)
	for _, page := range pages {
		if page == nil {
			continue
		}
		title := strings.TrimSpace(page.Title)
		if title == "" {
			title = strings.TrimSpace(page.Slug)
		}
		if title != "" && len(summary.TopPages) < 5 {
			summary.TopPages = append(summary.TopPages, title)
		}
		if page.ID > 0 && len(evidenceRefs) < 8 {
			evidenceRefs = append(evidenceRefs, fmt.Sprintf("deepwiki_page:%d", page.ID))
		}
	}
	if summary.PageCount == 0 {
		summary.Warnings = append(summary.Warnings, "DeepWiki index has no generated pages yet.")
	}
	summary.Warnings = compactProjectSnapshotStrings(summary.Warnings)
	return summary, compactProjectSnapshotStrings(missingEvidence), compactProjectSnapshotStrings(evidenceRefs), nil
}

func (s *service) findMatchedDeepWikiSource(ctx context.Context, userID uint, repository *domain.Repository) (*domain.DeepWikiSource, error) {
	if s.deepwikiStore == nil || repository == nil || userID == 0 {
		return nil, nil
	}

	page := 1
	pageSize := 100
	matches := []*domain.DeepWikiSource{}
	for {
		sources, total, err := s.deepwikiStore.ListSources(ctx, domain.DeepWikiSourceFilter{
			CreatedBy: userID,
		}, page, pageSize)
		if err != nil {
			return nil, err
		}
		for _, source := range sources {
			if deepWikiSourceMatchesRepository(source, repository) {
				matches = append(matches, source)
			}
		}
		if len(sources) < pageSize || int64(page*pageSize) >= total {
			break
		}
		page++
	}
	return pickLatestDeepWikiSource(matches), nil
}

func deepWikiSourceMatchesRepository(source *domain.DeepWikiSource, repository *domain.Repository) bool {
	if source == nil || repository == nil {
		return false
	}
	if strings.TrimSpace(source.SourceType) != domain.DeepWikiSourceTypeGitHubURL {
		return false
	}
	return normalizeGitHubRepoPath(source.RepoURL) == normalizeGitHubRepoOwnerRepo(repository.GitHubOwner, repository.GitHubRepo)
}

func normalizeGitHubRepoOwnerRepo(owner, repo string) string {
	owner = strings.Trim(strings.ToLower(strings.TrimSpace(owner)), "/")
	repo = strings.Trim(strings.ToLower(strings.TrimSpace(repo)), "/")
	if owner == "" || repo == "" {
		return ""
	}
	return owner + "/" + repo
}

func normalizeGitHubRepoPath(raw string) string {
	raw = strings.ToLower(strings.TrimSpace(raw))
	if raw == "" {
		return ""
	}
	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	raw = strings.TrimPrefix(raw, "ssh://")
	raw = strings.TrimPrefix(raw, "git@")
	raw = strings.TrimPrefix(raw, "github.com/")
	raw = strings.TrimPrefix(raw, "github.com:")
	raw = strings.TrimPrefix(raw, "github.com")
	raw = strings.TrimPrefix(raw, "/")
	raw = strings.TrimPrefix(raw, ":")
	raw = strings.TrimSuffix(raw, ".git")
	raw = strings.Trim(raw, "/")
	parts := strings.Split(raw, "/")
	if len(parts) < 2 {
		return raw
	}
	return parts[0] + "/" + parts[1]
}

func pickLatestDeepWikiSource(sources []*domain.DeepWikiSource) *domain.DeepWikiSource {
	var selected *domain.DeepWikiSource
	for _, source := range sources {
		if source == nil {
			continue
		}
		if selected == nil {
			selected = source
			continue
		}
		selectedIndexedAt := selected.LastIndexedAt
		sourceIndexedAt := source.LastIndexedAt
		switch {
		case selectedIndexedAt == nil && sourceIndexedAt != nil:
			selected = source
		case selectedIndexedAt != nil && sourceIndexedAt != nil && sourceIndexedAt.After(*selectedIndexedAt):
			selected = source
		case selectedIndexedAt == nil && sourceIndexedAt == nil && source.UpdatedAt.After(selected.UpdatedAt):
			selected = source
		}
	}
	return selected
}

func projectContextSnapshotStatus(contextBundle *domain.SpecForgeProjectContext, snapshot *domain.SpecForgeProjectContextSnapshot) string {
	if contextBundle == nil || contextBundle.Readiness == nil || snapshot == nil {
		return domain.ProjectReadinessStatusBlocked
	}
	if !contextBundle.Readiness.HasPrimaryRepository {
		return domain.ProjectReadinessStatusBlocked
	}
	if len(snapshot.MissingEvidence) > 0 || snapshot.WarningCount > 0 {
		return domain.ProjectReadinessStatusAttention
	}
	return domain.ProjectReadinessStatusReady
}

func projectContextSnapshotSummary(contextBundle *domain.SpecForgeProjectContext, snapshot *domain.SpecForgeProjectContextSnapshot, deepWikiMatches int) string {
	if contextBundle == nil || contextBundle.Readiness == nil {
		return "Project context snapshot is unavailable."
	}
	if !contextBundle.Readiness.HasPrimaryRepository {
		return "Snapshot is blocked until one active primary repository is bound."
	}
	if deepWikiMatches == 0 {
		return fmt.Sprintf("Snapshot covers %d active repositories, but no DeepWiki index matched the current project repositories.", contextBundle.Readiness.ActiveRepositoryCount)
	}
	if len(snapshot.MissingEvidence) > 0 {
		return fmt.Sprintf("Snapshot covers %d active repositories and %d DeepWiki indexes, but some evidence is still missing.", contextBundle.Readiness.ActiveRepositoryCount, deepWikiMatches)
	}
	return fmt.Sprintf("Snapshot covers %d active repositories and %d matched DeepWiki indexes.", contextBundle.Readiness.ActiveRepositoryCount, deepWikiMatches)
}

func compactProjectSnapshotStrings(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = appendCompactProjectStrings(out, value)
	}
	return out
}
