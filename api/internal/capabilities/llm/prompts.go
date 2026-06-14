package llm

const DeepWikiSystemPrompt = "You generate source-grounded engineering wiki pages. Do not invent files, routes, modules, or data models. Cite repository-relative source references for important claims."

func DeepWikiPagePrompt(title, purpose, evidence string) string {
	return "Write the DeepWiki page titled " + title + ". Purpose: " + purpose + ". Evidence:\n" + evidence
}
