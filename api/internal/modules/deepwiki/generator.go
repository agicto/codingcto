package deepwiki

import (
	"fmt"
	"sort"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type wikiGenerator struct{}

func newWikiGenerator() wikiGenerator {
	return wikiGenerator{}
}

func (g wikiGenerator) Generate(indexID uint, profile RepositoryProfile, plans []WikiPagePlan, chunks []*domain.DeepWikiChunk) []*domain.DeepWikiPage {
	pages := make([]*domain.DeepWikiPage, 0, len(plans))
	for i, plan := range plans {
		refs := sourceRefsForPlan(plan, chunks)
		markdown := g.markdownForPlan(plan, profile, refs)
		mermaid := ""
		if plan.PageType == "architecture" {
			mermaid = architectureMermaid(profile)
		}
		pages = append(pages, &domain.DeepWikiPage{
			IndexID:    indexID,
			Slug:       plan.Slug,
			Title:      plan.Title,
			PageType:   plan.PageType,
			Markdown:   markdown,
			Mermaid:    mermaid,
			SourceRefs: refs,
			OrderIndex: i + 1,
			Status:     domain.DeepWikiStatusReady,
		})
	}
	return pages
}

func (g wikiGenerator) markdownForPlan(plan WikiPagePlan, profile RepositoryProfile, refs []domain.DeepWikiSourceRef) string {
	sourceLine := "No direct source reference was selected for this page."
	if len(refs) > 0 {
		labels := make([]string, len(refs))
		for i, ref := range refs {
			labels[i] = sourceRefLabel(ref)
		}
		sourceLine = strings.Join(labels, ", ")
	}

	var body strings.Builder
	body.WriteString("# " + plan.Title + "\n\n")
	body.WriteString(plan.Purpose + "\n\n")
	body.WriteString("## Source Evidence\n\n")
	body.WriteString(sourceLine + "\n\n")
	body.WriteString("## What To Know\n\n")

	switch plan.PageType {
	case "overview":
		body.WriteString("- Main languages: " + languageSummaryText(profile.LanguageSummary) + ".\n")
		body.WriteString("- Framework signals: " + listOrFallback(profile.Frameworks, "none detected") + ".\n")
		body.WriteString("- Primary entrypoints: " + listOrFallback(profile.Entrypoints, "none detected") + ".\n")
	case "architecture":
		body.WriteString("- Route files and service files form the clearest request-flow evidence.\n")
		body.WriteString("- Major route evidence: " + listOrFallback(profile.Routes, "none detected") + ".\n")
		body.WriteString("- Major service evidence: " + listOrFallback(profile.Services, "none detected") + ".\n")
	case "setup":
		body.WriteString("- Package manager: " + fallback(profile.PackageManager, "not detected") + ".\n")
		body.WriteString("- Configuration files: " + listOrFallback(profile.Configs, "none detected") + ".\n")
	case "frontend":
		body.WriteString("- Frontend route evidence: " + listOrFallback(filterPaths(profile.Routes, "web/", "src/app/"), "none detected") + ".\n")
		body.WriteString("- Frontend feature folders should be read alongside service and hook files.\n")
	case "backend":
		body.WriteString("- Backend route evidence: " + listOrFallback(profile.Routes, "none detected") + ".\n")
		body.WriteString("- Backend service boundaries: " + listOrFallback(profile.Services, "none detected") + ".\n")
	case "data_model":
		body.WriteString("- Data model files: " + listOrFallback(profile.Models, "none detected") + ".\n")
	case "api_routes":
		body.WriteString("- API route files: " + listOrFallback(profile.Routes, "none detected") + ".\n")
	case "key_flows":
		body.WriteString("- Service flow anchors: " + listOrFallback(profile.Services, "none detected") + ".\n")
	case "configuration":
		body.WriteString("- Runtime and tooling configs: " + listOrFallback(profile.Configs, "none detected") + ".\n")
	case "testing":
		body.WriteString("- Test files: " + listOrFallback(profile.TestFiles, "none detected") + ".\n")
	case "deployment":
		body.WriteString("- CI files: " + listOrFallback(profile.CIFiles, "none detected") + ".\n")
	case "glossary":
		body.WriteString("- Repository terms are derived from framework names, entrypoints, and module/service file names.\n")
		body.WriteString("- Framework terms: " + listOrFallback(profile.Frameworks, "none detected") + ".\n")
	default:
		body.WriteString("- This page is generated from repository structure and source evidence.\n")
	}

	body.WriteString("\n## Important Files\n\n")
	for _, ref := range refs {
		body.WriteString("- " + sourceRefLabel(ref) + "\n")
	}
	if len(refs) == 0 {
		body.WriteString("- No matching indexed chunks were found for the planner evidence.\n")
	}
	return body.String()
}

func sourceRefsForPlan(plan WikiPagePlan, chunks []*domain.DeepWikiChunk) []domain.DeepWikiSourceRef {
	refs := []domain.DeepWikiSourceRef{}
	seen := map[string]struct{}{}
	for _, evidence := range plan.RequiredEvidence {
		for _, chunk := range chunks {
			if !evidenceMatchesChunk(evidence, chunk) {
				continue
			}
			key := fmt.Sprintf("%s:%d:%d", chunk.FilePath, chunk.StartLine, chunk.EndLine)
			if _, ok := seen[key]; ok {
				continue
			}
			refs = append(refs, domain.DeepWikiSourceRef{Path: chunk.FilePath, StartLine: chunk.StartLine, EndLine: chunk.EndLine})
			seen[key] = struct{}{}
			break
		}
		if len(refs) >= 6 {
			return refs
		}
	}
	if len(refs) == 0 {
		for _, chunk := range chunks {
			key := fmt.Sprintf("%s:%d:%d", chunk.FilePath, chunk.StartLine, chunk.EndLine)
			if _, ok := seen[key]; ok {
				continue
			}
			refs = append(refs, domain.DeepWikiSourceRef{Path: chunk.FilePath, StartLine: chunk.StartLine, EndLine: chunk.EndLine})
			seen[key] = struct{}{}
			if len(refs) >= 3 {
				break
			}
		}
	}
	return refs
}

func evidenceMatchesChunk(evidence string, chunk *domain.DeepWikiChunk) bool {
	if chunk == nil {
		return false
	}
	evidence = strings.TrimSpace(evidence)
	if evidence == "" {
		return false
	}
	if evidence == chunk.FilePath {
		return true
	}
	if strings.HasSuffix(evidence, "/") {
		return strings.HasPrefix(chunk.FilePath, evidence)
	}
	return strings.Contains(chunk.FilePath, evidence)
}

func sourceRefLabel(ref domain.DeepWikiSourceRef) string {
	return fmt.Sprintf("[%s:%d-%d]", ref.Path, ref.StartLine, ref.EndLine)
}

func languageSummaryText(summary map[string]int) string {
	if len(summary) == 0 {
		return "none detected"
	}
	keys := make([]string, 0, len(summary))
	for key := range summary {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, fmt.Sprintf("%s (%d)", key, summary[key]))
	}
	return strings.Join(parts, ", ")
}

