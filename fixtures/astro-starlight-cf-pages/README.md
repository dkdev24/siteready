# siteready reference fixture: Astro + Starlight + Cloudflare Pages

A from-scratch (`npm create astro@latest -- --template starlight`), otherwise-untouched Starlight
site, kept as the reference fixture for `../../src/enhance.js`'s Astro+Starlight+Cloudflare-Pages
fixer. It already has the fixer applied — this is the "after" state, checked in so the fixer's
expected output has a diffable reference and doesn't need re-deriving from scratch each time it's
touched.

## Reproducing the before/after numbers

```sh
cd tools/siteready/fixtures/astro-starlight-cf-pages
npm install && npm run build
npx --yes wrangler pages dev dist --port 8788   # local Cloudflare Pages emulation
# in another shell, from tools/siteready:
node src/cli.js http://localhost:8788 --scanners afdocs --sampling deterministic
```

- **Before** the fixer (no `llms.txt.ts`, no `[...slug].md.ts`, no `Banner.astro` override, no
  `functions/_middleware.js`, no `components: { Banner }` in `astro.config.mjs`): **0/100 (F)** —
  the typical baseline for a doc site with no llms.txt, no markdown mirrors, and no content
  negotiation at all.
- **After** (current checked-in state): **97/100 (A)** — the remaining 3 points are content-side
  (`content-start-position`), not infrastructure, same as the real case study's own residual gap.
- `is-agentic` can't score this fixture locally — its CLI submits the URL to a hosted scan service
  that can't reach `localhost`. It works the same as any other scanner once this fixture (or a real
  site using this pattern) is actually deployed to Cloudflare Pages.

Needed **5+ pages** to get an uncapped score — afdocs caps `overall` at 59 with a
`single-page-sample` diagnostic when fewer than 5 pages are discovered, regardless of how well the
site otherwise does. That's why this fixture has 5 docs pages instead of the starter's default 3.

---

# Starlight Starter Kit: Basics

[![Built with Starlight](https://astro.badg.es/v2/built-with-starlight/tiny.svg)](https://starlight.astro.build)

```
npm create astro@latest -- --template starlight
```

> 🧑‍🚀 **Seasoned astronaut?** Delete this file. Have fun!

## 🚀 Project Structure

Inside of your Astro + Starlight project, you'll see the following folders and files:

```
.
├── public/
├── src/
│   ├── assets/
│   ├── content/
│   │   └── docs/
│   └── content.config.ts
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name.

Images can be added to `src/assets/` and embedded in Markdown with a relative link.

Static assets, like favicons, can be placed in the `public/` directory.

## 🧞 Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`             | Installs dependencies                            |
| `npm run dev`             | Starts local dev server at `localhost:4321`      |
| `npm run build`           | Build your production site to `./dist/`          |
| `npm run preview`         | Preview your build locally, before deploying     |
| `npm run astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `npm run astro -- --help` | Get help using the Astro CLI                     |

## 👀 Want to learn more?

Check out [Starlight’s docs](https://starlight.astro.build/), read [the Astro documentation](https://docs.astro.build), or jump into the [Astro Discord server](https://astro.build/chat).
