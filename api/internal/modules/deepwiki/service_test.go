package deepwiki

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/zgiai/luas/api/internal/capabilities/ai"
	"github.com/zgiai/luas/api/internal/domain"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type fakeRepoReader struct {
	snapshot *RepositorySnapshot
}

func (r fakeRepoReader) Read(context.Context, *domain.DeepWikiSource, string) (*RepositorySnapshot, error) {
	return r.snapshot, nil
}

func TestServiceIndexesSourceAndSupportsSearchAndSnippets(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&SourcePO{}, &IndexPO{}, &ChunkPO{}, &PagePO{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := NewRepository(db)
	llm := &fakeTextGenerator{responses: []string{
		`{"pages":[{"slug":"overview","title":"Overview","page_type":"overview","purpose":"Explain the repository purpose.","evidence_paths":["README.md"]},{"slug":"architecture","title":"Architecture","page_type":"architecture","purpose":"Explain the service flow.","evidence_paths":["api/routes/api.go","api/internal/modules/project/service.go"]}]}`,
		`{"markdown":"# Overview\n\nCodingCTO repository overview from LLM evidence.","mermaid":"","source_refs":[{"path":"README.md","start_line":1,"end_line":3}]}`,
		`{"markdown":"# Architecture\n\nThe API routes call project services including CreateProject.","mermaid":"graph TD\n  Routes --> Services","source_refs":[{"path":"api/routes/api.go","start_line":1,"end_line":1}]}`,
	}}
	svc := NewService(repo, fakeRepoReader{snapshot: representativeSnapshot()}, nil)
	svc.generator = newLLMWikiEngine(llm)
	svc.now = func() time.Time { return time.Date(2026, 6, 10, 12, 0, 0, 0, time.UTC) }

	source, err := svc.CreateSource(context.Background(), 42, &CreateSourceRequest{
		SourceType: domain.DeepWikiSourceTypeLocalPath,
		LocalPath:  "/tmp/example",
	})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}

	index, err := svc.IndexSource(context.Background(), 42, source.ID, &IndexSourceRequest{})
	if err != nil {
		t.Fatalf("index source: %v", err)
	}
	if index.Status != domain.DeepWikiStatusReady {
		t.Fatalf("expected ready index, got %q", index.Status)
	}
	if index.GenerationMode != domain.DeepWikiGenerationModeLLM || index.GeneratorProvider != ai.ProviderOpenAI || index.GeneratorModel != "gpt-5" {
		t.Fatalf("unexpected generation metadata: %#v", index)
	}
	if index.FileCount != 10 || index.ChunkCount == 0 {
		t.Fatalf("unexpected index counts: %#v", index)
	}

	pages, err := svc.ListPages(context.Background(), 42, index.ID)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) != 2 {
		t.Fatalf("expected two generated pages, got %d", len(pages))
	}
	if pages[1].Mermaid == "" {
		t.Fatalf("expected architecture page to include mermaid")
	}
	if pages[0].Markdown != "# Overview\n\nCodingCTO repository overview from LLM evidence." {
		t.Fatalf("expected LLM markdown, got %q", pages[0].Markdown)
	}

	results, err := svc.Search(context.Background(), 42, index.ID, "CreateProject")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("expected search results for CreateProject")
	}

	snippet, err := svc.SourceSnippet(context.Background(), 42, index.ID, "api/internal/modules/project/service.go", 1, 20)
	if err != nil {
		t.Fatalf("source snippet: %v", err)
	}
	if snippet.Path != "api/internal/modules/project/service.go" || snippet.Content == "" {
		t.Fatalf("unexpected snippet: %#v", snippet)
	}

	readySource, err := svc.GetSource(context.Background(), 42, source.ID)
	if err != nil {
		t.Fatalf("get source: %v", err)
	}
	if readySource.Status != domain.DeepWikiStatusReady || readySource.LastIndexedAt == nil {
		t.Fatalf("expected ready source with indexed timestamp, got %#v", readySource)
	}
}

