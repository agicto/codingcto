package githubintegration

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestGitHubRepositoryClientGetBranchRef(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/git/ref/heads/main", r.URL.Path)
		require.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ref": "refs/heads/main",
			"object": map[string]any{
				"type": "commit",
				"sha":  "abc123",
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	ref, err := client.GetBranchRef(context.Background(), "acme", "web", "main")

	require.NoError(t, err)
	require.Equal(t, "Bearer ghs_token", authHeader)
	require.Equal(t, "refs/heads/main", ref.Ref)
	require.Equal(t, "abc123", ref.Object.SHA)
}

func TestGitHubRepositoryClientListInstallationRepositoriesFollowsPagination(t *testing.T) {
	requests := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		requests = append(requests, r.URL.String())
		switch r.URL.Query().Get("page") {
		case "":
			w.Header().Set("Link", `<https://api.github.test/installation/repositories?per_page=100&page=2>; rel="next"`)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"repositories": []map[string]any{
					{
						"id":             101,
						"name":           "codingcto",
						"full_name":      "agicto/codingcto",
						"default_branch": "main",
					},
				},
			})
		case "2":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"repositories": []map[string]any{
					{
						"id":             102,
						"name":           "codingcto-key",
						"full_name":      "agicto/codingcto-key",
						"default_branch": "main",
					},
				},
			})
		default:
			t.Fatalf("unexpected page %q", r.URL.Query().Get("page"))
		}
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	repositories, err := client.ListInstallationRepositories(context.Background())

	require.NoError(t, err)
	require.Equal(t, []string{
		"/installation/repositories?per_page=100",
		"/installation/repositories?per_page=100&page=2",
	}, requests)
	require.Len(t, repositories, 2)
	require.Equal(t, "agicto/codingcto", repositories[0].FullName)
	require.Equal(t, "agicto/codingcto-key", repositories[1].FullName)
}

