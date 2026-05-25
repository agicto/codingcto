package githubintegration

import (
	"bytes"
	"context"
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
	CreatePullRequest(ctx context.Context, input CreatePullRequestInput) (*PullRequest, error)
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

type GitRefObject struct {
	Type string `json:"type"`
	SHA  string `json:"sha"`
	URL  string `json:"url"`
}

type PullRequest struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Title   string `json:"title"`
	Draft   bool   `json:"draft"`
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

func (c *GitHubRepositoryClient) do(ctx context.Context, method, path string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("github repository client: encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.baseURL, "/")+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("github repository client: read response: %w", err)
	}
	var errorBody struct {
		Message string `json:"message"`
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		_ = json.Unmarshal(responseBody, &errorBody)
		if errorBody.Message != "" {
			return fmt.Errorf("github repository client: request failed: %s", errorBody.Message)
		}
		return fmt.Errorf("github repository client: request failed with HTTP %d", resp.StatusCode)
	}
	if out == nil || len(responseBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(responseBody, out); err != nil {
		return fmt.Errorf("github repository client: decode response: %w", err)
	}
	return nil
}

func requireRepoArgs(owner, repo string) error {
	if strings.TrimSpace(owner) == "" || strings.TrimSpace(repo) == "" {
		return fmt.Errorf("github repository client: owner and repo are required")
	}
	return nil
}
