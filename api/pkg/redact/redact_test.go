package redact

import (
	"strings"
	"testing"
)

func TestTextRedactsKnownSecrets(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name        string
		input       string
		notContains string
		contains    string
	}{
		{
			name:        "github token",
			input:       "GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmn",
			notContains: "ghp_",
			contains:    "[REDACTED CREDENTIAL]",
		},
		{
			name:        "openai key",
			input:       "OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345",
			notContains: "sk-proj-abc123",
			contains:    "[REDACTED CREDENTIAL]",
		},
		{
			name:        "connection string",
			input:       "postgres://admin:s3cret@db.example.com:5432/app",
			notContains: "s3cret",
			contains:    "[REDACTED CONNECTION STRING]@",
		},
		{
			name:        "private key",
			input:       "-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----",
			notContains: "MIIEow",
			contains:    "[REDACTED PRIVATE KEY]",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := Text(tc.input)
			if strings.Contains(got, tc.notContains) {
				t.Fatalf("secret was not redacted: %s", got)
			}
			if !strings.Contains(got, tc.contains) {
				t.Fatalf("expected placeholder %q in %q", tc.contains, got)
			}
		})
	}
}

func TestTextLeavesNormalOutputAlone(t *testing.T) {
	t.Parallel()
	input := "go test ./... passed; created PR #42"
	if got := Text(input); got != input {
		t.Fatalf("unexpected redaction: %q", got)
	}
}

func TestStringMapRedactsValues(t *testing.T) {
	t.Parallel()
	got := StringMap(map[string]string{
		"command": "echo sk-proj-abc123def456ghi789jkl012mno345",
		"plain":   "ok",
	})
	if strings.Contains(got["command"], "sk-proj-abc123") {
		t.Fatalf("secret was not redacted: %s", got["command"])
	}
	if got["plain"] != "ok" {
		t.Fatalf("clean value changed: %s", got["plain"])
	}
	if StringMap(nil) != nil {
		t.Fatal("nil map should stay nil")
	}
}
