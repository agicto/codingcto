package repocontext

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/domain"
)

type Service interface {
	UpsertProfile(ctx context.Context, userID uint, repoID string, req *UpsertRepoProfileRequest) (*domain.SpecForgeRepoProfile, error)
	InferProfile(ctx context.Context, userID uint, repoID string, req *InferRepoProfileRequest) (*domain.SpecForgeRepoProfile, error)
	GetProfile(ctx context.Context, repoID string) (*domain.SpecForgeRepoProfile, error)
	ReindexArchitecture(ctx context.Context, userID uint, repoID string, req *ReindexRepoArchitectureRequest) (*RepoArchitectureStatusResponse, error)
	GetArchitectureStatus(ctx context.Context, repoID string) (*RepoArchitectureStatusResponse, error)
}

type RepositoryTreeSource interface {
	ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*RepositoryTreeSnapshot, error)
	ReadRepositoryFile(ctx context.Context, repositoryID, path, ref string) (*RepositoryFileSnapshot, error)
}

type RepositoryTreeSnapshot struct {
	Ref       string
	Truncated bool
	Paths     []string
}

type RepositoryFileSnapshot struct {
	Path    string
	Ref     string
	Content string
}

type store interface {
	domain.SpecForgeRepoProfileRepository
	CreateArchitectureSnapshot(ctx context.Context, snapshot *domain.SpecForgeRepoArchitectureSnapshot) error
	FindLatestArchitectureSnapshotByRepositoryID(ctx context.Context, repositoryID string) (*domain.SpecForgeRepoArchitectureSnapshot, error)
}

type service struct {
	repo       store
	treeSource RepositoryTreeSource
}

func NewService(repo store, treeSource RepositoryTreeSource) *service {
	return &service{repo: repo, treeSource: treeSource}
}

func (s *service) UpsertProfile(ctx context.Context, userID uint, repoID string, req *UpsertRepoProfileRequest) (*domain.SpecForgeRepoProfile, error) {
	if userID == 0 || strings.TrimSpace(repoID) == "" || req == nil {
		return nil, domain.ErrInvalidInput
	}

	defaultBranch := strings.TrimSpace(req.DefaultBranch)
	if defaultBranch == "" {
		defaultBranch = "main"
	}
	ciProvider := strings.TrimSpace(req.CIProvider)
	if ciProvider == "" {
		ciProvider = "unknown"
	}
	source := strings.TrimSpace(req.Source)
	if source == "" {
		source = "manual"
	}

	profile := &domain.SpecForgeRepoProfile{
		RepositoryID:      strings.TrimSpace(repoID),
		DefaultBranch:     defaultBranch,
		Stack:             normalizeList(req.Stack),
		TestCommands:      normalizeList(req.TestCommands),
		CIProvider:        ciProvider,
		AppStructure:      normalizeList(req.AppStructure),
		CodingConventions: normalizeList(req.CodingConventions),
		RiskAreas:         normalizeList(req.RiskAreas),
		Summary:           strings.TrimSpace(req.Summary),
		Source:            source,
		Warnings:          normalizeList(req.Warnings),
		CreatedBy:         userID,
		LastIndexedAt:     time.Now(),
	}
	if err := s.repo.UpsertProfile(ctx, profile); err != nil {
		return nil, fmt.Errorf("upsert repo profile: %w", err)
	}
	return profile, nil
}

