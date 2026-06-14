package githubintegration

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type GitHubRepositoryClient struct {
	token      string
	baseURL    string
	httpClient *http.Client
}

type RepositoryClient interface {
	ListInstallationRepositories(ctx context.Context) ([]InstallationRepository, error)
	GetBranchRef(ctx context.Context, owner, repo, branch string) (*GitReference, error)
	ListRepositoryTree(ctx context.Context, owner, repo, ref string, recursive bool) (*GitTree, error)
	GetRepositoryFile(ctx context.Context, owner, repo, path, ref string) (*RepositoryFile, error)
	CreateBranch(ctx context.Context, owner, repo, branch, sha string) (*GitReference, error)
	CreateIssue(ctx context.Context, input CreateIssueInput) (*Issue, error)
	CreatePullRequest(ctx context.Context, input CreatePullRequestInput) (*PullRequest, error)
	MergePullRequest(ctx context.Context, input MergePullRequestInput) (*MergedPullRequest, error)
	ListWorkflowRuns(ctx context.Context, owner, repo, branch string) ([]WorkflowRun, error)
	ListWorkflowJobs(ctx context.Context, owner, repo string, runID int64) ([]WorkflowJob, error)
	GetWorkflowJobLogs(ctx context.Context, owner, repo string, jobID int64) (string, error)
}

type RepositoryClientFactory interface {
	NewRepositoryClient(token string) (RepositoryClient, error)
}

type defaultRepositoryClientFactory struct{}

func NewDefaultRepositoryClientFactory() RepositoryClientFactory {
	return defaultRepositoryClientFactory{}
}

func (defaultRepositoryClientFactory) NewRepositoryClient(token string) (RepositoryClient, error) {
	return NewGitHubRepositoryClient(token)
}

type GitHubRepositoryClientOption func(*GitHubRepositoryClient)

func NewGitHubRepositoryClient(token string, opts ...GitHubRepositoryClientOption) (*GitHubRepositoryClient, error) {
	if strings.TrimSpace(token) == "" {
		return nil, fmt.Errorf("github repository client: token is required")
	}
	client := &GitHubRepositoryClient{
		token:      strings.TrimSpace(token),
		baseURL:    defaultGitHubAPIBaseURL,
		httpClient: http.DefaultClient,
	}
	for _, opt := range opts {
		opt(client)
	}
	return client, nil
}

func WithGitHubRepositoryAPIBaseURL(baseURL string) GitHubRepositoryClientOption {
	return func(client *GitHubRepositoryClient) {
		if strings.TrimSpace(baseURL) != "" {
			client.baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
		}
	}
}

func WithGitHubRepositoryHTTPClient(httpClient *http.Client) GitHubRepositoryClientOption {
	return func(client *GitHubRepositoryClient) {
		if httpClient != nil {
			client.httpClient = httpClient
		}
	}
}

type GitReference struct {
	Ref    string       `json:"ref"`
	URL    string       `json:"url"`
	Object GitRefObject `json:"object"`
}

type InstallationRepository struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	HTMLURL       string `json:"html_url"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
}

type GitRefObject struct {
	Type string `json:"type"`
	SHA  string `json:"sha"`
	URL  string `json:"url"`
}

type GitTree struct {
	SHA       string         `json:"sha"`
	Truncated bool           `json:"truncated"`
	Tree      []GitTreeEntry `json:"tree"`
}

type GitTreeEntry struct {
	Path string `json:"path"`
	Mode string `json:"mode"`
	Type string `json:"type"`
	SHA  string `json:"sha"`
	Size int64  `json:"size,omitempty"`
	URL  string `json:"url"`
}

type RepositoryFile struct {
	Name            string `json:"name"`
	Path            string `json:"path"`
	SHA             string `json:"sha"`
	Size            int64  `json:"size"`
	Encoding        string `json:"encoding"`
	Content         string `json:"content"`
	DecodedContent  string `json:"-"`
	DownloadHTMLURL string `json:"html_url"`
}

type PullRequest struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Title   string `json:"title"`
	Draft   bool   `json:"draft"`
	Head    PRHead `json:"head"`
}

type Issue struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Title   string `json:"title"`
}

type PRHead struct {
	Ref string `json:"ref"`
	SHA string `json:"sha"`
}

type CreateIssueInput struct {
	Owner  string
	Repo   string
	Title  string
	Body   string
	Labels []string
}

type CreatePullRequestInput struct {
	Owner string
	Repo  string
	Title string
	Head  string
	Base  string
	Body  string
	Draft bool
}

type MergePullRequestInput struct {
	Owner         string
	Repo          string
	Number        int
	SHA           string
	MergeMethod   string
	CommitTitle   string
	CommitMessage string
}

type MergedPullRequest struct {
	SHA     string `json:"sha"`
	Merged  bool   `json:"merged"`
	Message string `json:"message"`
}

type WorkflowRun struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	HeadBranch string     `json:"head_branch"`
	HeadSHA    string     `json:"head_sha"`
	Status     string     `json:"status"`
	Conclusion string     `json:"conclusion"`
	HTMLURL    string     `json:"html_url"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	RunStarted *time.Time `json:"run_started_at"`
}

