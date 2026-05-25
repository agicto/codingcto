package githubintegration

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

func TestGitHubAppClientAppJWTUsesRS256Claims(t *testing.T) {
	privateKeyPEM := testRSAPrivateKeyPEM(t)
	now := time.Date(2026, 5, 25, 10, 0, 0, 0, time.UTC)
	client, err := NewGitHubAppClient(12345, privateKeyPEM, withGitHubClock(func() time.Time { return now }))
	require.NoError(t, err)

	signed, err := client.AppJWT()

	require.NoError(t, err)
	token, _, err := jwt.NewParser().ParseUnverified(signed, &jwt.RegisteredClaims{})
	require.NoError(t, err)
	require.Equal(t, jwt.SigningMethodRS256.Alg(), token.Method.Alg())
	claims := token.Claims.(*jwt.RegisteredClaims)
	require.Equal(t, "12345", claims.Issuer)
	require.Equal(t, now.Add(-1*time.Minute).Unix(), claims.IssuedAt.Unix())
	require.Equal(t, now.Add(9*time.Minute).Unix(), claims.ExpiresAt.Unix())
}

func TestGitHubAppClientInstallationToken(t *testing.T) {
	privateKeyPEM := testRSAPrivateKeyPEM(t)
	expiresAt := time.Date(2026, 5, 25, 11, 0, 0, 0, time.UTC)
	var authHeader string
	var requestPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		requestPath = r.URL.Path
		require.Equal(t, "POST", r.Method)
		require.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token":      "ghs_installation_token",
			"expires_at": expiresAt.Format(time.RFC3339),
		})
	}))
	defer server.Close()
	client, err := NewGitHubAppClient(12345, privateKeyPEM, WithGitHubAPIBaseURL(server.URL))
	require.NoError(t, err)

	token, err := client.InstallationToken(context.Background(), 99)

	require.NoError(t, err)
	require.Equal(t, "/app/installations/99/access_tokens", requestPath)
	require.True(t, strings.HasPrefix(authHeader, "Bearer "))
	require.Equal(t, "ghs_installation_token", token.Token)
	require.Equal(t, expiresAt, token.ExpiresAt)
}

func TestGitHubAppClientInstallationTokenHandlesGitHubError(t *testing.T) {
	privateKeyPEM := testRSAPrivateKeyPEM(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{"message": "Bad credentials"})
	}))
	defer server.Close()
	client, err := NewGitHubAppClient(12345, privateKeyPEM, WithGitHubAPIBaseURL(server.URL))
	require.NoError(t, err)

	_, err = client.InstallationToken(context.Background(), 99)

	require.ErrorContains(t, err, "Bad credentials")
}

func TestGitHubAppClientInstallationTokenHandlesNonJSONError(t *testing.T) {
	privateKeyPEM := testRSAPrivateKeyPEM(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte("gateway unavailable"))
	}))
	defer server.Close()
	client, err := NewGitHubAppClient(12345, privateKeyPEM, WithGitHubAPIBaseURL(server.URL))
	require.NoError(t, err)

	_, err = client.InstallationToken(context.Background(), 99)

	require.ErrorContains(t, err, "HTTP 502")
}

func testRSAPrivateKeyPEM(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der := x509.MarshalPKCS1PrivateKey(key)
	block := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}
	return string(pem.EncodeToMemory(block))
}
