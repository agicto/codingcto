package deepwiki

import (
	"encoding/json"
	"path/filepath"
	"sort"
	"strings"
)

type RepositoryProfile struct {
	LanguageSummary map[string]int
	FileTree        []string
	Entrypoints     []string
	Routes          []string
	Services        []string
	Models          []string
	Configs         []string
	Frameworks      []string
	PackageManager  string
	TestFiles       []string
	CIFiles         []string
	Docs            []string
}

type repositoryAnalyzer struct{}

func newRepositoryAnalyzer() repositoryAnalyzer {
	return repositoryAnalyzer{}
}

func (repositoryAnalyzer) Analyze(snapshot *RepositorySnapshot) RepositoryProfile {
	profile := RepositoryProfile{
		LanguageSummary: map[string]int{},
		FileTree:        []string{},
		Entrypoints:     []string{},
		Routes:          []string{},
		Services:        []string{},
		Models:          []string{},
		Configs:         []string{},
		Frameworks:      []string{},
		TestFiles:       []string{},
		CIFiles:         []string{},
		Docs:            []string{},
	}
	if snapshot == nil {
		return profile
	}
	for _, file := range snapshot.Files {
		path := filepath.ToSlash(file.Path)
		lower := strings.ToLower(path)
		base := strings.ToLower(filepath.Base(path))
		profile.FileTree = append(profile.FileTree, path)
		profile.LanguageSummary[file.Language]++

		switch {
		case path == "go.mod", strings.HasSuffix(path, "/go.mod"):
			profile.Frameworks = append(profile.Frameworks, "Go")
			profile.Configs = append(profile.Configs, path)
		case base == "package.json":
			profile.Configs = append(profile.Configs, path)
			profile.PackageManager = packageManagerFromPackageJSON(file.Content, profile.PackageManager)
			if strings.Contains(file.Content, `"next"`) {
				profile.Frameworks = append(profile.Frameworks, "Next.js")
			}
			if strings.Contains(file.Content, `"react"`) {
				profile.Frameworks = append(profile.Frameworks, "React")
			}
		case base == "pnpm-lock.yaml":
			profile.PackageManager = "pnpm"
			profile.Configs = append(profile.Configs, path)
		case base == "yarn.lock":
			profile.PackageManager = "yarn"
			profile.Configs = append(profile.Configs, path)
		case base == "package-lock.json":
			profile.PackageManager = "npm"
			profile.Configs = append(profile.Configs, path)
		case base == "pyproject.toml", base == "requirements.txt":
			profile.Frameworks = append(profile.Frameworks, "Python")
			profile.Configs = append(profile.Configs, path)
		case base == "pom.xml", base == "build.gradle", base == "build.gradle.kts":
			profile.Frameworks = append(profile.Frameworks, "Java")
			profile.Configs = append(profile.Configs, path)
		case strings.Contains(lower, ".github/workflows/"):
			profile.CIFiles = append(profile.CIFiles, path)
			profile.Configs = append(profile.Configs, path)
		case isConfigFile(base):
			profile.Configs = append(profile.Configs, path)
		}

		if isEntrypoint(path, file.Content) {
			profile.Entrypoints = append(profile.Entrypoints, path)
		}
		if isRouteFile(path, file.Content) {
			profile.Routes = append(profile.Routes, path)
		}
		if isServiceFile(path) {
			profile.Services = append(profile.Services, path)
		}
		if isModelFile(path) {
			profile.Models = append(profile.Models, path)
		}
		if isTestFile(path) {
			profile.TestFiles = append(profile.TestFiles, path)
		}
		if file.Language == "markdown" {
			profile.Docs = append(profile.Docs, path)
		}
		if strings.Contains(file.Content, "github.com/gin-gonic/gin") || strings.Contains(file.Content, "*gin.Engine") {
			profile.Frameworks = append(profile.Frameworks, "Gin")
		}
		if strings.Contains(path, "src/app/") && (strings.HasSuffix(path, "/page.tsx") || strings.HasSuffix(path, "/layout.tsx")) {
			profile.Frameworks = append(profile.Frameworks, "Next.js App Router")
		}
	}

	profile.FileTree = uniqueSorted(profile.FileTree)
	profile.Entrypoints = uniqueSorted(profile.Entrypoints)
	profile.Routes = uniqueSorted(profile.Routes)
	profile.Services = uniqueSorted(profile.Services)
	profile.Models = uniqueSorted(profile.Models)
	profile.Configs = uniqueSorted(profile.Configs)
	profile.Frameworks = uniqueSorted(profile.Frameworks)
	profile.TestFiles = uniqueSorted(profile.TestFiles)
	profile.CIFiles = uniqueSorted(profile.CIFiles)
	profile.Docs = uniqueSorted(profile.Docs)
	return profile
}