func (s *service) InferProfile(ctx context.Context, userID uint, repoID string, req *InferRepoProfileRequest) (*domain.SpecForgeRepoProfile, error) {
	if userID == 0 || strings.TrimSpace(repoID) == "" || req == nil {
		return nil, domain.ErrInvalidInput
	}

	rawPaths := normalizeList(req.FilePaths)
	treeRef := strings.TrimSpace(req.DefaultBranch)
	source := "request_hints"
	warnings := []string{}
	if len(rawPaths) == 0 && s.treeSource != nil {
		snapshot, err := s.treeSource.ListRepositoryTree(ctx, strings.TrimSpace(repoID), treeRef, true)
		if err != nil {
			return nil, fmt.Errorf("list repository tree: %w", err)
		}
		if snapshot != nil {
			source = "github_tree"
			rawPaths = normalizeList(snapshot.Paths)
			if strings.TrimSpace(req.DefaultBranch) == "" {
				req.DefaultBranch = strings.TrimSpace(snapshot.Ref)
			}
			treeRef = strings.TrimSpace(snapshot.Ref)
		}
		if snapshot != nil && snapshot.Truncated {
			warnings = append(warnings, "GitHub tree response was truncated; inferred profile may miss files.")
		}
	}
	paths, filteredCount := filterSensitivePaths(rawPaths)
	if filteredCount > 0 {
		warnings = append(warnings, fmt.Sprintf("CodingCTO filtered %d sensitive repository paths from the inferred profile.", filteredCount))
	}
	scripts := normalizeScripts(req.PackageScripts)
	if len(scripts) == 0 && len(paths) > 0 && s.treeSource != nil {
		scripts = normalizeScripts(s.packageScriptsFromRepository(ctx, strings.TrimSpace(repoID), treeRef, paths))
	}
	instructionConventions := []string{}
	if len(paths) > 0 && s.treeSource != nil {
		instructionConventions = s.instructionConventionsFromRepository(ctx, strings.TrimSpace(repoID), treeRef, paths)
	}
	inferred := inferRepoProfile(paths, scripts, instructionConventions)
	inferred.DefaultBranch = strings.TrimSpace(req.DefaultBranch)
	inferred.Source = source
	inferred.Warnings = normalizeList(warnings)

	return s.UpsertProfile(ctx, userID, repoID, inferred)
}

func (s *service) GetProfile(ctx context.Context, repoID string) (*domain.SpecForgeRepoProfile, error) {
	if strings.TrimSpace(repoID) == "" {
		return nil, domain.ErrInvalidInput
	}
	return s.repo.FindProfileByRepositoryID(ctx, strings.TrimSpace(repoID))
}

func (s *service) ReindexArchitecture(ctx context.Context, userID uint, repoID string, req *ReindexRepoArchitectureRequest) (*RepoArchitectureStatusResponse, error) {
	repoID = strings.TrimSpace(repoID)
	if userID == 0 || repoID == "" || req == nil {
		return nil, domain.ErrInvalidInput
	}
	ref := strings.TrimSpace(req.DefaultBranch)
	rawPaths := normalizeList(req.FilePaths)
	warnings := []string{}
	source := "request_hints"
	if len(rawPaths) == 0 {
		if s.treeSource == nil {
			return nil, domain.ErrInvalidInput
		}
		tree, err := s.treeSource.ListRepositoryTree(ctx, repoID, ref, true)
		if err != nil {
			return nil, fmt.Errorf("list repository tree: %w", err)
		}
		if tree == nil {
			return nil, domain.ErrNotFound
		}
		source = "github_tree"
		rawPaths = normalizeList(tree.Paths)
		if strings.TrimSpace(tree.Ref) != "" {
			ref = strings.TrimSpace(tree.Ref)
		}
		if tree.Truncated {
			warnings = append(warnings, "GitHub tree response was truncated; architecture snapshot may miss files.")
		}
	}
	paths, filteredCount := filterSensitivePaths(rawPaths)
	if filteredCount > 0 {
		warnings = append(warnings, fmt.Sprintf("CodingCTO filtered %d sensitive repository paths from the architecture snapshot.", filteredCount))
	}
	if ref == "" {
		ref = "main"
	}
	scripts := normalizeScripts(req.PackageScripts)
	if len(scripts) == 0 && s.treeSource != nil {
		scripts = normalizeScripts(s.packageScriptsFromRepository(ctx, repoID, ref, paths))
	}
	instructions := []string{}
	if s.treeSource != nil {
		instructions = s.instructionConventionsFromRepository(ctx, repoID, ref, paths)
	}
	inferred := inferRepoProfile(paths, scripts, instructions)
	inferred.DefaultBranch = ref
	inferred.Source = "architecture_snapshot"
	inferred.Warnings = normalizeList(warnings)
	profile, err := s.UpsertProfile(ctx, userID, repoID, inferred)
	if err != nil {
		return nil, err
	}
	snapshot := architectureSnapshotFromProfile(userID, repoID, ref, paths, profile, append(warnings, "Architecture snapshot source: "+source+"."))
	if err := s.repo.CreateArchitectureSnapshot(ctx, snapshot); err != nil {
		return nil, fmt.Errorf("create architecture snapshot: %w", err)
	}
	return architectureStatusResponse(snapshot, false, nil), nil
}

