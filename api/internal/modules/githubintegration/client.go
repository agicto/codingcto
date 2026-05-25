package githubintegration

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const defaultGitHubAPIBaseURL = "https://api.github.com"

type GitHubAppClient struct {
	appID      int64
	privateKey *rsa.PrivateKey
	baseURL    string
	httpClient *http.Client
	now        func() time.Time
}

type InstallationToken struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at"`
}

func NewGitHubAppClient(appID int64, privateKeyPEM string, opts ...GitHubAppClientOption) (*GitHubAppClient, error) {
	if appID == 0 || strings.TrimSpace(privateKeyPEM) == "" {
		return nil, fmt.Errorf("github app client: app id and private key are required")
	}
	privateKey, err := parseGitHubAppPrivateKey(privateKeyPEM)
	if err != nil {
		return nil, err
	}
	client := &GitHubAppClient{
		appID:      appID,
		privateKey: privateKey,
		baseURL:    defaultGitHubAPIBaseURL,
		httpClient: http.DefaultClient,
		now:        time.Now,
	}
	for _, opt := range opts {
		opt(client)
	}
	return client, nil
}

type GitHubAppClientOption func(*GitHubAppClient)

func WithGitHubAPIBaseURL(baseURL string) GitHubAppClientOption {
	return func(client *GitHubAppClient) {
		if strings.TrimSpace(baseURL) != "" {
			client.baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
		}
	}
}

func WithGitHubHTTPClient(httpClient *http.Client) GitHubAppClientOption {
	return func(client *GitHubAppClient) {
		if httpClient != nil {
			client.httpClient = httpClient
		}
	}
}

func withGitHubClock(now func() time.Time) GitHubAppClientOption {
	return func(client *GitHubAppClient) {
		if now != nil {
			client.now = now
		}
	}
}

func (c *GitHubAppClient) InstallationToken(ctx context.Context, installationID int64) (*InstallationToken, error) {
	if installationID == 0 {
		return nil, fmt.Errorf("github app client: installation id is required")
	}
	jwtToken, err := c.AppJWT()
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/app/installations/%d/access_tokens", strings.TrimRight(c.baseURL, "/"), installationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader([]byte("{}")))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("github app client: read token response: %w", err)
	}
	var body struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
		Message   string    `json:"message"`
	}
	if len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, &body); err != nil && resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return nil, fmt.Errorf("github app client: decode token response: %w", err)
		}
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if body.Message != "" {
			return nil, fmt.Errorf("github app client: token request failed: %s", body.Message)
		}
		return nil, fmt.Errorf("github app client: token request failed with HTTP %d", resp.StatusCode)
	}
	if strings.TrimSpace(body.Token) == "" {
		return nil, fmt.Errorf("github app client: token response missing token")
	}
	return &InstallationToken{Token: body.Token, ExpiresAt: body.ExpiresAt}, nil
}

func (c *GitHubAppClient) AppJWT() (string, error) {
	now := c.now()
	claims := jwt.RegisteredClaims{
		Issuer:    fmt.Sprintf("%d", c.appID),
		IssuedAt:  jwt.NewNumericDate(now.Add(-1 * time.Minute)),
		ExpiresAt: jwt.NewNumericDate(now.Add(9 * time.Minute)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signed, err := token.SignedString(c.privateKey)
	if err != nil {
		return "", fmt.Errorf("github app client: sign jwt: %w", err)
	}
	return signed, nil
}

func parseGitHubAppPrivateKey(privateKeyPEM string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(privateKeyPEM))
	if block == nil {
		return nil, fmt.Errorf("github app client: invalid private key PEM")
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM(pem.EncodeToMemory(block))
	if err != nil {
		return nil, fmt.Errorf("github app client: parse private key: %w", err)
	}
	return key, nil
}