func packageManagerFromPackageJSON(content, current string) string {
	var packageJSON struct {
		PackageManager string `json:"packageManager"`
	}
	if err := json.Unmarshal([]byte(content), &packageJSON); err == nil {
		switch {
		case strings.HasPrefix(packageJSON.PackageManager, "pnpm"):
			return "pnpm"
		case strings.HasPrefix(packageJSON.PackageManager, "yarn"):
			return "yarn"
		case strings.HasPrefix(packageJSON.PackageManager, "npm"):
			return "npm"
		}
	}
	if current != "" {
		return current
	}
	return "npm"
}

func isConfigFile(base string) bool {
	switch base {
	case "dockerfile", "makefile", "tsconfig.json", "next.config.ts", "next.config.js", "vite.config.ts", "tailwind.config.ts", "eslint.config.mjs", ".eslintrc", ".prettierrc", "go.work", "air.toml":
		return true
	}
	return strings.HasSuffix(base, ".config.ts") || strings.HasSuffix(base, ".config.js") || strings.HasSuffix(base, ".config.mjs")
}

func isEntrypoint(path, content string) bool {
	base := strings.ToLower(filepath.Base(path))
	if path == "main.go" || strings.HasSuffix(path, "/main.go") || base == "app.py" || base == "main.py" {
		return true
	}
	if strings.HasPrefix(path, "cmd/") && strings.HasSuffix(path, "/main.go") {
		return true
	}
	if base == "package.json" && strings.Contains(content, `"scripts"`) {
		return true
	}
	return false
}

func isRouteFile(path, content string) bool {
	lower := strings.ToLower(path)
	if strings.HasSuffix(lower, "/routes.go") || strings.HasSuffix(lower, "/route.ts") || strings.HasSuffix(lower, "/page.tsx") {
		return true
	}
	return strings.Contains(content, ".GET(") || strings.Contains(content, ".POST(") || strings.Contains(content, ".PATCH(") || strings.Contains(content, ".DELETE(")
}

func isServiceFile(path string) bool {
	lower := strings.ToLower(path)
	return strings.HasSuffix(lower, "/service.go") ||
		strings.Contains(lower, "/services/") ||
		strings.HasSuffix(lower, "-service.ts") ||
		strings.HasSuffix(lower, "_service.py")
}

func isModelFile(path string) bool {
	lower := strings.ToLower(path)
	base := filepath.Base(lower)
	return base == "model.go" ||
		strings.Contains(lower, "/models/") ||
		strings.Contains(lower, "/domain/") ||
		strings.Contains(lower, "/entities/") ||
		strings.HasSuffix(lower, ".entity.ts")
}

func isTestFile(path string) bool {
	lower := strings.ToLower(path)
	return strings.Contains(lower, "_test.go") ||
		strings.Contains(lower, ".test.") ||
		strings.Contains(lower, ".spec.") ||
		strings.HasPrefix(lower, "tests/")
}

func uniqueSorted(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
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
	sort.Strings(out)
	return out
}