func (s *service) GetArchitectureStatus(ctx context.Context, repoID string) (*RepoArchitectureStatusResponse, error) {
	repoID = strings.TrimSpace(repoID)
	if repoID == "" {
		return nil, domain.ErrInvalidInput
	}
	snapshot, err := s.repo.FindLatestArchitectureSnapshotByRepositoryID(ctx, repoID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			stale, reasons := domain.SpecForgeRepoArchitectureSnapshotStaleness(nil, time.Now())
			return architectureStatusResponse(nil, stale, reasons), nil
		}
		return nil, err
	}
	stale, reasons := domain.SpecForgeRepoArchitectureSnapshotStaleness(snapshot, time.Now())
	return architectureStatusResponse(snapshot, stale, reasons), nil
}

func (s *service) packageScriptsFromRepository(ctx context.Context, repoID, ref string, paths []string) map[string]string {
	scripts := map[string]string{}
	for _, path := range packageJSONPaths(paths, 5) {
		file, err := s.treeSource.ReadRepositoryFile(ctx, repoID, path, ref)
		if err != nil || file == nil {
			continue
		}
		for name, command := range parsePackageScripts(file.Content) {
			if _, exists := scripts[name]; !exists {
				scripts[name] = command
			}
		}
	}
	return scripts
}

func (s *service) instructionConventionsFromRepository(ctx context.Context, repoID, ref string, paths []string) []string {
	conventions := []string{}
	for _, path := range instructionFilePaths(paths, 5) {
		file, err := s.treeSource.ReadRepositoryFile(ctx, repoID, path, ref)
		if err != nil || file == nil {
			continue
		}
		excerpt := instructionExcerpt(file.Content, 700)
		if excerpt == "" {
			continue
		}
		conventions = append(conventions, fmt.Sprintf("Instruction excerpt from %s: %s", path, excerpt))
	}
	return normalizeList(conventions)
}

func architectureSnapshotFromProfile(userID uint, repoID, ref string, paths []string, profile *domain.SpecForgeRepoProfile, warnings []string) *domain.SpecForgeRepoArchitectureSnapshot {
	return &domain.SpecForgeRepoArchitectureSnapshot{
		RepositoryID: strings.TrimSpace(repoID),
		CommitSHA:    strings.TrimSpace(ref),
		Stack:        normalizeList(profile.Stack),
		Modules:      architectureModules(paths),
		Entrypoints:  architectureEntrypoints(paths),
		TestCommands: normalizeList(profile.TestCommands),
		CIWorkflows:  architectureCIWorkflows(paths),
		RiskAreas:    normalizeList(profile.RiskAreas),
		Summary:      strings.TrimSpace(profile.Summary),
		GeneratedBy:  "repo_context_service",
		Warnings:     normalizeList(warnings),
		CreatedBy:    userID,
	}
}

func architectureModules(paths []string) []string {
	modules := []string{}
	for _, path := range paths {
		lower := strings.ToLower(strings.TrimSpace(path))
		switch {
		case strings.HasPrefix(lower, "api/internal/modules/"):
			parts := strings.Split(lower, "/")
			if len(parts) >= 4 {
				modules = append(modules, "api/internal/modules/"+parts[3])
			}
		case strings.HasPrefix(lower, "web/src/features/"):
			parts := strings.Split(lower, "/")
			if len(parts) >= 4 {
				modules = append(modules, "web/src/features/"+parts[3])
			}
		case strings.HasPrefix(lower, "src/features/"):
			parts := strings.Split(lower, "/")
			if len(parts) >= 3 {
				modules = append(modules, "src/features/"+parts[2])
			}
		case strings.HasPrefix(lower, "packages/"):
			parts := strings.Split(lower, "/")
			if len(parts) >= 2 {
				modules = append(modules, "packages/"+parts[1])
			}
		}
	}
	return normalizeList(modules)
}

