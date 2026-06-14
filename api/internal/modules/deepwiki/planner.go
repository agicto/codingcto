package deepwiki

import "strings"

type WikiPagePlan struct {
	Slug             string
	Title            string
	PageType         string
	Purpose          string
	RequiredEvidence []string
}

type wikiPlanner struct{}

func newWikiPlanner() wikiPlanner {
	return wikiPlanner{}
}

func (wikiPlanner) Plan(profile RepositoryProfile) []WikiPagePlan {
	plans := []WikiPagePlan{
		{
			Slug:             "overview",
			Title:            "Overview",
			PageType:         "overview",
			Purpose:          "Summarize repository purpose, stack, and major folders.",
			RequiredEvidence: append(profile.Entrypoints, profile.Docs...),
		},
		{
			Slug:             "architecture",
			Title:            "Architecture",
			PageType:         "architecture",
			Purpose:          "Explain major components and request flow.",
			RequiredEvidence: append(profile.Routes, profile.Services...),
		},
		{
			Slug:             "setup-and-run",
			Title:            "Setup And Run",
			PageType:         "setup",
			Purpose:          "Document local setup and runtime commands.",
			RequiredEvidence: profile.Configs,
		},
	}

	if hasFrontend(profile) {
		plans = append(plans, WikiPagePlan{
			Slug:             "frontend",
			Title:            "Frontend",
			PageType:         "frontend",
			Purpose:          "Describe the frontend application structure and user-facing routes.",
			RequiredEvidence: append(pathsWithPrefix(profile.FileTree, "web/"), profile.Routes...),
		})
	}
	if hasBackend(profile) {
		plans = append(plans, WikiPagePlan{
			Slug:             "backend",
			Title:            "Backend",
			PageType:         "backend",
			Purpose:          "Describe backend modules, route registration, and service boundaries.",
			RequiredEvidence: append(pathsWithPrefix(profile.FileTree, "api/"), append(profile.Routes, profile.Services...)...),
		})
	}
	if len(profile.Models) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "data-model",
			Title:            "Data Model",
			PageType:         "data_model",
			Purpose:          "List important persistent objects and domain entities.",
			RequiredEvidence: profile.Models,
		})
	}
	if len(profile.Routes) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "api-routes",
			Title:            "API Routes",
			PageType:         "api_routes",
			Purpose:          "Map HTTP routes and route-owning modules.",
			RequiredEvidence: profile.Routes,
		})
	}
	if len(profile.Services) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "key-flows",
			Title:            "Key Flows",
			PageType:         "key_flows",
			Purpose:          "Explain the main service-level flows a developer should understand.",
			RequiredEvidence: append(profile.Services, profile.Routes...),
		})
	}
	if len(profile.Configs) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "configuration",
			Title:            "Configuration",
			PageType:         "configuration",
			Purpose:          "Document configuration files and runtime settings.",
			RequiredEvidence: profile.Configs,
		})
	}
	if len(profile.TestFiles) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "testing",
			Title:            "Testing",
			PageType:         "testing",
			Purpose:          "Summarize test layout and expected verification commands.",
			RequiredEvidence: profile.TestFiles,
		})
	}
	if len(profile.CIFiles) > 0 {
		plans = append(plans, WikiPagePlan{
			Slug:             "deployment",
			Title:            "Deployment",
			PageType:         "deployment",
			Purpose:          "Identify CI and deployment signals in the repository.",
			RequiredEvidence: profile.CIFiles,
		})
	}
	plans = append(plans, WikiPagePlan{
		Slug:             "glossary",
		Title:            "Glossary",
		PageType:         "glossary",
		Purpose:          "Define repository-specific terms from folders, modules, and frameworks.",
		RequiredEvidence: append(profile.Entrypoints, profile.Services...),
	})
	return plans
}

func hasFrontend(profile RepositoryProfile) bool {
	for _, framework := range profile.Frameworks {
		if strings.Contains(strings.ToLower(framework), "next") || strings.EqualFold(framework, "react") {
			return true
		}
	}
	for _, path := range profile.FileTree {
		if strings.HasPrefix(path, "web/") || strings.Contains(path, "src/app/") {
			return true
		}
	}
	return false
}

func hasBackend(profile RepositoryProfile) bool {
	for language := range profile.LanguageSummary {
		if language == "go" || language == "python" || language == "java" {
			return true
		}
	}
	for _, path := range profile.FileTree {
		if strings.HasPrefix(path, "api/") || strings.HasPrefix(path, "cmd/") || strings.Contains(path, "internal/modules/") {
			return true
		}
	}
	return false
}

func pathsWithPrefix(paths []string, prefix string) []string {
	out := []string{}
	for _, path := range paths {
		if strings.HasPrefix(path, prefix) {
			out = append(out, path)
		}
	}
	return out
}
