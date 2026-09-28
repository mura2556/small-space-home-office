import { marked } from "marked";
import matter from "gray-matter";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const OUT = path.join(__dirname, "docs");

function resolveAffiliateLinks(html) {
  return html.replace(/\{\{AFF:([a-z0-9_-]+):([a-z0-9_-]+)\}\}/gi, (match, program, product) => {
    const prog = config.affiliates[program.toLowerCase()];
    if (!prog) return match;
    const url = `${prog.baseUrl}${prog.baseUrl.includes("?") ? "&" : "?"}${prog.tagParam || prog.affiliateIdParam}=${prog.tag || prog.affiliateId}&ref=${encodeURIComponent(product)}`;
    return `<a href="${url}" rel="sponsored noopener" target="_blank">${prog.program} →</a>`;
  });
}

function readMarkdownDir(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, content } = matter(raw);
      const slug = f.replace(/\.md$/, "");
      return { slug, data, content };
    });
}

function searchConsoleMeta() {
  const tag = config.searchConsole && config.searchConsole.verificationTag;
  if (!tag) return "";
  return `<meta name="google-site-verification" content="${tag}">`;
}

function layout({ title, description, url, bodyHtml, extraHead = "" }) {
  const ogImage = `${config.site.url}/og-default.svg`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | ${config.site.name}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta name="twitter:card" content="summary_large_image">
${searchConsoleMeta()}
<link rel="stylesheet" href="/styles.css">
<link rel="alternate" type="application/rss+xml" title="${config.site.name}" href="/rss.xml">
${extraHead}
</head>
<body>
<header class="site-header">
  <nav class="nav">
    <a class="logo" href="/">${config.site.name}</a>
    <div class="nav-links">
      <a href="/">Articles</a>
      <a href="/about/">About</a>
      <a href="/contact/">Contact</a>
      <a href="/disclosure/">Disclosure</a>
    </div>
  </nav>
</header>
<main class="container">
${bodyHtml}
</main>
<footer class="site-footer">
  ${footerAadsHtml()}
  ${footerBraveHtml()}
  <p>&copy; ${new Date().getFullYear()} ${config.site.name}. <a href="/disclosure/">Affiliate disclosure</a> &middot; <a href="/privacy/">Privacy policy</a></p>
</footer>
</body>
</html>`;
}

function adSlotHtml() {
  if (!config.ads.enabled) {
    return `<!-- Ad slot disabled: set ads.enabled=true in config.json once a real ${config.ads.network} publisher ID is approved. -->`;
  }
  return `<div class="ad-slot" data-network="${config.ads.network}" data-publisher="${config.ads.publisherId}" data-slot="${config.ads.slotId}"></div>`;
}

function footerAadsHtml() {
  if (!config.aads.enabled) {
    return `<!-- A-ADS footer unit disabled: set aads.enabled=true in config.json once a real A-ADS ad-unit ID is approved (see TEM-73). -->`;
  }
  return `<div class="footer-ad-slot">
    <p class="footer-ad-label">Advertisement</p>
    <iframe data-aa="${config.aads.adUnitId}" src="//ad.a-ads.com/${config.aads.adUnitId}?size=468x60" style="width:468px; height:60px; border:0; padding:0; overflow:hidden; background:transparent;" loading="lazy"></iframe>
    <noscript><a href="//ad.a-ads.com/${config.aads.adUnitId}?size=468x60" rel="sponsored nofollow">View sponsors</a></noscript>
  </div>`;
}

function footerBraveHtml() {
  if (!config.brave.tipNoteEnabled) {
    return `<!-- Brave tip note disabled: set brave.tipNoteEnabled=true in config.json once Brave Creator verification is complete (see TEM-73). -->`;
  }
  return `<p class="footer-brave-note">This site is a registered <a href="https://creators.brave.com/" rel="nofollow noopener" target="_blank">Brave Creator</a> — tip us with the Brave Browser if this content helped you.</p>`;
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Articles
const articles = readMarkdownDir(path.join(__dirname, "src/articles"))
  .sort((a, b) => new Date(b.data.date) - new Date(a.data.date));

for (const article of articles) {
  const rawHtml = marked.parse(article.content);
  const bodyHtml = resolveAffiliateLinks(rawHtml);
  const url = `${config.site.url}/articles/${article.slug}/`;
  const html = layout({
    title: article.data.title,
    description: article.data.description,
    url,
    bodyHtml: `<article class="article">
      <h1>${article.data.title}</h1>
      <p class="article-date">${article.data.date}</p>
      ${adSlotHtml()}
      ${bodyHtml}
      ${adSlotHtml()}
    </article>`,
  });
  const dir = path.join(OUT, "articles", article.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

// Static pages
const pages = readMarkdownDir(path.join(__dirname, "src/pages"));
for (const page of pages) {
  const bodyHtml = marked.parse(page.content);
  const slug = page.slug;
  const url = `${config.site.url}/${slug}/`;
  const html = layout({
    title: page.data.title,
    description: page.data.description,
    url,
    bodyHtml: `<article class="page"><h1>${page.data.title}</h1>${bodyHtml}</article>`,
  });
  const dir = path.join(OUT, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html);
}

// Home page
const listHtml = articles.map((a) => `
  <a class="article-card" href="/articles/${a.slug}/">
    <h2>${a.data.title}</h2>
    <p>${a.data.description}</p>
    <span class="article-tags">${(a.data.tags || []).join(" · ")}</span>
  </a>`).join("\n");

const homeHtml = layout({
  title: "Small-Space Home Office Buying Guides",
  description: config.site.description,
  url: `${config.site.url}/`,
  bodyHtml: `
    <section class="hero">
      <h1>Home office gear that actually fits a small space.</h1>
      <p>${config.site.description}</p>
    </section>
    ${adSlotHtml()}
    <section class="article-list">
      ${listHtml}
    </section>
  `,
});
fs.writeFileSync(path.join(OUT, "index.html"), homeHtml);

// styles.css
fs.copyFileSync(path.join(__dirname, "src/styles.css"), path.join(OUT, "styles.css"));

// og-default.svg placeholder image
fs.copyFileSync(path.join(__dirname, "src/og-default.svg"), path.join(OUT, "og-default.svg"));

// sitemap.xml
const urls = [
  `${config.site.url}/`,
  ...pages.map((p) => `${config.site.url}/${p.slug}/`),
  ...articles.map((a) => `${config.site.url}/articles/${a.slug}/`),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n")}
</urlset>`;
fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap);

