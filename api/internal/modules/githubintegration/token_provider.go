package githubintegration

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type InstallationTokenProvider interface {
	InstallationToken(ctx context.Context, installationID int64) (*InstallationToken, error)
	Installation(ctx context.Context, installationID int64) (*GitHubAppInstallation, error)
}

type defaultInstallationTokenProvider struct{}

func NewDefaultInstallationTokenProvider() InstallationTokenProvider {
	return defaultInstallationTokenProvider{}
}

func (defaultInstallationTokenProvider) InstallationToken(ctx context.Context, installationID int64) (*InstallationToken, error) {
	client, err := newGitHubAppClientFromEnv()
	if err != nil {
		return nil, err
	}
	return client.InstallationToken(ctx, installationID)
}

func (defaultInstallationTokenProvider) Installation(ctx context.Context, installationID int64) (*GitHubAppInstallation, error) {
	client, err := newGitHubAppClientFromEnv()
	if err != nil {
		return nil, err
	}
	return client.Installation(ctx, installationID)
}

func newGitHubAppClientFromEnv() (*GitHubAppClient, error) {
	appID, err := strconv.ParseInt(strings.TrimSpace(os.Getenv("GITHUB_APP_ID")), 10, 64)
	if err != nil || appID == 0 {
		return nil, fmt.Errorf("github app token provider: GITHUB_APP_ID is required")
	}
	privateKey := strings.TrimSpace(os.Getenv("GITHUB_APP_PRIVATE_KEY"))
	if privateKey == "" {
		return nil, fmt.Errorf("github app token provider: GITHUB_APP_PRIVATE_KEY is required")
	}
	client, err := NewGitHubAppClient(appID, privateKey, WithGitHubAPIBaseURL(os.Getenv("GITHUB_API_BASE_URL")))
	if err != nil {
		return nil, err
	}
	return client, nil
}
