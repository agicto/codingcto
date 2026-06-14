package githubintegration

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/zgiai/luas/api/internal/capabilities/crypto"
	"github.com/zgiai/luas/api/internal/domain"
)

type oauthStatePayload struct {
	WorkspaceID string `json:"workspace_id"`
	UserID      uint   `json:"user_id"`
	RedirectTo  string `json:"redirect_to,omitempty"`
	Nonce       string `json:"nonce"`
	IssuedAt    int64  `json:"issued_at"`
	Signature   string `json:"signature"`
}

func newOAuthState(workspaceID string, userID uint, redirectTo string) (string, error) {
	key := githubOAuthStateKey()
	if key == "" {
		return "", fmt.Errorf("%w: GITHUB_OAUTH_STATE_SECRET, SESSION_SECRET, JWT_SECRET, or APP_KEY is required", errGitHubOAuthConfigMissing)
	}
	nonce, err := crypto.GenerateKeyHex(16)
	if err != nil {
		return "", err
	}
	payload := oauthStatePayload{
		WorkspaceID: strings.TrimSpace(workspaceID),
		UserID:      userID,
		RedirectTo:  strings.TrimSpace(redirectTo),
		Nonce:       nonce,
		IssuedAt:    time.Now().UTC().Unix(),
	}
	payload.Signature = signOAuthState(payload, key)
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(encoded), nil
}

func parseOAuthState(state string) (*oauthStatePayload, error) {
	key := githubOAuthStateKey()
	if key == "" {
		return nil, fmt.Errorf("%w: GITHUB_OAUTH_STATE_SECRET, SESSION_SECRET, JWT_SECRET, or APP_KEY is required", errGitHubOAuthConfigMissing)
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimSpace(state))
	if err != nil {
		return nil, fmt.Errorf("%w: invalid oauth state", domain.ErrInvalidInput)
	}
	var payload oauthStatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, fmt.Errorf("%w: invalid oauth state", domain.ErrInvalidInput)
	}
	if strings.TrimSpace(payload.WorkspaceID) == "" || payload.UserID == 0 || strings.TrimSpace(payload.Nonce) == "" || payload.IssuedAt == 0 {
		return nil, fmt.Errorf("%w: incomplete oauth state", domain.ErrInvalidInput)
	}
	if time.Since(time.Unix(payload.IssuedAt, 0)) > 15*time.Minute {
		return nil, fmt.Errorf("%w: oauth state expired", domain.ErrInvalidInput)
	}
	expected := signOAuthState(payload, key)
	if !strings.EqualFold(expected, strings.TrimSpace(payload.Signature)) {
		return nil, fmt.Errorf("%w: oauth state signature mismatch", domain.ErrInvalidInput)
	}
	return &payload, nil
}

func signOAuthState(payload oauthStatePayload, key string) string {
	data := fmt.Sprintf("%s\n%d\n%s\n%s\n%d",
		strings.TrimSpace(payload.WorkspaceID),
		payload.UserID,
		strings.TrimSpace(payload.RedirectTo),
		strings.TrimSpace(payload.Nonce),
		payload.IssuedAt,
	)
	return crypto.HMACSHA256Hex(data, key)
}

func encryptGitHubToken(token string) (string, error) {
	if strings.TrimSpace(token) == "" {
		return "", nil
	}
	key := githubOAuthTokenEncryptionKey()
	if key == "" {
		return "", fmt.Errorf("%w: GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY, SESSION_SECRET, APP_KEY, or JWT_SECRET is required", errGitHubOAuthConfigMissing)
	}
	encrypted, err := crypto.NewAESEncryptorFromString(key).EncryptString(strings.TrimSpace(token))
	if err != nil {
		return "", fmt.Errorf("encrypt github oauth token: %w", err)
	}
	return encrypted, nil
}

func decryptGitHubToken(encrypted string) (string, error) {
	if strings.TrimSpace(encrypted) == "" {
		return "", nil
	}
	key := githubOAuthTokenEncryptionKey()
	if key == "" {
		return "", fmt.Errorf("%w: GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY, SESSION_SECRET, APP_KEY, or JWT_SECRET is required", errGitHubOAuthConfigMissing)
	}
	token, err := crypto.NewAESEncryptorFromString(key).DecryptString(strings.TrimSpace(encrypted))
	if err != nil {
		return "", fmt.Errorf("decrypt github oauth token: %w", err)
	}
	return token, nil
}

func githubOAuthStateKey() string {
	return firstGitHubSecret("GITHUB_OAUTH_STATE_SECRET", "SESSION_SECRET", "JWT_SECRET", "APP_KEY")
}

func githubOAuthTokenEncryptionKey() string {
	return firstGitHubSecret("GITHUB_OAUTH_TOKEN_ENCRYPTION_KEY", "SESSION_SECRET", "APP_KEY", "JWT_SECRET")
}

func firstGitHubSecret(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
