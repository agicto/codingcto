package githubintegration

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestParseGitHubWebhookPayloadPullRequest(t *testing.T) {
	body := []byte(`{
		"action": "opened",
		"installation": {"id": 123},
		"repository": {
			"full_name": "agicto/codingcto",
			"name": "codingcto",
			"owner": {"login": "agicto"}
		},
		"pull_request": {
			"number": 42,
			"state": "open",
			"merged": false,
			"mergeable_state": "clean",
			"html_url": "https://github.com/agicto/codingcto/pull/42",
			"head": {"ref": "specforge/team-invite-02-api", "sha": "abc123"},
			"base": {"ref": "main"}
		}
	}`)

	event, err := ParseGitHubWebhookPayload(GitHubWebhookEventPullRequest, body)

	require.NoError(t, err)
	require.Equal(t, GitHubWebhookEventPullRequest, event.EventType)
	require.Equal(t, "opened", event.Action)
	require.Equal(t, int64(123), event.InstallationID)
	require.Equal(t, "agicto/codingcto", event.RepositoryFullName)
	require.Equal(t, "agicto", event.RepositoryOwner)
	require.Equal(t, "codingcto", event.RepositoryName)
	require.NotNil(t, event.PullRequest)
	require.Equal(t, 42, event.PullRequest.Number)
	require.Equal(t, "clean", event.PullRequest.MergeableState)
	require.Equal(t, "specforge/team-invite-02-api", event.PullRequest.HeadBranch)
	require.Equal(t, "abc123", event.PullRequest.HeadSHA)
	require.Equal(t, "main", event.PullRequest.BaseBranch)
	require.Nil(t, event.WorkflowRun)
}

func TestParseGitHubWebhookPayloadWorkflowRun(t *testing.T) {
	body := []byte(`{
		"action": "completed",
		"installation": {"id": 123},
		"repository": {
			"full_name": "agicto/codingcto",
			"name": "codingcto",
			"owner": {"login": "agicto"}
		},
		"workflow_run": {
			"id": 987,
			"name": "API",
			"head_branch": "specforge/team-invite-02-api",
			"head_sha": "abc123",
			"status": "completed",
			"conclusion": "failure",
			"html_url": "https://github.com/agicto/codingcto/actions/runs/987",
			"pull_requests": [{"number": 42}, {"number": 0}]
		}
	}`)

	event, err := ParseGitHubWebhookPayload(GitHubWebhookEventWorkflowRun, body)

	require.NoError(t, err)
	require.Equal(t, "completed", event.Action)
	require.NotNil(t, event.WorkflowRun)
	require.Equal(t, int64(987), event.WorkflowRun.ID)
	require.Equal(t, "API", event.WorkflowRun.Name)
	require.Equal(t, "specforge/team-invite-02-api", event.WorkflowRun.HeadBranch)
	require.Equal(t, "completed", event.WorkflowRun.Status)
	require.Equal(t, "failure", event.WorkflowRun.Conclusion)
	require.Equal(t, []int{42}, event.WorkflowRun.PullRequestNumbers)
	require.Nil(t, event.PullRequest)
}

func TestParseGitHubWebhookPayloadUnsupportedEventStillReturnsMetadata(t *testing.T) {
	body := []byte(`{
		"action": "created",
		"installation": {"id": 123},
		"repository": {"full_name": "agicto/codingcto"}
	}`)

	event, err := ParseGitHubWebhookPayload("issue_comment", body)

	require.NoError(t, err)
	require.Equal(t, "issue_comment", event.EventType)
	require.Equal(t, "created", event.Action)
	require.Equal(t, int64(123), event.InstallationID)
	require.Equal(t, "agicto/codingcto", event.RepositoryFullName)
	require.Nil(t, event.PullRequest)
	require.Nil(t, event.WorkflowRun)
}

func TestParseGitHubWebhookPayloadRejectsInvalidJSON(t *testing.T) {
	_, err := ParseGitHubWebhookPayload(GitHubWebhookEventPullRequest, []byte(`{`))

	require.ErrorContains(t, err, "decode payload")
}
