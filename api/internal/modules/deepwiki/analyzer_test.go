package deepwiki

import "testing"

func TestRepositoryAnalyzerDetectsFrameworksAndStructure(t *testing.T) {
	snapshot := &RepositorySnapshot{Files: []RepositoryFile{
		{Path: "api/go.mod", Language: "go", Content: "module example"},
		{Path: "api/routes/api.go", Language: "go", Content: "r.GET(\"/health\", handler)"},
		{Path: "api/internal/modules/user/service.go", Language: "go", Content: "package user"},
		{Path: "api/internal/modules/user/model.go", Language: "go", Content: "type UserPO struct{}"},
		{Path: "web/package.json", Language: "json", Content: `{"packageManager":"pnpm@10.0.0","dependencies":{"next":"16.0.0","react":"19.0.0"}}`},
		{Path: "web/src/app/page.tsx", Language: "typescript", Content: "export default function Page() { return null }"},
		{Path: ".github/workflows/test.yml", Language: "yaml", Content: "name: test"},
	}}

	profile := newRepositoryAnalyzer().Analyze(snapshot)

	if profile.LanguageSummary["go"] != 4 {
		t.Fatalf("expected go file count, got %#v", profile.LanguageSummary)
	}
	if profile.PackageManager != "pnpm" {
		t.Fatalf("expected pnpm package manager, got %q", profile.PackageManager)
	}
	assertContains(t, profile.Frameworks, "Next.js")
	assertContains(t, profile.Frameworks, "React")
	assertContains(t, profile.Routes, "api/routes/api.go")
	assertContains(t, profile.Routes, "web/src/app/page.tsx")
	assertContains(t, profile.Services, "api/internal/modules/user/service.go")
	assertContains(t, profile.Models, "api/internal/modules/user/model.go")
	assertContains(t, profile.CIFiles, ".github/workflows/test.yml")
}

func assertContains(t *testing.T, values []string, expected string) {
	t.Helper()
	for _, value := range values {
		if value == expected {
			return
		}
	}
	t.Fatalf("expected %q in %#v", expected, values)
}
