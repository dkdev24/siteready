/**
 * GitHub Pages' classic (Actions-free) build serves purely static files —
 * no server-side request-header branching, unlike Cloudflare Pages
 * Functions or Vercel middleware. There is nothing this layer can write;
 * it exists only to name the one check a static host structurally can't
 * pass, so `enhance`'s output doesn't silently look complete.
 */
export async function applyGithubPagesFixes(_siteRoot) {
  return {
    written: [],
    skipped: [],
    warnings: [
      "GitHub Pages serves static files only, with no server-side Accept-header branching — the " +
        "markdown-negotiation-vary check can't be fixed on this platform. Move to a platform with " +
        "edge functions (Cloudflare Pages, Vercel) if that check matters, or accept the gap.",
    ],
  };
}