// rss.xml
const rssItems = articles.map((a) => `
  <item>
    <title>${a.data.title}</title>
    <link>${config.site.url}/articles/${a.slug}/</link>
    <guid>${config.site.url}/articles/${a.slug}/</guid>
    <description>${a.data.description}</description>
    <pubDate>${new Date(a.data.date).toUTCString()}</pubDate>
  </item>`).join("\n");
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${config.site.name}</title>
  <link>${config.site.url}/</link>
  <description>${config.site.description}</description>
  ${rssItems}
</channel>
</rss>`;
fs.writeFileSync(path.join(OUT, "rss.xml"), rss);

// robots.txt
fs.writeFileSync(path.join(OUT, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${config.site.url}/sitemap.xml\n`);

// ads.txt (placeholder — real entry requires a real AdSense publisher ID)
const adsTxt = config.ads.enabled
  ? `google.com, ${config.ads.publisherId}, DIRECT, f08c47fec0942fa0\n`
  : `# ads.txt placeholder — no ad network is enabled yet.\n# Once a real ${config.ads.network} publisher ID is approved, set ads.enabled=true\n# in config.json and re-run "npm run build" to populate this file correctly.\n`;
fs.writeFileSync(path.join(OUT, "ads.txt"), adsTxt);

// CNAME placeholder note (not written unless a custom domain is confirmed)

console.log(`Built ${articles.length} articles and ${pages.length} pages into docs/`);
