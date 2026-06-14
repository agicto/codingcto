package deepwiki

import (
	"crypto/sha256"
	"fmt"
	"regexp"
	"strings"

	"github.com/zgiai/luas/api/internal/domain"
)

const fallbackChunkLines = 160

var markdownHeadingPattern = regexp.MustCompile(`^\s{0,3}#{1,6}\s+(.+?)\s*$`)

type chunker struct{}

type symbolMarker struct {
	line int
	name string
}

func newChunker() chunker {
	return chunker{}
}

func (c chunker) Chunk(indexID uint, snapshot *RepositorySnapshot) []*domain.DeepWikiChunk {
	if snapshot == nil {
		return nil
	}
	chunks := []*domain.DeepWikiChunk{}
	for _, file := range snapshot.Files {
		chunks = append(chunks, c.chunkFile(indexID, file)...)
	}
	return chunks
}

func (c chunker) chunkFile(indexID uint, file RepositoryFile) []*domain.DeepWikiChunk {
	lines := splitLines(file.Content)
	if len(lines) == 0 {
		return nil
	}
	if file.Language == "markdown" {
		return c.chunkMarkdown(indexID, file, lines)
	}
	markers := symbolMarkers(file.Language, lines)
	if len(markers) == 0 {
		return c.chunkWindows(indexID, file, lines, "")
	}
	chunks := []*domain.DeepWikiChunk{}
	for i, marker := range markers {
		start := marker.line
		end := len(lines)
		if i+1 < len(markers) {
			end = markers[i+1].line - 1
		}
		chunks = append(chunks, c.chunkRange(indexID, file, lines, start, end, marker.name)...)
	}
	return chunks
}

func (c chunker) chunkMarkdown(indexID uint, file RepositoryFile, lines []string) []*domain.DeepWikiChunk {
	markers := []symbolMarker{}
	for i, line := range lines {
		if match := markdownHeadingPattern.FindStringSubmatch(line); len(match) == 2 {
			markers = append(markers, symbolMarker{line: i + 1, name: strings.TrimSpace(match[1])})
		}
	}
	if len(markers) == 0 {
		return c.chunkWindows(indexID, file, lines, "")
	}
	chunks := []*domain.DeepWikiChunk{}
	for i, marker := range markers {
		start := marker.line
		end := len(lines)
		if i+1 < len(markers) {
			end = markers[i+1].line - 1
		}
		chunks = append(chunks, c.chunkRange(indexID, file, lines, start, end, marker.name)...)
	}
	return chunks
}

func (c chunker) chunkWindows(indexID uint, file RepositoryFile, lines []string, symbolName string) []*domain.DeepWikiChunk {
	return c.chunkRange(indexID, file, lines, 1, len(lines), symbolName)
}

func (c chunker) chunkRange(indexID uint, file RepositoryFile, lines []string, start, end int, symbolName string) []*domain.DeepWikiChunk {
	if start < 1 {
		start = 1
	}
	if end > len(lines) {
		end = len(lines)
	}
	if start > end {
		return nil
	}
	chunks := []*domain.DeepWikiChunk{}
	for windowStart := start; windowStart <= end; windowStart += fallbackChunkLines {
		windowEnd := windowStart + fallbackChunkLines - 1
		if windowEnd > end {
			windowEnd = end
		}
		content := strings.Join(lines[windowStart-1:windowEnd], "\n")
		hash := sha256.Sum256([]byte(content))
		chunks = append(chunks, &domain.DeepWikiChunk{
			IndexID:     indexID,
			FilePath:    file.Path,
			Language:    file.Language,
			SymbolName:  symbolName,
			StartLine:   windowStart,
			EndLine:     windowEnd,
			Content:     content,
			ContentHash: fmt.Sprintf("%x", hash[:]),
			KeywordText: strings.ToLower(file.Path + " " + file.Language + " " + symbolName + " " + content),
		})
	}
	return chunks
}

func splitLines(content string) []string {
	normalized := strings.ReplaceAll(content, "\r\n", "\n")
	normalized = strings.ReplaceAll(normalized, "\r", "\n")
	if normalized == "" {
		return []string{}
	}
	return strings.Split(normalized, "\n")
}

func symbolMarkers(language string, lines []string) []symbolMarker {
	switch language {
	case "go":
		return regexSymbolMarkers(lines, []*regexp.Regexp{
			regexp.MustCompile(`^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*\(`),
			regexp.MustCompile(`^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+(struct|interface)`),
		})
	case "typescript", "javascript":
		return regexSymbolMarkers(lines, []*regexp.Regexp{
			regexp.MustCompile(`^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(`),
			regexp.MustCompile(`^\s*export\s+(?:class|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)`),
			regexp.MustCompile(`^\s*(?:export\s+)?const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=`),
		})
	case "python":
		return regexSymbolMarkers(lines, []*regexp.Regexp{
			regexp.MustCompile(`^\s*(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)`),
		})
	case "java":
		return regexSymbolMarkers(lines, []*regexp.Regexp{
			regexp.MustCompile(`^\s*(?:public|private|protected)?\s*(?:class|interface|enum)\s+([A-Za-z_][A-Za-z0-9_]*)`),
		})
	default:
		return nil
	}
}

func regexSymbolMarkers(lines []string, patterns []*regexp.Regexp) []symbolMarker {
	markers := []symbolMarker{}
	for i, line := range lines {
		for _, pattern := range patterns {
			match := pattern.FindStringSubmatch(line)
			if len(match) > 1 {
				markers = append(markers, symbolMarker{line: i + 1, name: match[1]})
				break
			}
		}
	}
	return markers
}
