package deepwiki

import (
	"context"
	"testing"
	"time"

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
	svc := NewService(repo, fakeRepoReader{snapshot: representativeSnapshot()})
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
	if index.FileCount != 10 || index.ChunkCount == 0 {
		t.Fatalf("unexpected index counts: %#v", index)
	}

	pages, err := svc.ListPages(context.Background(), 42, index.ID)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) < 5 {
		t.Fatalf("expected at least five pages, got %d", len(pages))
	}
	if pages[1].Mermaid == "" {
		t.Fatalf("expected architecture page to include mermaid")
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