func architectureEntrypoints(paths []string) []string {
	entrypoints := []string{}
	for _, path := range paths {
		lower := strings.ToLower(strings.TrimSpace(path))
		if lower == "" {
			continue
		}
		switch {
		case lower == "main.go" || strings.HasSuffix(lower, "/main.go"):
			entrypoints = append(entrypoints, path)
		case lower == "cmd/server/main.go" || strings.HasPrefix(lower, "cmd/"):
			if strings.HasSuffix(lower, "main.go") {
				entrypoints = append(entrypoints, path)
			}
		case strings.HasSuffix(lower, "next.config.js") || strings.HasSuffix(lower, "next.config.ts"):
			entrypoints = append(entrypoints, path)
		case strings.HasSuffix(lower, "app/page.tsx") || strings.HasSuffix(lower, "pages/index.tsx"):
			entrypoints = append(entrypoints, path)
		}
	}
	return normalizeList(entrypoints)
}

func architectureCIWorkflows(paths []string) []string {
	workflows := []string{}
	for _, path := range paths {
		lower := strings.ToLower(strings.TrimSpace(path))
		if strings.HasPrefix(lower, ".github/workflows/") && (strings.HasSuffix(lower, ".yml") || strings.HasSuffix(lower, ".yaml")) {
			workflows = append(workflows, path)
		}
	}
	return normalizeList(workflows)
}

func architectureStatusResponse(snapshot *domain.SpecForgeRepoArchitectureSnapshot, stale bool, reasons []string) *RepoArchitectureStatusResponse {
	var responseSnapshot *RepoArchitectureSnapshotResponse
	if snapshot != nil {
		responseSnapshot = &RepoArchitectureSnapshotResponse{
			ID:           snapshot.ID,
			RepositoryID: snapshot.RepositoryID,
			CommitSHA:    snapshot.CommitSHA,
			Stack:        snapshot.Stack,
			Modules:      snapshot.Modules,
			Entrypoints:  snapshot.Entrypoints,
			TestCommands: snapshot.TestCommands,
			CIWorkflows:  snapshot.CIWorkflows,
			RiskAreas:    snapshot.RiskAreas,
			Summary:      snapshot.Summary,
			GeneratedBy:  snapshot.GeneratedBy,
			Warnings:     snapshot.Warnings,
			CreatedBy:    snapshot.CreatedBy,
			CreatedAt:    snapshot.CreatedAt.Format(time.RFC3339),
			UpdatedAt:    snapshot.UpdatedAt.Format(time.RFC3339),
		}
	}
	return &RepoArchitectureStatusResponse{
		Snapshot:     responseSnapshot,
		Stale:        stale,
		StaleReasons: normalizeList(reasons),
	}
}

func packageJSONPaths(paths []string, limit int) []string {
	out := []string{}
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" || isSensitiveRepoPath(trimmed) {
			continue
		}
		if strings.EqualFold(trimmed, "package.json") || strings.HasSuffix(strings.ToLower(trimmed), "/package.json") {
			out = append(out, trimmed)
			if limit > 0 && len(out) >= limit {
				return out
			}
		}
	}
	return out
}

func instructionFilePaths(paths []string, limit int) []string {
	out := []string{}
	for _, path := range paths {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" || isSensitiveRepoPath(trimmed) {
			continue
		}
		lower := strings.ToLower(trimmed)
		if isInstructionFilePath(lower) {
			out = append(out, trimmed)
			if limit > 0 && len(out) >= limit {
				return out
			}
		}
	}
	return normalizeList(out)
}

func isInstructionFilePath(lowerPath string) bool {
	base := lowerPath
	if idx := strings.LastIndex(base, "/"); idx >= 0 {
		base = base[idx+1:]
	}
	return base == "agents.md" ||
		base == "contributing.md" ||
		base == "claude.md" ||
		lowerPath == ".github/copilot-instructions.md"
}

func instructionExcerpt(content string, limit int) string {
	content = strings.ToValidUTF8(strings.ReplaceAll(content, "\x00", ""), "")
	lines := strings.Split(content, "\n")
	kept := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.Join(strings.Fields(strings.TrimSpace(line)), " ")
		if line == "" || likelySensitiveInstructionLine(line) {
			continue
		}
		kept = append(kept, line)
	}
	excerpt := strings.TrimSpace(strings.Join(kept, " "))
	if limit > 0 && len(excerpt) > limit {
		excerpt = strings.TrimSpace(excerpt[:limit]) + "..."
	}
	return excerpt
}

