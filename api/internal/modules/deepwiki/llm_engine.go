package deepwiki

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"github.com/zgiai/luas/api/internal/capabilities/ai"
	"github.com/zgiai/luas/api/internal/domain"
)

const (
	deepWikiLLMPromptVersion = "deepwiki-llm-v1"
	maxLLMPlanPages          = 12
	maxLLMPlannerEvidence    = 24
	maxLLMPageEvidence       = 8
	maxLLMChunkChars         = 4000
	maxLLMRepairChars        = 4000
)

var deepWikiSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type deepWikiTextGenerator interface {
	GenerateText(ctx context.Context, req *ai.TextRequest) (*ai.TextResponse, error)
}

type llmWikiEngine struct {
	generator deepWikiTextGenerator
}

type llmGenerationMetadata struct {
	Mode          string
	Provider      string
	Model         string
	PromptVersion string
}

type llmPlanResponse struct {
	Pages []llmPlanPage `json:"pages"`
}

type llmPlanPage struct {
	Slug          string   `json:"slug"`
	Title         string   `json:"title"`
	PageType      string   `json:"page_type"`
	Purpose       string   `json:"purpose"`
	EvidencePaths []string `json:"evidence_paths"`
}

type llmPageResponse struct {
	Markdown   string                     `json:"markdown"`
	Mermaid    string                     `json:"mermaid"`
	SourceRefs []domain.DeepWikiSourceRef `json:"source_refs"`
}

type llmRepositoryPack struct {
	PromptVersion   string               `json:"prompt_version"`
	FileTree        []string             `json:"file_tree"`
	LanguageSummary map[string]int       `json:"language_summary"`
	Frameworks      []string             `json:"frameworks"`
	Entrypoints     []string             `json:"entrypoints"`
	Routes          []string             `json:"routes"`
	Services        []string             `json:"services"`
	Models          []string             `json:"models"`
	Configs         []string             `json:"configs"`
	TestFiles       []string             `json:"test_files"`
	CIFiles         []string             `json:"ci_files"`
	Docs            []string             `json:"docs"`
	PackageManager  string               `json:"package_manager,omitempty"`
	Evidence        []llmEvidenceSnippet `json:"evidence"`
}

type llmPagePack struct {
	PromptVersion string               `json:"prompt_version"`
	Page          llmPlanPage          `json:"page"`
	Repository    llmRepositorySummary `json:"repository"`
	Evidence      []llmEvidenceSnippet `json:"evidence"`
}

type llmRepositorySummary struct {
	FileTree        []string       `json:"file_tree"`
	LanguageSummary map[string]int `json:"language_summary"`
	Frameworks      []string       `json:"frameworks"`
	Entrypoints     []string       `json:"entrypoints"`
	Routes          []string       `json:"routes"`
	Services        []string       `json:"services"`
	Models          []string       `json:"models"`
	Configs         []string       `json:"configs"`
	PackageManager  string         `json:"package_manager,omitempty"`
}

type llmEvidenceSnippet struct {
	Label      string `json:"label"`
	Path       string `json:"path"`
	Language   string `json:"language"`
	SymbolName string `json:"symbol_name,omitempty"`
	StartLine  int    `json:"start_line"`
	EndLine    int    `json:"end_line"`
	Content    string `json:"content"`
}

func newLLMWikiEngine(generator deepWikiTextGenerator) llmWikiEngine {
	return llmWikiEngine{generator: generator}
}

