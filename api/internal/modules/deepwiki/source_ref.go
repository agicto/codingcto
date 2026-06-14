package deepwiki

import (
	"fmt"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

func evidenceMatchesChunk(evidence string, chunk *domain.DeepWikiChunk) bool {
	if chunk == nil {
		return false
	}
	evidence = strings.TrimSpace(evidence)
	if evidence == "" {
		return false
	}
	if evidence == chunk.FilePath {
		return true
	}
	if strings.HasSuffix(evidence, "/") {
		return strings.HasPrefix(chunk.FilePath, evidence)
	}
	return strings.Contains(chunk.FilePath, evidence)
}

func sourceRefLabel(ref domain.DeepWikiSourceRef) string {
	return fmt.Sprintf("[%s:%d-%d]", ref.Path, ref.StartLine, ref.EndLine)
}

func fallback(value, fallbackText string) string {
	if strings.TrimSpace(value) == "" {
		return fallbackText
	}
	return value
}