func likelySensitiveInstructionLine(line string) bool {
	lower := strings.ToLower(line)
	return strings.Contains(lower, "secret") ||
		strings.Contains(lower, "token") ||
		strings.Contains(lower, "password") ||
		strings.Contains(lower, "credential") ||
		strings.Contains(lower, "private key") ||
		strings.Contains(lower, "api key")
}

func filterSensitivePaths(paths []string) ([]string, int) {
	out := make([]string, 0, len(paths))
	filtered := 0
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		if isSensitiveRepoPath(path) {
			filtered++
			continue
		}
		out = append(out, path)
	}
	return normalizeList(out), filtered
}

func isSensitiveRepoPath(path string) bool {
	lower := strings.ToLower(strings.TrimSpace(path))
	if lower == "" {
		return false
	}
	base := lower
	if idx := strings.LastIndex(base, "/"); idx >= 0 {
		base = base[idx+1:]
	}
	if base == ".env" || strings.HasPrefix(base, ".env.") || strings.HasSuffix(base, ".pem") || strings.HasSuffix(base, ".key") || strings.HasSuffix(base, ".p12") || strings.HasSuffix(base, ".pfx") {
		return true
	}
	if strings.Contains(base, "secret") || strings.Contains(base, "token") || strings.Contains(base, "credential") || strings.Contains(base, "private-key") {
		return true
	}
	return strings.Contains(lower, "/.env/") || strings.Contains(lower, "/secrets/") || strings.HasPrefix(lower, "secrets/")
}

func parsePackageScripts(content string) map[string]string {
	var parsed struct {
		Scripts map[string]string `json:"scripts"`
	}
	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil
	}
	return parsed.Scripts
}