func (e llmWikiEngine) Generate(ctx context.Context, indexID uint, profile RepositoryProfile, chunks []*domain.DeepWikiChunk) ([]*domain.DeepWikiPage, llmGenerationMetadata, error) {
	metadata := llmGenerationMetadata{
		Mode:          domain.DeepWikiGenerationModeLLM,
		PromptVersion: deepWikiLLMPromptVersion,
	}
	if e.generator == nil {
		return nil, metadata, fmt.Errorf("%w: deepwiki LLM generator is not configured", ai.ErrProviderUnavailable)
	}
	if len(chunks) == 0 {
		return nil, metadata, fmt.Errorf("deepwiki LLM requires at least one source chunk")
	}

	plans, resp, err := e.generatePlan(ctx, profile, chunks)
	if err != nil {
		return nil, metadata, err
	}
	metadata.Provider = strings.TrimSpace(resp.Provider)
	metadata.Model = strings.TrimSpace(resp.Model)

	pages := make([]*domain.DeepWikiPage, 0, len(plans))
	for i, plan := range plans {
		page, resp, err := e.generatePage(ctx, indexID, plan, profile, chunks, i+1)
		if err != nil {
			return nil, metadata, err
		}
		if metadata.Provider == "" {
			metadata.Provider = strings.TrimSpace(resp.Provider)
		}
		if metadata.Model == "" {
			metadata.Model = strings.TrimSpace(resp.Model)
		}
		pages = append(pages, page)
	}
	if metadata.Provider == "" {
		metadata.Provider = "unknown"
	}
	if metadata.Model == "" {
		metadata.Model = "unknown"
	}
	return pages, metadata, nil
}

func (e llmWikiEngine) generatePlan(ctx context.Context, profile RepositoryProfile, chunks []*domain.DeepWikiChunk) ([]WikiPagePlan, *ai.TextResponse, error) {
	pack := llmRepositoryPack{
		PromptVersion:   deepWikiLLMPromptVersion,
		FileTree:        profile.FileTree,
		LanguageSummary: profile.LanguageSummary,
		Frameworks:      profile.Frameworks,
		Entrypoints:     profile.Entrypoints,
		Routes:          profile.Routes,
		Services:        profile.Services,
		Models:          profile.Models,
		Configs:         profile.Configs,
		TestFiles:       profile.TestFiles,
		CIFiles:         profile.CIFiles,
		Docs:            profile.Docs,
		PackageManager:  profile.PackageManager,
		Evidence:        evidenceSnippets(selectRepositoryEvidence(profile, chunks), maxLLMChunkChars),
	}
	input := mustMarshalJSON(pack)
	instructions := strings.TrimSpace(`
You are generating a CodingCTO DeepWiki plan from repository evidence.
Return JSON only with this shape:
{"pages":[{"slug":"overview","title":"Overview","page_type":"overview","purpose":"...","evidence_paths":["README.md"]}]}
Rules:
- Generate 4 to 10 useful wiki pages for engineers.
- The page list must be based only on the file tree, repository profile, and evidence snippets.
- Every page must include at least one evidence_paths item that matches a repository file or directory from the input.
- Slugs must be lowercase kebab-case.
- Do not include Markdown, prose outside JSON, or unsupported claims.
`)

	var decoded llmPlanResponse
	resp, err := e.callJSON(ctx, instructions, input, func(text string) error {
		if err := decodeLLMJSON(text, &decoded); err != nil {
			return err
		}
		return validateLLMPlan(decoded, chunks)
	})
	if err != nil {
		return nil, resp, fmt.Errorf("generate deepwiki page plan: %w", err)
	}
	return llmPlansToWikiPlans(decoded.Pages), resp, nil
}