func TestServiceFailsIndexWhenAIUnavailable(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&SourcePO{}, &IndexPO{}, &ChunkPO{}, &PagePO{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := NewRepository(db)
	svc := NewService(repo, fakeRepoReader{snapshot: representativeSnapshot()}, nil)

	source, err := svc.CreateSource(context.Background(), 42, &CreateSourceRequest{
		SourceType: domain.DeepWikiSourceTypeLocalPath,
		LocalPath:  "/tmp/example",
	})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	_, err = svc.IndexSource(context.Background(), 42, source.ID, &IndexSourceRequest{})
	if err == nil {
		t.Fatal("expected AI unavailable error")
	}
	failedSource, err := svc.GetSource(context.Background(), 42, source.ID)
	if err != nil {
		t.Fatalf("get source: %v", err)
	}
	if failedSource.Status != domain.DeepWikiStatusFailed || failedSource.LastFailure != domain.DeepWikiFailureGenerate {
		t.Fatalf("unexpected failed source: %#v", failedSource)
	}
	index, err := repo.FindLatestIndexBySourceID(context.Background(), source.ID)
	if err != nil {
		t.Fatalf("find latest index: %v", err)
	}
	if index.Status != domain.DeepWikiStatusFailed || index.GenerationMode != domain.DeepWikiGenerationModeLLM {
		t.Fatalf("unexpected failed index: %#v", index)
	}
}

func TestRepositoryFindLatestIndexBySourceIDUsesLastUpdatedIndex(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&SourcePO{}, &IndexPO{}, &ChunkPO{}, &PagePO{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := NewRepository(db)
	source := &domain.DeepWikiSource{
		CreatedBy:  42,
		SourceType: domain.DeepWikiSourceTypeLocalPath,
		LocalPath:  "/tmp/example",
		Status:     domain.DeepWikiStatusReady,
	}
	if err := repo.CreateSource(context.Background(), source); err != nil {
		t.Fatalf("create source: %v", err)
	}
	base := time.Date(2026, 6, 14, 10, 0, 0, 0, time.UTC)
	ready := &domain.DeepWikiIndex{
		SourceID:  source.ID,
		CommitSHA: "ready",
		Status:    domain.DeepWikiStatusReady,
		CreatedAt: base,
		UpdatedAt: base.Add(3 * time.Minute),
	}
	if err := repo.CreateIndex(context.Background(), ready); err != nil {
		t.Fatalf("create ready index: %v", err)
	}
	staleGenerating := &domain.DeepWikiIndex{
		SourceID:  source.ID,
		CommitSHA: "stale",
		Status:    domain.DeepWikiStatusGenerating,
		CreatedAt: base.Add(30 * time.Second),
		UpdatedAt: base.Add(30 * time.Second),
	}
	if err := repo.CreateIndex(context.Background(), staleGenerating); err != nil {
		t.Fatalf("create stale generating index: %v", err)
	}

	latest, err := repo.FindLatestIndexBySourceID(context.Background(), source.ID)
	if err != nil {
		t.Fatalf("find latest index: %v", err)
	}
	if latest.ID != ready.ID {
		t.Fatalf("latest index id = %d, want ready index %d", latest.ID, ready.ID)
	}
}

func TestServiceRetriesInvalidLLMJSON(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&SourcePO{}, &IndexPO{}, &ChunkPO{}, &PagePO{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := NewRepository(db)
	llm := &fakeTextGenerator{responses: []string{
		`not json`,
		`{"pages":[{"slug":"overview","title":"Overview","page_type":"overview","purpose":"Explain the repository purpose.","evidence_paths":["README.md"]}]}`,
		`{"markdown":"# Overview\n\nRecovered after retry.","mermaid":"","source_refs":[{"path":"README.md","start_line":1,"end_line":3}]}`,
	}}
	svc := NewService(repo, fakeRepoReader{snapshot: representativeSnapshot()}, nil)
	svc.generator = newLLMWikiEngine(llm)
	source, err := svc.CreateSource(context.Background(), 42, &CreateSourceRequest{
		SourceType: domain.DeepWikiSourceTypeLocalPath,
		LocalPath:  "/tmp/example",
	})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	index, err := svc.IndexSource(context.Background(), 42, source.ID, &IndexSourceRequest{})
	if err != nil {
		t.Fatalf("index source: %v", err)
	}
	if index.Status != domain.DeepWikiStatusReady {
		t.Fatalf("expected ready index, got %q", index.Status)
	}
	if llm.calls != 3 {
		t.Fatalf("expected retry plus page call, got %d", llm.calls)
	}
}

func TestServiceRejectsInvalidLLMSourceRefs(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	if err := db.AutoMigrate(&SourcePO{}, &IndexPO{}, &ChunkPO{}, &PagePO{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	repo := NewRepository(db)
	llm := &fakeTextGenerator{responses: []string{
		`{"pages":[{"slug":"overview","title":"Overview","page_type":"overview","purpose":"Explain the repository purpose.","evidence_paths":["README.md"]}]}`,
		`{"markdown":"# Overview\n\nBad ref.","mermaid":"","source_refs":[{"path":"missing.go","start_line":1,"end_line":1}]}`,
		`{"markdown":"# Overview\n\nStill bad.","mermaid":"","source_refs":[{"path":"missing.go","start_line":1,"end_line":1}]}`,
	}}
	svc := NewService(repo, fakeRepoReader{snapshot: representativeSnapshot()}, nil)
	svc.generator = newLLMWikiEngine(llm)
	source, err := svc.CreateSource(context.Background(), 42, &CreateSourceRequest{
		SourceType: domain.DeepWikiSourceTypeLocalPath,
		LocalPath:  "/tmp/example",
	})
	if err != nil {
		t.Fatalf("create source: %v", err)
	}
	_, err = svc.IndexSource(context.Background(), 42, source.ID, &IndexSourceRequest{})
	if err == nil {
		t.Fatal("expected invalid source ref error")
	}
	failedSource, err := svc.GetSource(context.Background(), 42, source.ID)
	if err != nil {
		t.Fatalf("get source: %v", err)
	}
	if failedSource.Status != domain.DeepWikiStatusFailed || failedSource.LastFailure != domain.DeepWikiFailureGenerate {
		t.Fatalf("unexpected failed source: %#v", failedSource)
	}
}

func TestIndexResponseDefaultsLegacyGenerationMode(t *testing.T) {
	resp := indexResponse(&domain.DeepWikiIndex{ID: 1})
	if resp.GenerationMode != domain.DeepWikiGenerationModeLegacyTemplate {
		t.Fatalf("generation mode = %q, want %q", resp.GenerationMode, domain.DeepWikiGenerationModeLegacyTemplate)
	}
}

type fakeTextGenerator struct {
	responses []string
	err       error
	calls     int
}

func (f *fakeTextGenerator) GenerateText(context.Context, *ai.TextRequest) (*ai.TextResponse, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	if len(f.responses) == 0 {
		return nil, errors.New("fake text generator exhausted")
	}
	text := f.responses[0]
	f.responses = f.responses[1:]
	return &ai.TextResponse{
		ID:       "resp_fake",
		Provider: ai.ProviderOpenAI,
		Model:    "gpt-5",
		Text:     text,
	}, nil
}

func representativeSnapshot() *RepositorySnapshot {
	return &RepositorySnapshot{
		CommitSHA: "abc123",
		Branch:    "main",
		Files: []RepositoryFile{
			{Path: "README.md", Language: "markdown", Content: "# CodingCTO\n\nRepository docs."},
			{Path: "api/go.mod", Language: "go", Content: "module example"},
			{Path: "api/routes/api.go", Language: "go", Content: "func RegisterAPI() { r.GET(\"/health\", nil) }"},
			{Path: "api/internal/modules/project/service.go", Language: "go", Content: "package project\n\nfunc (s *service) CreateProject() {}\n"},
			{Path: "api/internal/modules/project/model.go", Language: "go", Content: "package project\n\ntype ProjectPO struct{}"},
			{Path: "api/internal/modules/project/service_test.go", Language: "go", Content: "package project\n\nfunc TestCreateProject(t *testing.T) {}"},
			{Path: "api/config/config.go", Language: "go", Content: "package config"},
			{Path: "web/package.json", Language: "json", Content: `{"packageManager":"pnpm@10.0.0","dependencies":{"next":"16.0.0","react":"19.0.0"}}`},
			{Path: "web/src/app/page.tsx", Language: "typescript", Content: "export default function Page() { return null }"},
			{Path: ".github/workflows/test.yml", Language: "yaml", Content: "name: test"},
		},
	}
}
