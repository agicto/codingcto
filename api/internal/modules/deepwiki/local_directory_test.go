package deepwiki

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/zgiai/luas/api/internal/domain"
)

func TestBrowseLocalDirectories(t *testing.T) {
	root := t.TempDir()
	alpha := filepath.Join(root, "alpha")
	beta := filepath.Join(root, "Beta")
	if err := os.Mkdir(alpha, 0o755); err != nil {
		t.Fatalf("mkdir alpha: %v", err)
	}
	if err := os.Mkdir(beta, 0o755); err != nil {
		t.Fatalf("mkdir beta: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "README.md"), []byte("skip files"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	svc := NewService(nil, nil)
	result, err := svc.BrowseLocalDirectories(context.Background(), 1, root)
	if err != nil {
		t.Fatalf("browse local directories: %v", err)
	}
	if result.Path != root {
		t.Fatalf("expected path %q, got %q", root, result.Path)
	}
	if result.ParentPath != filepath.Dir(root) {
		t.Fatalf("expected parent path %q, got %q", filepath.Dir(root), result.ParentPath)
	}
	if len(result.Entries) != 2 {
		t.Fatalf("expected 2 directory entries, got %d", len(result.Entries))
	}
	if result.Entries[0].Name != "alpha" || result.Entries[0].Path != alpha {
		t.Fatalf("expected alpha first, got %#v", result.Entries[0])
	}
	if result.Entries[1].Name != "Beta" || result.Entries[1].Path != beta {
		t.Fatalf("expected Beta second, got %#v", result.Entries[1])
	}
}

func TestBrowseLocalDirectoriesRejectsFiles(t *testing.T) {
	root := t.TempDir()
	filePath := filepath.Join(root, "README.md")
	if err := os.WriteFile(filePath, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	svc := NewService(nil, nil)
	_, err := svc.BrowseLocalDirectories(context.Background(), 1, filePath)
	if !errors.Is(err, domain.ErrInvalidInput) {
		t.Fatalf("expected invalid input, got %v", err)
	}
}