func (e llmWikiEngine) generatePage(ctx context.Context, indexID uint, plan WikiPagePlan, profile RepositoryProfile, chunks []*domain.DeepWikiChunk, order int) (*domain.DeepWikiPage, *ai.TextResponse, error) {
	evidence := selectChunksForPlan(plan, chunks, maxLLMPageEvidence)
	if len(evidence) == 0 {
		return nil, nil, fmt.Errorf("page %s has no matching evidence chunks", plan.Slug)
	}
	pagePack := llmPagePack{
		PromptVersion: deepWikiLLMPromptVersion,
		Page: llmPlanPage{
			Slug:          plan.Slug,
			Title:         plan.Title,
			PageType:      plan.PageType,
			Purpose:       plan.Purpose,
			EvidencePaths: plan.RequiredEvidence,
		},
		Repository: llmRepositorySummary{
			FileTree:        profile.FileTree,
			LanguageSummary: profile.LanguageSummary,
			Frameworks:      profile.Frameworks,
			Entrypoints:     profile.Entrypoints,
			Routes:          profile.Routes,
			Services:        profile.Services,
			Models:          profile.Models,
			Configs:         profile.Configs,
			PackageManager:  profile.PackageManager,
		},
		Evidence: evidenceSnippets(evidence, maxLLMChunkChars),
	}
	input := mustMarshalJSON(pagePack)
	instructions := strings.TrimSpace(`
You are writing one CodingCTO DeepWiki page from repository evidence.
Return JSON only with this shape:
{"markdown":"# Title\n\n...","mermaid":"graph TD\n  A --> B","source_refs":[{"path":"README.md","start_line":1,"end_line":4}]}
Rules:
- Write polished English Markdown for engineers onboarding to this repository.
- Use only facts supported by the provided evidence snippets.
- Include at least one source_refs item, and every source ref must point to a provided evidence snippet path and line range.
- Do not invent files, commands, modules, routes, or architecture relationships.
- If evidence is insufficient, say what is unknown instead of guessing.
- Mermaid may be empty unless the page benefits from a diagram.
- Do not include prose outside JSON.
`)

	var decoded llmPageResponse
	resp, err := e.callJSON(ctx, instructions, input, func(text string) error {
		if err := decodeLLMJSON(text, &decoded); err != nil {
			return err
		}
		return validateLLMPage(decoded, evidence)
	})
	if err != nil {
		return nil, resp, fmt.Errorf("generate deepwiki page %s: %w", plan.Slug, err)
	}
	return &domain.DeepWikiPage{
		IndexID:    indexID,
		Slug:       plan.Slug,
		Title:      plan.Title,
		PageType:   plan.PageType,
		Markdown:   strings.TrimSpace(decoded.Markdown),
		Mermaid:    strings.TrimSpace(decoded.Mermaid),
		SourceRefs: decoded.SourceRefs,
		OrderIndex: order,
		Status:     domain.DeepWikiStatusReady,
	}, resp, nil
}

func (e llmWikiEngine) callJSON(ctx context.Context, instructions, input string, validate func(string) error) (*ai.TextResponse, error) {
	var lastErr error
	var lastText string
	for attempt := 0; attempt < 2; attempt++ {
		requestInput := input
		if attempt > 0 {
			requestInput = input + "\n\nPrevious response was invalid:\n" + lastErr.Error() + "\n\nPrevious response:\n" + truncateString(lastText, maxLLMRepairChars) + "\n\nReturn corrected JSON only."
		}
		resp, err := e.generator.GenerateText(ctx, &ai.TextRequest{
			Input:           requestInput,
			Instructions:    instructions,
			ReasoningEffort: "low",
		})
		if err != nil {
			return resp, err
		}
		if resp == nil {
			return nil, ai.ErrEmptyResponseText
		}
		lastText = resp.Text
		if strings.TrimSpace(lastText) == "" {
			lastErr = ai.ErrEmptyResponseText
			continue
		}
		if err := validate(lastText); err != nil {
			lastErr = err
			continue
		}
		return resp, nil
	}
	return nil, lastErr
}