type WorkflowJob struct {
	ID          int64          `json:"id"`
	RunID       int64          `json:"run_id"`
	Name        string         `json:"name"`
	Status      string         `json:"status"`
	Conclusion  string         `json:"conclusion"`
	HTMLURL     string         `json:"html_url"`
	StartedAt   *time.Time     `json:"started_at"`
	CompletedAt *time.Time     `json:"completed_at"`
	Steps       []WorkflowStep `json:"steps"`
}

type WorkflowStep struct {
	Name        string     `json:"name"`
	Status      string     `json:"status"`
	Conclusion  string     `json:"conclusion"`
	Number      int        `json:"number"`
	StartedAt   *time.Time `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at"`
}

func (c *GitHubRepositoryClient) GetBranchRef(ctx context.Context, owner, repo, branch string) (*GitReference, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	if strings.TrimSpace(branch) == "" {
		return nil, fmt.Errorf("github repository client: branch is required")
	}
	var ref GitReference
	path := fmt.Sprintf("/repos/%s/%s/git/ref/heads/%s", url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(branch))
	if err := c.do(ctx, http.MethodGet, path, nil, &ref); err != nil {
		return nil, err
	}
	return &ref, nil
}

func (c *GitHubRepositoryClient) ListInstallationRepositories(ctx context.Context) ([]InstallationRepository, error) {
	var repositories []InstallationRepository
	path := "/installation/repositories?per_page=100"
	for {
		var out struct {
			Repositories []InstallationRepository `json:"repositories"`
		}
		header, err := c.doWithHeader(ctx, http.MethodGet, path, nil, &out)
		if err != nil {
			return nil, err
		}
		repositories = append(repositories, out.Repositories...)
		next := nextLinkFromHeader(header.Get("Link"))
		if next == "" {
			break
		}
		path = next
	}
	return repositories, nil
}

func (c *GitHubRepositoryClient) ListRepositoryTree(ctx context.Context, owner, repo, ref string, recursive bool) (*GitTree, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	if strings.TrimSpace(ref) == "" {
		return nil, fmt.Errorf("github repository client: tree ref is required")
	}
	query := url.Values{}
	if recursive {
		query.Set("recursive", "1")
	}
	path := fmt.Sprintf("/repos/%s/%s/git/trees/%s", url.PathEscape(owner), url.PathEscape(repo), url.PathEscape(strings.TrimSpace(ref)))
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var tree GitTree
	if err := c.do(ctx, http.MethodGet, path, nil, &tree); err != nil {
		return nil, err
	}
	return &tree, nil
}

func (c *GitHubRepositoryClient) GetRepositoryFile(ctx context.Context, owner, repo, filePath, ref string) (*RepositoryFile, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	filePath = strings.Trim(strings.TrimSpace(filePath), "/")
	if filePath == "" {
		return nil, fmt.Errorf("github repository client: file path is required")
	}
	query := url.Values{}
	if strings.TrimSpace(ref) != "" {
		query.Set("ref", strings.TrimSpace(ref))
	}
	path := fmt.Sprintf("/repos/%s/%s/contents/%s", url.PathEscape(owner), url.PathEscape(repo), escapePathSegments(filePath))
	if encoded := query.Encode(); encoded != "" {
		path += "?" + encoded
	}
	var file RepositoryFile
	if err := c.do(ctx, http.MethodGet, path, nil, &file); err != nil {
		return nil, err
	}
	if strings.EqualFold(file.Encoding, "base64") {
		content := strings.ReplaceAll(file.Content, "\n", "")
		decoded, err := base64.StdEncoding.DecodeString(content)
		if err != nil {
			return nil, fmt.Errorf("github repository client: decode file content: %w", err)
		}
		file.DecodedContent = string(decoded)
	}
	return &file, nil
}

