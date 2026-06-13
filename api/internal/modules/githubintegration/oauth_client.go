package githubintegration

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/zgiai/luas/api/pkg/env"
)

var errGitHubOAuthConfigMissing = errors.New("github oauth config missing")

type OAuthClient interface {
	AuthorizationURL(state string) (string, error)
	ExchangeCode(ctx context.Context, code string) (*OAuthToken, error)
	GetAuthenticatedUser(ctx context.Context, token string) (*OAuthUser, error)
	ListAuthenticatedRepositories(ctx context.Context, token string) ([]OAuthRepository, error)
}

type defaultOAuthClient struct {
	clientID     string
	clientSecret string
	redirectURL  string
	authorizeURL string
	tokenURL     string
	apiBaseURL   string
	scopes       []string
	httpClient   *http.Client
}

func NewDefaultOAuthClient() OAuthClient {
	return newDefaultOAuthClient()
}

func newDefaultOAuthClient() *defaultOAuthClient {
	apiBaseURL := strings.TrimRight(env.Get("GITHUB_API_BASE_URL", defaultGitHubAPIBaseURL), "/")
	return &defaultOAuthClient{
		clientID:     strings.TrimSpace(env.Get("GITHUB_OAUTH_CLIENT_ID", "")),
		clientSecret: strings.TrimSpace(env.Get("GITHUB_OAUTH_CLIENT_SECRET", "")),
		redirectURL:  strings.TrimSpace(env.Get("GITHUB_OAUTH_REDIRECT_URL", defaultOAuthRedirectURL())),
		authorizeURL: strings.TrimSpace(env.Get("GITHUB_OAUTH_AUTHORIZE_URL", "https://github.com/login/oauth/authorize")),
		tokenURL:     strings.TrimSpace(env.Get("GITHUB_OAUTH_TOKEN_URL", "https://github.com/login/oauth/access_token")),
		apiBaseURL:   apiBaseURL,
		scopes:       []string{"read:user", "read:org", "repo"},
		httpClient:   http.DefaultClient,
	}
}

type OAuthToken struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	Scope        string `json:"scope"`
	TokenType    string `json:"token_type"`
}

type OAuthUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

type OAuthRepository struct {
	ID            int64           `json:"id"`
	Name          string          `json:"name"`
	FullName      string          `json:"full_name"`
	HTMLURL       string          `json:"html_url"`
	DefaultBranch string          `json:"default_branch"`
	Private       bool            `json:"private"`
	Visibility    string          `json:"visibility"`
	Archived      bool            `json:"archived"`
	Disabled      bool            `json:"disabled"`
	Permissions   map[string]bool `json:"permissions"`
	Owner         struct {
		Login string `json:"login"`
		Type  string `json:"type"`
	} `json:"owner"`
}

func (c *defaultOAuthClient) AuthorizationURL(state string) (string, error) {
	if strings.TrimSpace(c.clientID) == "" {
		return "", fmt.Errorf("%w: GITHUB_OAUTH_CLIENT_ID is required", errGitHubOAuthConfigMissing)
	}
	values := url.Values{}
	values.Set("client_id", c.clientID)
	values.Set("scope", strings.Join(c.scopes, " "))
	values.Set("state", strings.TrimSpace(state))
	if strings.TrimSpace(c.redirectURL) != "" {
		values.Set("redirect_uri", strings.TrimSpace(c.redirectURL))
	}
	return strings.TrimRight(c.authorizeURL, "?") + "?" + values.Encode(), nil
}

func (c *defaultOAuthClient) ExchangeCode(ctx context.Context, code string) (*OAuthToken, error) {
	if strings.TrimSpace(c.clientID) == "" || strings.TrimSpace(c.clientSecret) == "" {
		return nil, fmt.Errorf("%w: GITHUB_OAUTH_CLIENT_ID and GITHUB_OAUTH_CLIENT_SECRET are required", errGitHubOAuthConfigMissing)
	}
	if strings.TrimSpace(code) == "" {
		return nil, fmt.Errorf("github oauth client: code is required")
	}
	payload := map[string]string{
		"client_id":     c.clientID,
		"client_secret": c.clientSecret,
		"code":          strings.TrimSpace(code),
	}
	if strings.TrimSpace(c.redirectURL) != "" {
		payload["redirect_uri"] = strings.TrimSpace(c.redirectURL)
	}
	var body OAuthToken
	if err := c.doToken(ctx, payload, &body); err != nil {
		return nil, err
	}
	if strings.TrimSpace(body.AccessToken) == "" {
		return nil, fmt.Errorf("github oauth client: token response missing access token")
	}
	return &body, nil
}

