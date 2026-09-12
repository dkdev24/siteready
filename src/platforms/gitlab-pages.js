/**
 * GitLab Pages serves purely static files — no server-side request-header
 * branching, unlike Cloudflare Pages Functions or Vercel/Netlify Edge
 * Functions. There is nothing this layer can write; it exists only to name
 * the one check a static host structurally can't pass, so `enhance`'s
 * output doesn't silently look complete. See `github-pages.js`, the same
 * static-host case.
 */
export async function applyGitlabPagesFixes(_siteRoot) {
  return {
    written: [],
    skipped: [],
    warnings: [
      "GitLab Pages serves static files only, with no server-side Accept-header branching — the " +
        "markdown-negotiation-vary check can't be fixed on this platform. Move to a platform with " +
        "edge functions (Cloudflare Pages, Vercel, Netlify) if that check matters, or accept the gap.",
    ],
  };
}