func (c *GitHubRepositoryClient) CreateBranch(ctx context.Context, owner, repo, branch, sha string) (*GitReference, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	if strings.TrimSpace(branch) == "" || strings.TrimSpace(sha) == "" {
		return nil, fmt.Errorf("github repository client: branch and sha are required")
	}
	payload := map[string]string{
		"ref": "refs/heads/" + strings.TrimSpace(branch),
		"sha": strings.TrimSpace(sha),
	}
	var ref GitReference
	path := fmt.Sprintf("/repos/%s/%s/git/refs", url.PathEscape(owner), url.PathEscape(repo))
	if err := c.do(ctx, http.MethodPost, path, payload, &ref); err != nil {
		return nil, err
	}
	return &ref, nil
}

func (c *GitHubRepositoryClient) CreateIssue(ctx context.Context, input CreateIssueInput) (*Issue, error) {
	if err := requireRepoArgs(input.Owner, input.Repo); err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Title) == "" {
		return nil, fmt.Errorf("github repository client: issue title is required")
	}
	payload := map[string]any{
		"title": strings.TrimSpace(input.Title),
		"body":  input.Body,
	}
	if len(input.Labels) > 0 {
		payload["labels"] = input.Labels
	}
	var issue Issue
	path := fmt.Sprintf("/repos/%s/%s/issues", url.PathEscape(input.Owner), url.PathEscape(input.Repo))
	if err := c.do(ctx, http.MethodPost, path, payload, &issue); err != nil {
		return nil, err
	}
	return &issue, nil
}

func (c *GitHubRepositoryClient) CreatePullRequest(ctx context.Context, input CreatePullRequestInput) (*PullRequest, error) {
	if err := requireRepoArgs(input.Owner, input.Repo); err != nil {
		return nil, err
	}
	if strings.TrimSpace(input.Title) == "" || strings.TrimSpace(input.Head) == "" || strings.TrimSpace(input.Base) == "" {
		return nil, fmt.Errorf("github repository client: title, head, and base are required")
	}
	payload := map[string]any{
		"title": strings.TrimSpace(input.Title),
		"head":  strings.TrimSpace(input.Head),
		"base":  strings.TrimSpace(input.Base),
		"body":  input.Body,
		"draft": input.Draft,
	}
	var pr PullRequest
	path := fmt.Sprintf("/repos/%s/%s/pulls", url.PathEscape(input.Owner), url.PathEscape(input.Repo))
	if err := c.do(ctx, http.MethodPost, path, payload, &pr); err != nil {
		return nil, err
	}
	return &pr, nil
}

