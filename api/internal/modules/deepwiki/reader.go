package deepwiki

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

type RepoReader interface {
	Read(ctx context.Context, source *domain.DeepWikiSource, pat string) (*RepositorySnapshot, error)
}

type GitHubRepositoryContentSource interface {
	ListRepositoryTree(ctx context.Context, repositoryID, ref string, recursive bool) (*GitHubRepositoryTreeSnapshot, error)
	ReadRepositoryFile(ctx context.Context, repositoryID, path, ref string) (*GitHubRepositoryFileSnapshot, error)
}

type GitHubRepositoryTreeSnapshot struct {
	Ref       string
	Truncated bool
	Paths     []string
}

type GitHubRepositoryFileSnapshot struct {
	Path    string
	Ref     string
	SHA     string
	Content string
}

type RepositorySnapshot struct {
	CommitSHA string
	Branch    string
	Files     []RepositoryFile
}

type RepositoryFile struct {
	Path     string
	Language string
	Content  string
	Size     int64
}

type defaultRepoReader struct {
	filter           fileFilter
	httpClient       *http.Client
	repositorySource GitHubRepositoryContentSource
}

func NewDefaultRepoReader(repositorySource GitHubRepositoryContentSource) RepoReader {
	return &defaultRepoReader{
		filter:           newFileFilter(),
		httpClient:       http.DefaultClient,
		repositorySource: repositorySource,
	}
}

func (r *defaultRepoReader) Read(ctx context.Context, source *domain.DeepWikiSource, pat string) (*RepositorySnapshot, error) {
	if source == nil {
		return nil, domain.ErrInvalidInput
	}
	switch source.SourceType {
	case domain.DeepWikiSourceTypeLocalPath:
		return r.readLocal(ctx, source)
	case domain.DeepWikiSourceTypeGitHubURL:
		return r.readGitHub(ctx, source, pat)
	case domain.DeepWikiSourceTypeGitHubRepository:
		return r.readGitHubRepository(ctx, source)
	default:
		return nil, domain.ErrInvalidInput
	}
}

