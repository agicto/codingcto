package githubintegration

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
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
	return withGitHubAppRetry(ctx, func() (*InstallationToken, error) {
		return client.InstallationToken(ctx, installationID)
	})
}

func (defaultInstallationTokenProvider) Installation(ctx context.Context, installationID int64) (*GitHubAppInstallation, error) {
	client, err := newGitHubAppClientFromEnv()
	if err != nil {
		return nil, err
	}
	return withGitHubAppRetry(ctx, func() (*GitHubAppInstallation, error) {
		return client.Installation(ctx, installationID)
	})
}

func withGitHubAppRetry[T any](ctx context.Context, fn func() (T, error)) (T, error) {
	var zero T
	var lastErr error
	for attempt := 0; attempt < 6; attempt++ {
		if attempt > 0 {
			timer := time.NewTimer(time.Duration(attempt) * 500 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return zero, ctx.Err()
			case <-timer.C:
			}
		}
		value, err := fn()
		if err == nil {
			return value, nil
		}
		lastErr = err
	}
	return zero, lastErr
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
