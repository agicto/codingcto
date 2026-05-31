package githubintegration

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

var errGitHubAppConfigMissing = errors.New("github app token provider config missing")

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
		return nil, fmt.Errorf("%w: GITHUB_APP_ID is required", errGitHubAppConfigMissing)
	}
	privateKey, err := githubAppPrivateKeyFromEnv()
	if err != nil {
		return nil, err
	}
	client, err := NewGitHubAppClient(appID, privateKey, WithGitHubAPIBaseURL(os.Getenv("GITHUB_API_BASE_URL")))
	if err != nil {
		return nil, err
	}
	return client, nil
}

func githubAppPrivateKeyFromEnv() (string, error) {
	privateKey := strings.TrimSpace(os.Getenv("GITHUB_APP_PRIVATE_KEY"))
	if privateKey != "" {
		return privateKey, nil
	}

	privateKeyPath := strings.TrimSpace(os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH"))
	if privateKeyPath == "" {
		return "", fmt.Errorf("%w: GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH is required", errGitHubAppConfigMissing)
	}
	content, err := os.ReadFile(privateKeyPath)
	if err != nil {
		return "", fmt.Errorf("%w: read GITHUB_APP_PRIVATE_KEY_PATH: %v", errGitHubAppConfigMissing, err)
	}
	if strings.TrimSpace(string(content)) == "" {
		return "", fmt.Errorf("%w: GITHUB_APP_PRIVATE_KEY_PATH is empty", errGitHubAppConfigMissing)
	}
	return string(content), nil
}