func (c *defaultOAuthClient) GetAuthenticatedUser(ctx context.Context, token string) (*OAuthUser, error) {
	var user OAuthUser
	if err := c.doAPI(ctx, token, http.MethodGet, "/user", nil, &user); err != nil {
		return nil, err
	}
	if user.ID == 0 || strings.TrimSpace(user.Login) == "" {
		return nil, fmt.Errorf("github oauth client: user response missing identity")
	}
	return &user, nil
}

func (c *defaultOAuthClient) ListAuthenticatedRepositories(ctx context.Context, token string) ([]OAuthRepository, error) {
	repositories := []OAuthRepository{}
	path := "/user/repos?per_page=100&visibility=all&affiliation=owner,collaborator,organization_member&sort=full_name"
	for {
		var page []OAuthRepository
		header, err := c.doAPIWithHeader(ctx, token, http.MethodGet, path, nil, &page)
		if err != nil {
			return nil, err
		}
		repositories = append(repositories, page...)
		next := nextLinkFromHeader(header.Get("Link"))
		if next == "" {
			break
		}
		path = next
	}
	return repositories, nil
}

func (c *defaultOAuthClient) doToken(ctx context.Context, payload any, out any) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("github oauth client: encode token request: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("github oauth client: read token response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorBody struct {
			Error            string `json:"error"`
			ErrorDescription string `json:"error_description"`
		}
		_ = json.Unmarshal(body, &errorBody)
		if strings.TrimSpace(errorBody.ErrorDescription) != "" {
			return fmt.Errorf("github oauth client: token request failed: %s", strings.TrimSpace(errorBody.ErrorDescription))
		}
		if strings.TrimSpace(errorBody.Error) != "" {
			return fmt.Errorf("github oauth client: token request failed: %s", strings.TrimSpace(errorBody.Error))
		}
		return fmt.Errorf("github oauth client: token request failed with HTTP %d", resp.StatusCode)
	}
	if err := json.Unmarshal(body, out); err != nil {
		return fmt.Errorf("github oauth client: decode token response: %w", err)
	}
	return nil
}

func (c *defaultOAuthClient) doAPI(ctx context.Context, token, method, path string, payload any, out any) error {
	_, err := c.doAPIWithHeader(ctx, token, method, path, payload, out)
	return err
}

func (c *defaultOAuthClient) doAPIWithHeader(ctx context.Context, token, method, path string, payload any, out any) (http.Header, error) {
	if strings.TrimSpace(token) == "" {
		return nil, fmt.Errorf("github oauth client: token is required")
	}
	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return nil, fmt.Errorf("github oauth client: encode request: %w", err)
		}
		body = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, strings.TrimRight(c.apiBaseURL, "/")+path, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(token))
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
		return nil, fmt.Errorf("github oauth client: read response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var errorBody struct {
			Message string `json:"message"`
		}
		_ = json.Unmarshal(responseBody, &errorBody)
		if strings.TrimSpace(errorBody.Message) != "" {
			return nil, fmt.Errorf("github oauth client: request failed: %s", strings.TrimSpace(errorBody.Message))
		}
		return nil, fmt.Errorf("github oauth client: request failed with HTTP %d", resp.StatusCode)
	}
	if out != nil && len(responseBody) > 0 {
		if err := json.Unmarshal(responseBody, out); err != nil {
			return nil, fmt.Errorf("github oauth client: decode response: %w", err)
		}
	}
	return resp.Header, nil
}

func defaultOAuthRedirectURL() string {
	apiURL := strings.TrimRight(env.Get("APP_URL", "http://localhost:2010"), "/")
	return apiURL + "/v1/github/oauth/callback"
}