func TestGitHubRepositoryClientListRepositoryTree(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/git/trees/main", r.URL.Path)
		require.Equal(t, "1", r.URL.Query().Get("recursive"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"sha":       "tree123",
			"truncated": false,
			"tree": []map[string]any{
				{
					"path": "go.mod",
					"mode": "100644",
					"type": "blob",
					"sha":  "gomod123",
					"size": 72,
					"url":  "https://api.github.com/repos/acme/web/git/blobs/gomod123",
				},
				{
					"path": "web/package.json",
					"mode": "100644",
					"type": "blob",
					"sha":  "package123",
					"size": 512,
					"url":  "https://api.github.com/repos/acme/web/git/blobs/package123",
				},
				{
					"path": ".github/workflows/ci.yml",
					"mode": "100644",
					"type": "blob",
					"sha":  "workflow123",
					"size": 256,
					"url":  "https://api.github.com/repos/acme/web/git/blobs/workflow123",
				},
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	tree, err := client.ListRepositoryTree(context.Background(), "acme", "web", "main", true)

	require.NoError(t, err)
	require.Equal(t, "tree123", tree.SHA)
	require.False(t, tree.Truncated)
	require.Len(t, tree.Tree, 3)
	require.Equal(t, "go.mod", tree.Tree[0].Path)
	require.Equal(t, "blob", tree.Tree[0].Type)
	require.Equal(t, int64(72), tree.Tree[0].Size)
	require.Equal(t, ".github/workflows/ci.yml", tree.Tree[2].Path)
}

func TestGitHubRepositoryClientGetRepositoryFile(t *testing.T) {
	content := `{"scripts":{"lint":"eslint .","test":"vitest"}}`
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/contents/web/package.json", r.URL.Path)
		require.Equal(t, "main", r.URL.Query().Get("ref"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"name":     "package.json",
			"path":     "web/package.json",
			"sha":      "package123",
			"encoding": "base64",
			"content":  base64.StdEncoding.EncodeToString([]byte(content)),
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	file, err := client.GetRepositoryFile(context.Background(), "acme", "web", "web/package.json", "main")

	require.NoError(t, err)
	require.Equal(t, "web/package.json", file.Path)
	require.Equal(t, "package123", file.SHA)
	require.Equal(t, content, file.DecodedContent)
}

func TestGitHubRepositoryClientCreateBranch(t *testing.T) {
	var payload map[string]string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/repos/acme/web/git/refs", r.URL.Path)
		require.Equal(t, "application/json", r.Header.Get("Content-Type"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ref": "refs/heads/specforge/team-invite-01-model",
			"object": map[string]any{
				"type": "commit",
				"sha":  "abc123",
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	ref, err := client.CreateBranch(context.Background(), "acme", "web", "specforge/team-invite-01-model", "abc123")

	require.NoError(t, err)
	require.Equal(t, "refs/heads/specforge/team-invite-01-model", payload["ref"])
	require.Equal(t, "abc123", payload["sha"])
	require.Equal(t, "abc123", ref.Object.SHA)
}

func TestGitHubRepositoryClientCreatePullRequest(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodPost, r.Method)
		require.Equal(t, "/repos/acme/web/pulls", r.URL.Path)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"number":   42,
			"html_url": "https://github.com/acme/web/pull/42",
			"state":    "open",
			"title":    "Add invite API",
			"draft":    true,
			"head": map[string]any{
				"ref": "specforge/team-invite-02-api",
				"sha": "abc123",
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	pr, err := client.CreatePullRequest(context.Background(), CreatePullRequestInput{
		Owner: "acme",
		Repo:  "web",
		Title: "Add invite API",
		Head:  "specforge/team-invite-02-api",
		Base:  "main",
		Body:  "Generated by CodingCTO",
		Draft: true,
	})

	require.NoError(t, err)
	require.Equal(t, "Add invite API", payload["title"])
	require.Equal(t, "specforge/team-invite-02-api", payload["head"])
	require.Equal(t, "main", payload["base"])
	require.Equal(t, "Generated by CodingCTO", payload["body"])
	require.Equal(t, true, payload["draft"])
	require.Equal(t, 42, pr.Number)
	require.Equal(t, "https://github.com/acme/web/pull/42", pr.HTMLURL)
	require.Equal(t, "abc123", pr.Head.SHA)
}

func TestGitHubRepositoryClientListWorkflowRuns(t *testing.T) {
	createdAt := time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/actions/runs", r.URL.Path)
		require.Equal(t, "specforge/team-invite-02-api", r.URL.Query().Get("branch"))
		require.Equal(t, "20", r.URL.Query().Get("per_page"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"workflow_runs": []map[string]any{
				{
					"id":          123,
					"name":        "API",
					"head_branch": "specforge/team-invite-02-api",
					"head_sha":    "abc123",
					"status":      "completed",
					"conclusion":  "success",
					"html_url":    "https://github.com/acme/web/actions/runs/123",
					"created_at":  createdAt.Format(time.RFC3339),
					"updated_at":  createdAt.Add(time.Minute).Format(time.RFC3339),
				},
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	runs, err := client.ListWorkflowRuns(context.Background(), "acme", "web", "specforge/team-invite-02-api")

	require.NoError(t, err)
	require.Len(t, runs, 1)
	require.Equal(t, int64(123), runs[0].ID)
	require.Equal(t, "completed", runs[0].Status)
	require.Equal(t, "success", runs[0].Conclusion)
	require.Equal(t, createdAt, runs[0].CreatedAt)
}

func TestGitHubRepositoryClientListWorkflowJobs(t *testing.T) {
	startedAt := time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/actions/runs/123/jobs", r.URL.Path)
		require.Equal(t, "100", r.URL.Query().Get("per_page"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"jobs": []map[string]any{
				{
					"id":         987,
					"run_id":     123,
					"name":       "API",
					"status":     "completed",
					"conclusion": "failure",
					"html_url":   "https://github.com/acme/web/actions/runs/123/job/987",
					"started_at": startedAt.Format(time.RFC3339),
					"steps": []map[string]any{
						{
							"name":       "go test",
							"status":     "completed",
							"conclusion": "failure",
							"number":     4,
						},
					},
				},
			},
		})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	jobs, err := client.ListWorkflowJobs(context.Background(), "acme", "web", 123)

	require.NoError(t, err)
	require.Len(t, jobs, 1)
	require.Equal(t, int64(987), jobs[0].ID)
	require.Equal(t, "API", jobs[0].Name)
	require.Equal(t, "failure", jobs[0].Conclusion)
	require.NotNil(t, jobs[0].StartedAt)
	require.Equal(t, startedAt, *jobs[0].StartedAt)
	require.Len(t, jobs[0].Steps, 1)
	require.Equal(t, "go test", jobs[0].Steps[0].Name)
	require.Equal(t, 4, jobs[0].Steps[0].Number)
}

func TestGitHubRepositoryClientGetWorkflowJobLogs(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		require.Equal(t, http.MethodGet, r.Method)
		require.Equal(t, "/repos/acme/web/actions/jobs/987/logs", r.URL.Path)
		_, _ = w.Write([]byte("go test ./...\n--- FAIL: TestInvite\n"))
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	logs, err := client.GetWorkflowJobLogs(context.Background(), "acme", "web", 987)

	require.NoError(t, err)
	require.Equal(t, "Bearer ghs_token", authHeader)
	require.Contains(t, logs, "--- FAIL: TestInvite")
}

func TestGitHubRepositoryClientReturnsGitHubErrorMessage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": "Reference already exists"})
	}))
	defer server.Close()
	client := newTestRepositoryClient(t, server.URL)

	_, err := client.CreateBranch(context.Background(), "acme", "web", "main", "abc123")

	require.ErrorContains(t, err, "Reference already exists")
}

func newTestRepositoryClient(t *testing.T, baseURL string) *GitHubRepositoryClient {
	t.Helper()
	client, err := NewGitHubRepositoryClient("ghs_token", WithGitHubRepositoryAPIBaseURL(baseURL))
	require.NoError(t, err)
	return client
}
