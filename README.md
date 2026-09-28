# Small Space Setup — ad/affiliate content site

Static site for the small-space / apartment-friendly home office & WFH gear niche (TEM-18/TEM-20).

## Build & run locally

```
node build.mjs      # builds src/ -> docs/
./serve.sh           # build + serve docs/ at http://localhost:4000
```

No dependencies required (uses only Node's standard library and Python's `http.server`).

## Structure

- `src/articles/*.md` — 15 articles (Markdown + front matter): 5 launch articles from TEM-20, plus batch 2 (articles 6–15, TEM-56).
- `src/pages/*.md` — about, contact, privacy, disclosure pages.
- `config.json` — site metadata, ad slot config (`ads.enabled`), affiliate program config (`affiliate.amazon`, `affiliate.shareasale`), and `searchConsole.verificationTag`.
- `build.mjs` — zero-dependency static site generator. Resolves `{{AFF:program:product}}` placeholders from `config.json` into real-shaped links once a program's `enabled` flag is `true` and its ID is filled in. Until then, links resolve to a plain untagged Amazon search URL (or are omitted, for ShareASale) so nothing points to a broken or fake destination. Also enforces the TEM-20 `cadence` doc's 2/week publishing schedule: any article whose front-matter `date` is later than the build's current date is skipped (not written to `docs/`), so the full batch-2 backlog can live in `src/articles/` and appear on schedule as each date arrives, instead of all landing at once. Set `PUBLISH_FUTURE=1` to bypass the gate and build everything (useful for local preview/QA). The `.github/workflows/pages.yml` workflow rebuilds and redeploys daily so future-dated articles publish automatically on schedule.
- `docs/` — build output (tracked in git, not actually gitignored despite an earlier note here — `.gitignore` is empty). Regenerate with `node build.mjs`.

## Ad & affiliate wiring ($0 spend)

- `config.ads.enabled: false` — the ad slot renders as an HTML comment, not a live ad unit, until a real AdSense (or other network) publisher ID is entered.
- `config.affiliate.amazon.enabled` / `config.affiliate.shareasale.enabled`: `false` — until the board completes the signups listed in the TEM-16 human-signup table and provides real IDs. Until then, article links go to plain untagged Amazon search results (no affiliate tag) instead of a dead anchor.
- No fake publisher or affiliate IDs are used anywhere in this repo.

## Hosting

Deployed to GitHub Pages via `.github/workflows/pages.yml` (build on push to `main`, plus a daily scheduled rebuild). Public URL: https://mura2556.github.io/small-space-home-office/

A public URL was required before Amazon Associates / ShareASale applications could be submitted (both ask for a live site URL on their signup forms) — see the TEM-16 signup table.

## Distribution

`sitemap.xml` and `rss.xml` are generated from `config.site.baseUrl`. An IndexNow key file (`docs/<key>.txt`, key set in `config.indexNow.key`) is published for Bing/Yandex IndexNow pings after each deploy.