func listOrFallback(values []string, fallbackText string) string {
	if len(values) == 0 {
		return fallbackText
	}
	if len(values) > 8 {
		values = values[:8]
	}
	return strings.Join(values, ", ")
}

func fallback(value, fallbackText string) string {
	if strings.TrimSpace(value) == "" {
		return fallbackText
	}
	return value
}

func filterPaths(values []string, prefixes ...string) []string {
	out := []string{}
	for _, value := range values {
		for _, prefix := range prefixes {
			if strings.HasPrefix(value, prefix) || strings.Contains(value, prefix) {
				out = append(out, value)
				break
			}
		}
	}
	return out
}

func architectureMermaid(profile RepositoryProfile) string {
	nodes := []string{`Source["Repository Source"]`, `Reader["DeepWiki Reader"]`, `Analyzer["Analyzer"]`, `Index["Chunks And Keyword Index"]`, `Wiki["Generated Wiki Pages"]`}
	edges := []string{
		"Source --> Reader",
		"Reader --> Analyzer",
		"Analyzer --> Index",
		"Index --> Wiki",
	}
	if hasFrontend(profile) {
		nodes = append(nodes, `Frontend["Frontend App"]`)
		edges = append(edges, "Frontend --> Source")
	}
	if hasBackend(profile) {
		nodes = append(nodes, `Backend["Backend API"]`)
		edges = append(edges, "Backend --> Source")
	}
	return "graph TD\n  " + strings.Join(nodes, "\n  ") + "\n  " + strings.Join(edges, "\n  ")
}
