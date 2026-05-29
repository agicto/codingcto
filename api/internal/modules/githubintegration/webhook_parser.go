package githubintegration

import (
	"encoding/json"
	"fmt"
	"strings"
)

const (
	GitHubWebhookEventPullRequest              = "pull_request"
	GitHubWebhookEventWorkflowRun              = "workflow_run"
	GitHubWebhookEventIssueComment             = "issue_comment"
	GitHubWebhookEventPullRequestReview        = "pull_request_review"
	GitHubWebhookEventPullRequestReviewComment = "pull_request_review_comment"
	GitHubWebhookStatusReceived                = "received"
	GitHubWebhookStatusProcessed               = "processed"
	GitHubWebhookStatusFailed                  = "failed"
)

type StructuredGitHubWebhook struct {
	EventType          string
	Action             string
	InstallationID     int64
	RepositoryFullName string
	RepositoryOwner    string
	RepositoryName     string
	PullRequest        *WebhookPullRequest
	WorkflowRun        *WebhookWorkflowRun
	ReviewComment      *WebhookReviewComment
}

type WebhookPullRequest struct {
	Number         int
	State          string
	Merged         bool
	MergeableState string
	HeadBranch     string
	HeadSHA        string
	BaseBranch     string
	HTMLURL        string
}

type WebhookWorkflowRun struct {
	ID                 int64
	Name               string
	HeadBranch         string
	HeadSHA            string
	Status             string
	Conclusion         string
	HTMLURL            string
	PullRequestNumbers []int
}

type WebhookReviewComment struct {
	PullRequestNumber int
	Body              string
	AuthorLogin       string
	HTMLURL           string
	Path              string
	CommitSHA         string
}

func ParseGitHubWebhookPayload(eventType string, body []byte) (*StructuredGitHubWebhook, error) {
	if strings.TrimSpace(eventType) == "" || len(body) == 0 {
		return nil, fmt.Errorf("github webhook parser: event type and body are required")
	}
	var payload githubWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("github webhook parser: decode payload: %w", err)
	}
	event := &StructuredGitHubWebhook{
		EventType:          strings.TrimSpace(eventType),
		Action:             strings.TrimSpace(payload.Action),
		InstallationID:     payload.Installation.ID,
		RepositoryFullName: strings.TrimSpace(payload.Repository.FullName),
		RepositoryOwner:    strings.TrimSpace(payload.Repository.Owner.Login),
		RepositoryName:     strings.TrimSpace(payload.Repository.Name),
	}
	switch event.EventType {
	case GitHubWebhookEventPullRequest:
		event.PullRequest = payload.PullRequest.toWebhookPullRequest()
	case GitHubWebhookEventWorkflowRun:
		event.WorkflowRun = payload.WorkflowRun.toWebhookWorkflowRun()
	case GitHubWebhookEventIssueComment:
		event.PullRequest = payload.Issue.toWebhookPullRequest()
		event.ReviewComment = payload.Comment.toWebhookReviewComment(payload.Issue.Number)
	case GitHubWebhookEventPullRequestReview:
		event.PullRequest = payload.PullRequest.toWebhookPullRequest()
		event.ReviewComment = payload.Review.toWebhookReviewComment(payload.PullRequest.Number)
	case GitHubWebhookEventPullRequestReviewComment:
		event.PullRequest = payload.PullRequest.toWebhookPullRequest()
		event.ReviewComment = payload.Comment.toWebhookReviewComment(payload.PullRequest.Number)
	}
	return event, nil
}

type githubWebhookPayload struct {
	Action       string `json:"action"`
	Installation struct {
		ID int64 `json:"id"`
	} `json:"installation"`
	Repository struct {
		FullName string `json:"full_name"`
		Name     string `json:"name"`
		Owner    struct {
			Login string `json:"login"`
		} `json:"owner"`
	} `json:"repository"`
	PullRequest githubWebhookPullRequest `json:"pull_request"`
	WorkflowRun githubWebhookWorkflowRun `json:"workflow_run"`
	Issue       githubWebhookIssue       `json:"issue"`
	Comment     githubWebhookComment     `json:"comment"`
	Review      githubWebhookReview      `json:"review"`
}

type githubWebhookPullRequest struct {
	Number         int    `json:"number"`
	State          string `json:"state"`
	Merged         bool   `json:"merged"`
	MergeableState string `json:"mergeable_state"`
	HTMLURL        string `json:"html_url"`
	Head           struct {
		Ref string `json:"ref"`
		SHA string `json:"sha"`
	} `json:"head"`
	Base struct {
		Ref string `json:"ref"`
	} `json:"base"`
}