func (r *defaultRepoReader) readLocal(ctx context.Context, source *domain.DeepWikiSource) (*RepositorySnapshot, error) {
	root := strings.TrimSpace(source.LocalPath)
	if root == "" {
		return nil, domain.ErrInvalidInput
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, fmt.Errorf("resolve local path: %w", err)
	}
	info, err := os.Stat(absRoot)
	if err != nil {
		return nil, fmt.Errorf("stat local path: %w", err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("local path is not a directory")
	}

	files := []RepositoryFile{}
	var totalBytes int64
	err = filepath.WalkDir(absRoot, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
		rel, err := filepath.Rel(absRoot, path)
		if err != nil {
			return err
		}
		rel = filepath.ToSlash(rel)
		if rel == "." {
			return nil
		}
		if d.IsDir() {
			if r.filter.shouldSkipPath(rel) {
				return filepath.SkipDir
			}
			return nil
		}
		if r.filter.shouldSkipPath(rel) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if info.Size() > maxTextFileBytes {
			return nil
		}
		contentBytes, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if !r.filter.isText(contentBytes) {
			return nil
		}
		content := string(contentBytes)
		if r.filter.containsSecret(content) {
			return nil
		}
		totalBytes += int64(len(contentBytes))
		if totalBytes > maxIndexedRepoBytes {
			return fmt.Errorf("repository exceeds filtered size limit")
		}
		files = append(files, RepositoryFile{
			Path:     rel,
			Language: languageForPath(rel),
			Content:  content,
			Size:     int64(len(contentBytes)),
		})
		if len(files) > maxIndexedFiles {
			return fmt.Errorf("repository exceeds indexed file limit")
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	branch := strings.TrimSpace(source.Branch)
	if branch == "" {
		branch = gitOutput(ctx, absRoot, "rev-parse", "--abbrev-ref", "HEAD")
	}
	return &RepositorySnapshot{
		CommitSHA: gitOutput(ctx, absRoot, "rev-parse", "HEAD"),
		Branch:    branch,
		Files:     files,
	}, nil
}

func (r *defaultRepoReader) readGitHub(ctx context.Context, source *domain.DeepWikiSource, pat string) (*RepositorySnapshot, error) {
	owner, repo, err := parseGitHubRepoURL(source.RepoURL)
	if err != nil {
		return nil, err
	}
	branch := strings.TrimSpace(source.Branch)
	if branch == "" {
		var metadata struct {
			DefaultBranch string `json:"default_branch"`
		}
		if err := r.githubGet(ctx, fmt.Sprintf("/repos/%s/%s", url.PathEscape(owner), url.PathEscape(repo)), pat, &metadata); err != nil {
			return nil, err
		}
		branch = strings.TrimSpace(metadata.DefaultBranch)
	}
	if branch == "" {
		branch = "main"
	}

	var ref struct {
		Object struct {
			SHA string `json:"sha"`
		} `json:"object"`
	}
	if err := r.githubGet(ctx, fmt.Sprintf("/repos/%s/%s/git/ref/heads/%s", url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(branch)), pat, &ref); err != nil {
		return nil, err
	}
	commitSHA := strings.TrimSpace(ref.Object.SHA)
	if commitSHA == "" {
		return nil, fmt.Errorf("github repository ref did not include commit sha")
	}

	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
			Size int64  `json:"size"`
		} `json:"tree"`
		Truncated bool `json:"truncated"`
	}
	treePath := fmt.Sprintf("/repos/%s/%s/git/trees/%s?recursive=1", url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(commitSHA))
	if err := r.githubGet(ctx, treePath, pat, &tree); err != nil {
		return nil, err
	}
	if tree.Truncated {
		return nil, fmt.Errorf("github tree response was truncated")
	}

	files := []RepositoryFile{}
	var totalBytes int64
	for _, entry := range tree.Tree {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if entry.Type != "blob" || entry.Size > maxTextFileBytes || r.filter.shouldSkipPath(entry.Path) {
			continue
		}
		content, err := r.readGitHubFile(ctx, owner, repo, entry.Path, branch, pat)
		if err != nil {
			return nil, err
		}
		contentBytes := []byte(content)
		if !r.filter.isText(contentBytes) || r.filter.containsSecret(content) {
			continue
		}
		totalBytes += int64(len(contentBytes))
		if totalBytes > maxIndexedRepoBytes {
			return nil, fmt.Errorf("repository exceeds filtered size limit")
		}
		files = append(files, RepositoryFile{
			Path:     entry.Path,
			Language: languageForPath(entry.Path),
			Content:  content,
			Size:     int64(len(contentBytes)),
		})
		if len(files) > maxIndexedFiles {
			return nil, fmt.Errorf("repository exceeds indexed file limit")
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return &RepositorySnapshot{CommitSHA: commitSHA, Branch: branch, Files: files}, nil
}

func (r *defaultRepoReader) readGitHubRepository(ctx context.Context, source *domain.DeepWikiSource) (*RepositorySnapshot, error) {
	if r.repositorySource == nil {
		return nil, fmt.Errorf("github repository reader is not configured")
	}
	repositoryID := strings.TrimSpace(source.RepositoryID)
	if repositoryID == "" {
		return nil, domain.ErrInvalidInput
	}
	branch := strings.TrimSpace(source.Branch)
	if branch == "" {
		branch = strings.TrimSpace(source.DefaultBranch)
	}
	if branch == "" {
		branch = "main"
	}

	tree, err := r.repositorySource.ListRepositoryTree(ctx, repositoryID, branch, true)
	if err != nil {
		return nil, err
	}
	if tree == nil {
		return nil, domain.ErrNotFound
	}
	if tree.Truncated {
		return nil, fmt.Errorf("github tree response was truncated")
	}
	if strings.TrimSpace(tree.Ref) != "" {
		branch = strings.TrimSpace(tree.Ref)
	}

	files := []RepositoryFile{}
	var totalBytes int64
	paths := append([]string(nil), tree.Paths...)
	sort.Strings(paths)
	for _, path := range paths {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		path = strings.TrimSpace(path)
		if path == "" || r.filter.shouldSkipPath(path) {
			continue
		}
		file, err := r.repositorySource.ReadRepositoryFile(ctx, repositoryID, path, branch)
		if err != nil || file == nil {
			continue
		}
		contentBytes := []byte(file.Content)
		if int64(len(contentBytes)) > maxTextFileBytes {
			continue
		}
		if !r.filter.isText(contentBytes) || r.filter.containsSecret(file.Content) {
			continue
		}
		totalBytes += int64(len(contentBytes))
		if totalBytes > maxIndexedRepoBytes {
			return nil, fmt.Errorf("repository exceeds filtered size limit")
		}
		files = append(files, RepositoryFile{
			Path:     file.Path,
			Language: languageForPath(file.Path),
			Content:  file.Content,
			Size:     int64(len(contentBytes)),
		})
		if len(files) > maxIndexedFiles {
			return nil, fmt.Errorf("repository exceeds indexed file limit")
		}
	}
	sort.Slice(files, func(i, j int) bool { return files[i].Path < files[j].Path })
	return &RepositorySnapshot{
		CommitSHA: strings.TrimSpace(tree.Ref),
		Branch:    branch,
		Files:     files,
	}, nil
}

func (r *defaultRepoReader) readGitHubFile(ctx context.Context, owner, repo, path, ref, pat string) (string, error) {
	var body struct {
		Encoding string `json:"encoding"`
		Content  string `json:"content"`
	}
	apiPath := fmt.Sprintf("/repos/%s/%s/contents/%s?ref=%s", url.PathEscape(owner), url.PathEscape(repo), escapePathSegments(path), url.QueryEscape(ref))
	if err := r.githubGet(ctx, apiPath, pat, &body); err != nil {
		return "", err
	}
	if body.Encoding != "base64" {
		return "", fmt.Errorf("github file %s uses unsupported encoding %q", path, body.Encoding)
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(body.Content, "\n", ""))
	if err != nil {
		return "", fmt.Errorf("decode github file %s: %w", path, err)
	}
	return string(decoded), nil
}

func (r *defaultRepoReader) githubGet(ctx context.Context, path, pat string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "CodingCTO-DeepWiki")
	if strings.TrimSpace(pat) != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(pat))
	}
	resp, err := r.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errBody struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(body, &errBody)
		if errBody.Message != "" {
			return fmt.Errorf("github api request failed: %s", errBody.Message)
		}
		return fmt.Errorf("github api request failed with HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("decode github response: %w", err)
	}
	return nil
}