func normalizeList(values []string) []string {
	out := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
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

func normalizeScripts(scripts map[string]string) map[string]string {
	out := make(map[string]string, len(scripts))
	for name, command := range scripts {
		name = strings.TrimSpace(name)
		command = strings.TrimSpace(command)
		if name == "" || command == "" {
			continue
		}
		out[name] = command
	}
	return out
}

func inferRepoProfile(paths []string, scripts map[string]string, instructionConventions []string) *UpsertRepoProfileRequest {
	lowerPaths := make([]string, 0, len(paths))
	for _, path := range paths {
		lowerPaths = append(lowerPaths, strings.ToLower(strings.TrimSpace(path)))
	}

	stack := []string{}
	testCommands := []string{}
	appStructure := []string{}
	riskAreas := []string{}
	conventions := []string{}
	ciProvider := "unknown"

	if hasPath(lowerPaths, "go.mod") {
		stack = append(stack, "Go")
		testCommands = append(testCommands, "go test ./...", "go vet ./...")
	}
	if hasPath(lowerPaths, "package.json") {
		stack = append(stack, "Node.js")
	}
	if hasPath(lowerPaths, "pnpm-lock.yaml") {
		stack = append(stack, "pnpm")
	}
	if hasPath(lowerPaths, "yarn.lock") {
		stack = append(stack, "Yarn")
	}
	if hasPath(lowerPaths, "package-lock.json") {
		stack = append(stack, "npm")
	}
	if hasPath(lowerPaths, "bun.lockb") || hasPath(lowerPaths, "bun.lock") {
		stack = append(stack, "Bun")
	}
	if hasAnyPath(lowerPaths, "next.config", "app/", "pages/") {
		stack = append(stack, "Next.js")
	}
	if hasPath(lowerPaths, "tsconfig.json") || hasExtension(lowerPaths, ".ts", ".tsx") {
		stack = append(stack, "TypeScript")
	}
	if hasAnyPath(lowerPaths, "tailwind.config", "postcss.config") {
		stack = append(stack, "Tailwind")
	}
	if hasAnyPath(lowerPaths, "prisma/schema.prisma", "prisma/migrations") {
		stack = append(stack, "Prisma")
		riskAreas = append(riskAreas, "database migrations")
	}
	if hasAnyPath(lowerPaths, ".github/workflows/") {
		ciProvider = "github_actions"
	}
	if hasAnyPath(lowerPaths, "api/internal/modules") {
		appStructure = append(appStructure, "api/internal/modules")
		conventions = append(conventions, "Keep Go modules inside api/internal module boundaries.")
	}
	if hasAnyPath(lowerPaths, "web/src/features") {
		appStructure = append(appStructure, "web/src/features")
		conventions = append(conventions, "Keep frontend work in feature-first folders.")
	}
	if hasFileBase(lowerPaths, "agents.md") {
		conventions = append(conventions, "Follow repository instructions in AGENTS.md before planning or editing.")
	}
	if hasFileBase(lowerPaths, "contributing.md") {
		conventions = append(conventions, "Follow repository contribution guidelines in CONTRIBUTING.md.")
	}
	if hasPath(lowerPaths, ".github/copilot-instructions.md") {
		conventions = append(conventions, "Follow GitHub Copilot repository instructions in .github/copilot-instructions.md.")
	}
	conventions = append(conventions, instructionConventions...)
	if hasAnyPath(lowerPaths, "auth", "permission", "rbac") {
		riskAreas = append(riskAreas, "auth")
	}
	if hasAnyPath(lowerPaths, "billing", "stripe", "payment") {
		riskAreas = append(riskAreas, "billing")
	}

	testCommands = append(testCommands, packageTestCommands(scripts, packageManagerFromPaths(lowerPaths))...)

	return &UpsertRepoProfileRequest{
		Stack:             normalizeList(stack),
		TestCommands:      normalizeList(testCommands),
		CIProvider:        ciProvider,
		AppStructure:      normalizeList(appStructure),
		CodingConventions: normalizeList(conventions),
		RiskAreas:         normalizeList(riskAreas),
		Summary:           inferredSummary(stack, ciProvider, appStructure),
	}
}

func packageTestCommands(scripts map[string]string, packageManager string) []string {
	commands := []string{}
	packageManager = strings.TrimSpace(packageManager)
	if packageManager == "" {
		packageManager = "pnpm"
	}
	for _, name := range []string{"lint", "type-check", "typecheck", "test"} {
		if _, ok := scripts[name]; ok {
			commands = append(commands, packageScriptCommand(packageManager, name))
		}
	}
	return commands
}

func packageManagerFromPaths(paths []string) string {
	switch {
	case hasPath(paths, "pnpm-lock.yaml"):
		return "pnpm"
	case hasPath(paths, "yarn.lock"):
		return "yarn"
	case hasPath(paths, "bun.lockb") || hasPath(paths, "bun.lock"):
		return "bun"
	case hasPath(paths, "package-lock.json"):
		return "npm"
	default:
		return "pnpm"
	}
}

func packageScriptCommand(packageManager, scriptName string) string {
	packageManager = strings.TrimSpace(packageManager)
	scriptName = strings.TrimSpace(scriptName)
	switch packageManager {
	case "npm":
		return "npm run " + scriptName
	default:
		return packageManager + " " + scriptName
	}
}

func hasPath(paths []string, needle string) bool {
	needle = strings.ToLower(needle)
	for _, path := range paths {
		if path == needle || strings.HasSuffix(path, "/"+needle) {
			return true
		}
	}
	return false
}

func hasFileBase(paths []string, baseName string) bool {
	baseName = strings.ToLower(strings.TrimSpace(baseName))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path == "" {
			continue
		}
		base := path
		if idx := strings.LastIndex(base, "/"); idx >= 0 {
			base = base[idx+1:]
		}
		if base == baseName {
			return true
		}
	}
	return false
}

func hasAnyPath(paths []string, needles ...string) bool {
	for _, needle := range needles {
		needle = strings.ToLower(needle)
		for _, path := range paths {
			if strings.Contains(path, needle) {
				return true
			}
		}
	}
	return false
}

func hasExtension(paths []string, extensions ...string) bool {
	for _, path := range paths {
		for _, extension := range extensions {
			if strings.HasSuffix(path, extension) {
				return true
			}
		}
	}
	return false
}

func inferredSummary(stack []string, ciProvider string, appStructure []string) string {
	parts := []string{"CodingCTO inferred this repository profile from repository file paths"}
	if len(stack) > 0 {
		parts = append(parts, "stack: "+strings.Join(normalizeList(stack), ", "))
	}
	if ciProvider != "unknown" {
		parts = append(parts, "CI: "+ciProvider)
	}
	if len(appStructure) > 0 {
		parts = append(parts, "structure: "+strings.Join(normalizeList(appStructure), ", "))
	}
	return strings.Join(parts, ". ") + "."
}
