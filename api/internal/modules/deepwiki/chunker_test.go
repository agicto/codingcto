package deepwiki

import "testing"

func TestChunkerPrefersSymbols(t *testing.T) {
	snapshot := &RepositorySnapshot{Files: []RepositoryFile{{
		Path:     "api/internal/modules/user/service.go",
		Language: "go",
		Content:  "package user\n\nfunc NewService() {}\n\nfunc (s *service) Create() {}\n",
	}}}

	chunks := newChunker().Chunk(7, snapshot)
	if len(chunks) != 2 {
		t.Fatalf("expected 2 chunks, got %d", len(chunks))
	}
	if chunks[0].IndexID != 7 || chunks[0].SymbolName != "NewService" {
		t.Fatalf("unexpected first chunk: %#v", chunks[0])
	}
	if chunks[1].SymbolName != "Create" {
		t.Fatalf("unexpected second chunk symbol: %q", chunks[1].SymbolName)
	}
}

func TestChunkerSplitsMarkdownByHeading(t *testing.T) {
	snapshot := &RepositorySnapshot{Files: []RepositoryFile{{
		Path:     "README.md",
		Language: "markdown",
		Content:  "# Intro\nhello\n\n## Setup\nrun it\n",
	}}}

	chunks := newChunker().Chunk(1, snapshot)
	if len(chunks) != 2 {
		t.Fatalf("expected 2 markdown chunks, got %d", len(chunks))
	}
	if chunks[0].SymbolName != "Intro" || chunks[1].SymbolName != "Setup" {
		t.Fatalf("unexpected markdown symbols: %q %q", chunks[0].SymbolName, chunks[1].SymbolName)
	}
}