func parseGitHubRepoURL(rawURL string) (string, string, error) {
	value := strings.TrimSpace(rawURL)
	if value == "" {
		return "", "", domain.ErrInvalidInput
	}
	if strings.HasPrefix(value, "git@github.com:") {
		remainder := strings.TrimPrefix(value, "git@github.com:")
		parts := strings.Split(strings.TrimSuffix(remainder, ".git"), "/")
		if len(parts) == 2 && parts[0] != "" && parts[1] != "" {
			return parts[0], parts[1], nil
		}
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "", "", err
	}
	if parsed.Host != "github.com" && parsed.Host != "www.github.com" {
		return "", "", fmt.Errorf("only github.com repository URLs are supported")
	}
	parts := strings.Split(strings.Trim(strings.TrimSuffix(parsed.Path, ".git"), "/"), "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("github repository URL must include owner and repo")
	}
	return parts[0], parts[1], nil
}

func escapePathSegments(path string) string {
	parts := strings.Split(filepath.ToSlash(path), "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func gitOutput(ctx context.Context, dir string, args ...string) string {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func languageForPath(path string) string {
	base := strings.ToLower(filepath.Base(path))
	ext := strings.ToLower(filepath.Ext(base))
	switch ext {
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx", ".mjs", ".cjs":
		return "javascript"
	case ".py":
		return "python"
	case ".java":
		return "java"
	case ".md", ".mdx":
		return "markdown"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	case ".toml":
		return "toml"
	case ".sql":
		return "sql"
	case ".css":
		return "css"
	case ".html":
		return "html"
	}
	switch base {
	case "dockerfile":
		return "dockerfile"
	case "makefile":
		return "makefile"
	}
	return "text"
}