func (c *GitHubRepositoryClient) MergePullRequest(ctx context.Context, input MergePullRequestInput) (*MergedPullRequest, error) {
	if err := requireRepoArgs(input.Owner, input.Repo); err != nil {
		return nil, err
	}
	if input.Number == 0 {
		return nil, fmt.Errorf("github repository client: pull request number is required")
	}
	payload := map[string]any{}
	if strings.TrimSpace(input.SHA) != "" {
		payload["sha"] = strings.TrimSpace(input.SHA)
	}
	if strings.TrimSpace(input.MergeMethod) != "" {
		payload["merge_method"] = strings.TrimSpace(input.MergeMethod)
	}
	if strings.TrimSpace(input.CommitTitle) != "" {
		payload["commit_title"] = strings.TrimSpace(input.CommitTitle)
	}
	if strings.TrimSpace(input.CommitMessage) != "" {
		payload["commit_message"] = strings.TrimSpace(input.CommitMessage)
	}
	var result MergedPullRequest
	path := fmt.Sprintf("/repos/%s/%s/pulls/%d/merge", url.PathEscape(input.Owner), url.PathEscape(input.Repo), input.Number)
	if err := c.do(ctx, http.MethodPut, path, payload, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func (c *GitHubRepositoryClient) ListWorkflowRuns(ctx context.Context, owner, repo, branch string) ([]WorkflowRun, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	query := url.Values{"per_page": []string{"20"}}
	if strings.TrimSpace(branch) != "" {
		query.Set("branch", strings.TrimSpace(branch))
	}
	path := fmt.Sprintf("/repos/%s/%s/actions/runs?%s", url.PathEscape(owner), url.PathEscape(repo), query.Encode())
	var body struct {
		WorkflowRuns []WorkflowRun `json:"workflow_runs"`
	}
	if err := c.do(ctx, http.MethodGet, path, nil, &body); err != nil {
		return nil, err
	}
	return body.WorkflowRuns, nil
}

func (c *GitHubRepositoryClient) ListWorkflowJobs(ctx context.Context, owner, repo string, runID int64) ([]WorkflowJob, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return nil, err
	}
	if runID == 0 {
		return nil, fmt.Errorf("github repository client: workflow run id is required")
	}
	query := url.Values{"per_page": []string{"100"}}
	path := fmt.Sprintf("/repos/%s/%s/actions/runs/%d/jobs?%s", url.PathEscape(owner), url.PathEscape(repo), runID, query.Encode())
	var body struct {
		Jobs []WorkflowJob `json:"jobs"`
	}
	if err := c.do(ctx, http.MethodGet, path, nil, &body); err != nil {
		return nil, err
	}
	return body.Jobs, nil
}

func (c *GitHubRepositoryClient) GetWorkflowJobLogs(ctx context.Context, owner, repo string, jobID int64) (string, error) {
	if err := requireRepoArgs(owner, repo); err != nil {
		return "", err
	}
	if jobID == 0 {
		return "", fmt.Errorf("github repository client: workflow job id is required")
	}
	path := fmt.Sprintf("/repos/%s/%s/actions/jobs/%d/logs", url.PathEscape(owner), url.PathEscape(repo), jobID)
	body, err := c.doText(ctx, http.MethodGet, path)
	if err != nil {
		return "", err
	}
	return body, nil
}

func (c *GitHubRepositoryClient) do(ctx context.Context, method, path string, payload any, out any) error {
	_, err := c.doWithHeader(ctx, method, path, payload, out)
	return err
}

func (c *GitHubRepositoryClient) doWithHeader(ctx context.Context, method, path string, payload any, out any) (http.Header, error) {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("github repository client: encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.baseURL, "/")+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("github repository client: read response: %w", err)
	}
	var errorBody struct {
		Message string `json:"message"`
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_ = json.Unmarshal(responseBody, &errorBody)
		if errorBody.Message != "" {
			return nil, fmt.Errorf("github repository client: request failed: %s", errorBody.Message)
		}
		return nil, fmt.Errorf("github repository client: request failed with HTTP %d", resp.StatusCode)
	}
	if out == nil || len(responseBody) == 0 {
		return resp.Header, nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return nil, fmt.Errorf("github repository client: decode response: %w", err)
	}
	return resp.Header, nil
}

func (c *GitHubRepositoryClient) doText(ctx context.Context, method, path string) (string, error) {
	req, err := c.newRequest(ctx, method, path, nil)
	if err != nil {
		return "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("github repository client: read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorBody struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(responseBody, &errorBody)
		if errorBody.Message != "" {
			return "", fmt.Errorf("github repository client: request failed: %s", errorBody.Message)
		}
		return "", fmt.Errorf("github repository client: request failed with HTTP %d", resp.StatusCode)
	}
	return string(responseBody), nil
}

func (c *GitHubRepositoryClient) newRequest(ctx context.Context, method, path string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.baseURL, "/")+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	return req, nil
}

func requireRepoArgs(owner, repo string) error {
	if strings.TrimSpace(owner) == "" || strings.TrimSpace(repo) == "" {
		return fmt.Errorf("github repository client: owner and repo are required")
	}
	return nil
}

func escapePathSegments(path string) string {
	parts := strings.Split(path, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func nextLinkFromHeader(linkHeader string) string {
	for _, part := range strings.Split(linkHeader, ",") {
		part = strings.TrimSpace(part)
		if !strings.Contains(part, `rel="next"`) {
			continue
		}
		start := strings.Index(part, "<")
		end := strings.Index(part, ">")
		if start < 0 || end <= start+1 {
			continue
		}
		rawURL := strings.TrimSpace(part[start+1 : end])
		parsed, err := url.Parse(rawURL)
		if err != nil {
			continue
		}
		if parsed.RawQuery == "" {
			return parsed.Path
		}
		return parsed.Path + "?" + parsed.RawQuery
	}
	return ""
}