func validateLLMPlan(plan llmPlanResponse, chunks []*domain.DeepWikiChunk) error {
	if len(plan.Pages) == 0 {
		return fmt.Errorf("pages is required")
	}
	if len(plan.Pages) > maxLLMPlanPages {
		return fmt.Errorf("pages exceeds limit %d", maxLLMPlanPages)
	}
	seen := map[string]struct{}{}
	for _, page := range plan.Pages {
		slug := strings.TrimSpace(page.Slug)
		if slug == "" || !deepWikiSlugPattern.MatchString(slug) {
			return fmt.Errorf("page slug %q must be lowercase kebab-case", page.Slug)
		}
		if _, ok := seen[slug]; ok {
			return fmt.Errorf("duplicate page slug %q", slug)
		}
		seen[slug] = struct{}{}
		if strings.TrimSpace(page.Title) == "" {
			return fmt.Errorf("page %s title is required", slug)
		}
		if strings.TrimSpace(page.PageType) == "" {
			return fmt.Errorf("page %s page_type is required", slug)
		}
		if strings.TrimSpace(page.Purpose) == "" {
			return fmt.Errorf("page %s purpose is required", slug)
		}
		if len(compactStrings(page.EvidencePaths)) == 0 {
			return fmt.Errorf("page %s evidence_paths is required", slug)
		}
		if len(selectChunksForEvidence(page.EvidencePaths, chunks, 1)) == 0 {
			return fmt.Errorf("page %s evidence_paths do not match repository chunks", slug)
		}
	}
	return nil
}

func validateLLMPage(page llmPageResponse, evidence []*domain.DeepWikiChunk) error {
	if strings.TrimSpace(page.Markdown) == "" {
		return fmt.Errorf("markdown is required")
	}
	if len(page.SourceRefs) == 0 {
		return fmt.Errorf("source_refs is required")
	}
	for _, ref := range page.SourceRefs {
		if !sourceRefWithinChunks(ref, evidence) {
			return fmt.Errorf("source_ref %s is not in the provided evidence", sourceRefLabel(ref))
		}
	}
	return nil
}

func decodeLLMJSON(text string, out any) error {
	payload := extractJSONPayload(text)
	if payload == "" {
		return fmt.Errorf("response did not contain a JSON object")
	}
	if err := json.Unmarshal([]byte(payload), out); err != nil {
		return fmt.Errorf("decode JSON: %w", err)
	}
	return nil
}

func extractJSONPayload(text string) string {
	text = strings.TrimSpace(text)
	if strings.HasPrefix(text, "```") {
		lines := strings.Split(text, "\n")
		if len(lines) >= 3 {
			text = strings.Join(lines[1:len(lines)-1], "\n")
		}
	}
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end < start {
		return ""
	}
	return strings.TrimSpace(text[start : end+1])
}

func llmPlansToWikiPlans(pages []llmPlanPage) []WikiPagePlan {
	plans := make([]WikiPagePlan, 0, len(pages))
	for _, page := range pages {
		plans = append(plans, WikiPagePlan{
			Slug:             strings.TrimSpace(page.Slug),
			Title:            strings.TrimSpace(page.Title),
			PageType:         strings.TrimSpace(page.PageType),
			Purpose:          strings.TrimSpace(page.Purpose),
			RequiredEvidence: compactStrings(page.EvidencePaths),
		})
	}
	return plans
}

func selectRepositoryEvidence(profile RepositoryProfile, chunks []*domain.DeepWikiChunk) []*domain.DeepWikiChunk {
	evidence := append([]string{}, profile.Docs...)
	evidence = append(evidence, profile.Entrypoints...)
	evidence = append(evidence, profile.Configs...)
	evidence = append(evidence, profile.Routes...)
	evidence = append(evidence, profile.Services...)
	evidence = append(evidence, profile.Models...)
	evidence = append(evidence, profile.CIFiles...)
	selected := selectChunksForEvidence(evidence, chunks, maxLLMPlannerEvidence)
	if len(selected) >= maxLLMPlannerEvidence {
		return selected
	}
	seen := chunkKeySet(selected)
	for _, chunk := range sortedChunks(chunks) {
		if len(selected) >= maxLLMPlannerEvidence {
			break
		}
		key := chunkKey(chunk)
		if _, ok := seen[key]; ok {
			continue
		}
		selected = append(selected, chunk)
		seen[key] = struct{}{}
	}
	return selected
}

