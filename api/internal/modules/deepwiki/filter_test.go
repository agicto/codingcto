package deepwiki

import "testing"

func TestFileFilterSkipsIgnoredAndSecretFiles(t *testing.T) {
	filter := newFileFilter()

	for _, path := range []string{
		".git/config",
		"web/node_modules/react/index.js",
		"api/.env",
		"server/private.key",
		"tmp/app.sqlite",
		"public/logo.png",
	} {
		if !filter.shouldSkipPath(path) {
			t.Fatalf("expected %s to be skipped", path)
		}
	}

	if filter.shouldSkipPath("api/internal/modules/user/service.go") {
		t.Fatal("expected regular source file to be allowed")
	}
	if !filter.containsSecret("GITHUB_TOKEN=ghp_123456789012345678901234567890123456") {
		t.Fatal("expected GitHub token content to be treated as secret")
	}
	if !filter.containsSecret("-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----") {
		t.Fatal("expected private key content to be treated as secret")
	}
}
