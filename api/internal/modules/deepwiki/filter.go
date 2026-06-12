package deepwiki

import (
	"bytes"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	maxIndexedFiles     = 10000
	maxTextFileBytes    = 512 * 1024
	maxIndexedRepoBytes = 200 * 1024 * 1024
)

var (
	ignoredDirNames = map[string]struct{}{
		".git":         {},
		"node_modules": {},
		"dist":         {},
		"build":        {},
		".next":        {},
		"turbo":        {},
		"coverage":     {},
		"vendor":       {},
	}
	ignoredFileNames = map[string]struct{}{
		".env":       {},
		".env.local": {},
	}
	ignoredExtensions = map[string]struct{}{
		".pem":    {},
		".key":    {},
		".crt":    {},
		".sqlite": {},
		".db":     {},
		".png":    {},
		".jpg":    {},
		".jpeg":   {},
		".gif":    {},
		".webp":   {},
		".pdf":    {},
		".zip":    {},
	}
	secretPatterns = []*regexp.Regexp{
		regexp.MustCompile(`-----BEGIN [A-Z ]*PRIVATE KEY-----`),
		regexp.MustCompile(`gh[pousr]_[A-Za-z0-9_]{20,}`),
		regexp.MustCompile(`(?i)sk-[A-Za-z0-9_-]{20,}`),
		regexp.MustCompile(`(?i)(openai|anthropic|github|api)[A-Z0-9_ -]*(key|token|secret)\s*=\s*["']?[A-Za-z0-9_\-]{16,}`),
		regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
		regexp.MustCompile(`(?m)^\s*(AWS_SECRET_ACCESS_KEY|DATABASE_URL|REDIS_URL|SECRET_KEY|SESSION_SECRET)\s*=`),
	}
)

type fileFilter struct{}

func newFileFilter() fileFilter {
	return fileFilter{}
}

func (fileFilter) shouldSkipPath(path string) bool {
	path = filepath.ToSlash(strings.TrimSpace(path))
	if path == "" {
		return true
	}
	parts := strings.Split(path, "/")
	for _, part := range parts {
		if _, ok := ignoredDirNames[part]; ok {
			return true
		}
	}
	base := strings.ToLower(filepath.Base(path))
	if _, ok := ignoredFileNames[base]; ok {
		return true
	}
	if strings.HasPrefix(base, ".env.") {
		return true
	}
	ext := strings.ToLower(filepath.Ext(base))
	_, ignored := ignoredExtensions[ext]
	return ignored
}

func (fileFilter) isText(content []byte) bool {
	return !bytes.Contains(content, []byte{0})
}

func (fileFilter) containsSecret(content string) bool {
	for _, pattern := range secretPatterns {
		if pattern.MatchString(content) {
			return true
		}
	}
	return false
}