func selectChunksForPlan(plan WikiPagePlan, chunks []*domain.DeepWikiChunk, limit int) []*domain.DeepWikiChunk {
	return selectChunksForEvidence(plan.RequiredEvidence, chunks, limit)
}

func selectChunksForEvidence(evidence []string, chunks []*domain.DeepWikiChunk, limit int) []*domain.DeepWikiChunk {
	if limit <= 0 {
		limit = maxLLMPageEvidence
	}
	selected := []*domain.DeepWikiChunk{}
	seen := map[string]struct{}{}
	for _, item := range compactStrings(evidence) {
		for _, chunk := range sortedChunks(chunks) {
			if !evidenceMatchesChunk(item, chunk) {
				continue
			}
			key := chunkKey(chunk)
			if _, ok := seen[key]; ok {
				continue
			}
			selected = append(selected, chunk)
			seen[key] = struct{}{}
			if len(selected) >= limit {
				return selected
			}
			break
		}
	}
	return selected
}

func sortedChunks(chunks []*domain.DeepWikiChunk) []*domain.DeepWikiChunk {
	out := append([]*domain.DeepWikiChunk(nil), chunks...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i] == nil {
			return false
		}
		if out[j] == nil {
			return true
		}
		if out[i].FilePath == out[j].FilePath {
			return out[i].StartLine < out[j].StartLine
		}
		return out[i].FilePath < out[j].FilePath
	})
	return out
}

func evidenceSnippets(chunks []*domain.DeepWikiChunk, maxChars int) []llmEvidenceSnippet {
	out := make([]llmEvidenceSnippet, 0, len(chunks))
	for _, chunk := range chunks {
		if chunk == nil {
			continue
		}
		ref := domain.DeepWikiSourceRef{
			Path:      chunk.FilePath,
			StartLine: chunk.StartLine,
			EndLine:   chunk.EndLine,
		}
		out = append(out, llmEvidenceSnippet{
			Label:      sourceRefLabel(ref),
			Path:       chunk.FilePath,
			Language:   chunk.Language,
			SymbolName: chunk.SymbolName,
			StartLine:  chunk.StartLine,
			EndLine:    chunk.EndLine,
			Content:    truncateString(chunk.Content, maxChars),
		})
	}
	return out
}

func sourceRefWithinChunks(ref domain.DeepWikiSourceRef, chunks []*domain.DeepWikiChunk) bool {
	if strings.TrimSpace(ref.Path) == "" || ref.StartLine <= 0 || ref.EndLine < ref.StartLine {
		return false
	}
	for _, chunk := range chunks {
		if chunk == nil || chunk.FilePath != ref.Path {
			continue
		}
		if ref.StartLine >= chunk.StartLine && ref.EndLine <= chunk.EndLine {
			return true
		}
	}
	return false
}

func chunkKeySet(chunks []*domain.DeepWikiChunk) map[string]struct{} {
	seen := map[string]struct{}{}
	for _, chunk := range chunks {
		seen[chunkKey(chunk)] = struct{}{}
	}
	return seen
}

func chunkKey(chunk *domain.DeepWikiChunk) string {
	if chunk == nil {
		return ""
	}
	return fmt.Sprintf("%s:%d:%d", chunk.FilePath, chunk.StartLine, chunk.EndLine)
}

func compactStrings(values []string) []string {
	out := []string{}
	seen := map[string]struct{}{}
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

func mustMarshalJSON(value any) string {
	payload, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return "{}"
	}
	return string(payload)
}

func truncateString(value string, maxChars int) string {
	value = strings.TrimSpace(value)
	if maxChars <= 0 || len(value) <= maxChars {
		return value
	}
	if maxChars <= 20 {
		return value[:maxChars]
	}
	return value[:maxChars-16] + "\n...[truncated]"
}