func (pr githubWebhookPullRequest) toWebhookPullRequest() *WebhookPullRequest {
	if pr.Number == 0 {
		return nil
	}
	return &WebhookPullRequest{
		Number:         pr.Number,
		State:          strings.TrimSpace(pr.State),
		Merged:         pr.Merged,
		MergeableState: strings.TrimSpace(pr.MergeableState),
		HeadBranch:     strings.TrimSpace(pr.Head.Ref),
		HeadSHA:        strings.TrimSpace(pr.Head.SHA),
		BaseBranch:     strings.TrimSpace(pr.Base.Ref),
		HTMLURL:        strings.TrimSpace(pr.HTMLURL),
	}
}

type githubWebhookIssue struct {
	Number      int    `json:"number"`
	State       string `json:"state"`
	HTMLURL     string `json:"html_url"`
	PullRequest *struct {
		URL     string `json:"url"`
		HTMLURL string `json:"html_url"`
	} `json:"pull_request"`
}

func (issue githubWebhookIssue) toWebhookPullRequest() *WebhookPullRequest {
	if issue.Number == 0 || issue.PullRequest == nil {
		return nil
	}
	return &WebhookPullRequest{
		Number:  issue.Number,
		State:   strings.TrimSpace(issue.State),
		HTMLURL: strings.TrimSpace(issue.PullRequest.HTMLURL),
	}
}

type githubWebhookComment struct {
	Body     string `json:"body"`
	HTMLURL  string `json:"html_url"`
	Path     string `json:"path"`
	CommitID string `json:"commit_id"`
	Author   struct {
		Login string `json:"login"`
	} `json:"user"`
}

func (comment githubWebhookComment) toWebhookReviewComment(prNumber int) *WebhookReviewComment {
	if prNumber == 0 || strings.TrimSpace(comment.Body) == "" {
		return nil
	}
	return &WebhookReviewComment{
		PullRequestNumber: prNumber,
		Body:              strings.TrimSpace(comment.Body),
		AuthorLogin:       strings.TrimSpace(comment.Author.Login),
		HTMLURL:           strings.TrimSpace(comment.HTMLURL),
		Path:              strings.TrimSpace(comment.Path),
		CommitSHA:         strings.TrimSpace(comment.CommitID),
	}
}

type githubWebhookReview struct {
	Body     string `json:"body"`
	HTMLURL  string `json:"html_url"`
	CommitID string `json:"commit_id"`
	Author   struct {
		Login string `json:"login"`
	} `json:"user"`
}

func (review githubWebhookReview) toWebhookReviewComment(prNumber int) *WebhookReviewComment {
	if prNumber == 0 || strings.TrimSpace(review.Body) == "" {
		return nil
	}
	return &WebhookReviewComment{
		PullRequestNumber: prNumber,
		Body:              strings.TrimSpace(review.Body),
		AuthorLogin:       strings.TrimSpace(review.Author.Login),
		HTMLURL:           strings.TrimSpace(review.HTMLURL),
		CommitSHA:         strings.TrimSpace(review.CommitID),
	}
}

type githubWebhookWorkflowRun struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	HeadBranch   string `json:"head_branch"`
	HeadSHA      string `json:"head_sha"`
	Status       string `json:"status"`
	Conclusion   string `json:"conclusion"`
	HTMLURL      string `json:"html_url"`
	PullRequests []struct {
		Number int `json:"number"`
	} `json:"pull_requests"`
}

func (run githubWebhookWorkflowRun) toWebhookWorkflowRun() *WebhookWorkflowRun {
	if run.ID == 0 {
		return nil
	}
	numbers := make([]int, 0, len(run.PullRequests))
	for _, pr := range run.PullRequests {
		if pr.Number > 0 {
			numbers = append(numbers, pr.Number)
		}
	}
	return &WebhookWorkflowRun{
		ID:                 run.ID,
		Name:               strings.TrimSpace(run.Name),
		HeadBranch:         strings.TrimSpace(run.HeadBranch),
		HeadSHA:            strings.TrimSpace(run.HeadSHA),
		Status:             strings.TrimSpace(run.Status),
		Conclusion:         strings.TrimSpace(run.Conclusion),
		HTMLURL:            strings.TrimSpace(run.HTMLURL),
		PullRequestNumbers: numbers,
	}
}
