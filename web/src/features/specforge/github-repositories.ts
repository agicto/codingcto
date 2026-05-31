export function parseGitHubRepositoryURL(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const shorthand = normalized.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }

  try {
    const url = new URL(normalized);
    if (!url.hostname.endsWith('github.com')) {
      return null;
    }
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    return null;
  }
}
