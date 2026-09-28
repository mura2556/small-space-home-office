#!/usr/bin/env node
// Zero-dependency static site generator: reads src/articles + src/pages (Markdown + front matter),
// resolves {{AFF:program:product}} placeholders from config.json, writes docs/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const OUT = path.join(ROOT, "docs");
const config = JSON.parse(fs.readFileSync(path.join(ROOT, "config.json"), "utf8"));

function parseFrontMatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { data: {}, content: raw };
  const [, fmRaw, content] = m;
  const data = {};
  for (const line of fmRaw.split("\n")) {
    const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (!mm) continue;
    let [, key, val] = mm;
    val = val.trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      data[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
        .filter(Boolean);
    } else {
      data[key] = val.replace(/^"(.*)"$/, "$1");
    }
  }
  return { data, content: content.trim() };
}

function resolveAffiliatePlaceholders(md) {
  return md.replace(/\{\{AFF:([a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)\}\}/g, (full, program, product) => {
    const prog = config.affiliate[program];
    if (!prog) return "#affiliate-program-not-configured";
    if (prog.enabled) {
      if (program === "amazon") return prog.baseUrl.replace("{tag}", prog.tag).replace("PRODUCT_ASIN", product);
      if (program === "shareasale") return prog.baseUrl.replace("{affiliateId}", prog.affiliateId).replace("PRODUCT_PATH", product);
      return "#affiliate-program-not-configured";
    }
    // No approved affiliate account yet: point to a plain, untagged, working
    // destination instead of a dead anchor. Swap back to prog.baseUrl once a
    // real program ID exists (see README "Ad & affiliate wiring").
    if (program === "amazon") {
      return `https://www.amazon.com/s?k=${encodeURIComponent(product.replace(/-/g, " "))}`;
    }
    return "";
  });
}

// Minimal Markdown -> HTML (headings, bold/italic, links, lists, paragraphs, checkboxes, code fences, hr)
function mdToHtml(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let inCode = false;
  let paragraph = [];

  function flushParagraph() {
    if (paragraph.length) {
      html += `<p>${inline(paragraph.join(" "))}</p>\n`;
      paragraph = [];
    }
  }
  function inline(text) {
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");
    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
      if (href.startsWith("/")) {
        let filePath = href;
        if (filePath.endsWith("/")) filePath += "index.html";
        else if (!path.extname(filePath)) filePath += "/index.html";
        href = `${config.site.baseUrl}${filePath}`;
      }
      return `<a href="${href}">${label}</a>`;
    });
    return text;
  }

  for (const rawLine of lines) {
    const line = rawLine;
    if (line.trim().startsWith("```")) {
      flushParagraph();
      if (!inCode) {
        html += "<pre><code>";
        inCode = true;
      } else {
        html += "</code></pre>\n";
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      html += line.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n";
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      html += "<hr>\n";
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushParagraph();
      const level = h[1].length;
      html += `<h${level}>${inline(h[2])}</h${level}>\n`;
      continue;
    }
    const checkbox = line.match(/^-\s+\[( |x)\]\s+(.*)$/);
    const bullet = line.match(/^-\s+(.*)$/);
    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (checkbox || bullet || numbered) {
      flushParagraph();
      if (!inList) {
        html += "<ul>\n";
        inList = true;
      }
      if (checkbox) {
        const checked = checkbox[1] === "x" ? " checked" : "";
        html += `<li><input type="checkbox" disabled${checked}> ${inline(checkbox[2])}</li>\n`;
      } else {
        html += `<li>${inline((bullet || numbered)[1])}</li>\n`;
      }
      continue;
    }
    if (inList && line.trim() === "") {
      html += "</ul>\n";
      inList = false;
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line.trim());
  }
  if (inList) html += "</ul>\n";
  flushParagraph();
  return html;
}

function footerAadsHtml() {
  if (!config.aads || !config.aads.enabled) {
    return `<!-- A-ADS footer unit disabled: set aads.enabled=true in config.json once a real A-ADS ad-unit ID is approved (see TEM-73). -->`;
  }
  return `<div class="footer-ad-slot">
    <p class="footer-ad-label">Advertisement</p>
    <iframe data-aa="${config.aads.adUnitId}" src="//ad.a-ads.com/${config.aads.adUnitId}?size=468x60" style="width:468px; height:60px; border:0; padding:0; overflow:hidden; background:transparent;" loading="lazy"></iframe>
    <noscript><a href="//ad.a-ads.com/${config.aads.adUnitId}?size=468x60" rel="sponsored nofollow">View sponsors</a></noscript>
  </div>`;
}

function footerBraveHtml() {
  if (!config.brave || !config.brave.tipNoteEnabled) {
    return `<!-- Brave tip note disabled: set brave.tipNoteEnabled=true in config.json once Brave Creator verification is complete (see TEM-73). -->`;
  }
  return `<p class="footer-brave-note">This site is a registered <a href="https://creators.brave.com/" rel="nofollow noopener" target="_blank">Brave Creator</a> — tip us with the Brave Browser if this content helped you.</p>`;
}

function layout({ title, description, bodyHtml, canonicalPath }) {
  const searchConsoleTag = config.searchConsole?.verificationTag
    ? `<meta name="google-site-verification" content="${config.searchConsole.verificationTag}">\n  `
    : "";
  const adSlot = config.ads.enabled
    ? `<div class="ad-slot" data-ad-client="${config.ads.publisherId}" data-ad-slot="${config.ads.slotId}"></div>`
    : `<!-- ad slot disabled: config.ads.enabled=false, no publisher ID configured -->`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | ${config.site.name}</title>
  <meta name="description" content="${description}">
  ${searchConsoleTag}<link rel="canonical" href="${config.site.baseUrl}${canonicalPath}">
  <link rel="alternate" type="application/rss+xml" title="${config.site.name}" href="${config.site.baseUrl}/rss.xml">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${config.site.baseUrl}${canonicalPath}">
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:1.5rem;line-height:1.6;color:#1a1a1a}
    nav a{margin-right:1rem}
    header{border-bottom:1px solid #ddd;margin-bottom:2rem;padding-bottom:1rem}
    footer{border-top:1px solid #ddd;margin-top:3rem;padding-top:1rem;font-size:.9rem;color:#555}
    .ad-slot{background:#f0f0f0;border:1px dashed #ccc;padding:2rem;text-align:center;color:#888;margin:2rem 0}
    a{color:#0b5fff}
    ul{padding-left:1.3rem}
    .footer-ad-slot{margin:0 0 1rem;display:flex;flex-direction:column;align-items:center;gap:.25rem}
    .footer-ad-slot .footer-ad-label{margin:0;font-size:.68rem;text-transform:uppercase;letter-spacing:.06em;color:#888}
    .footer-ad-slot iframe{max-width:100%}
    .footer-brave-note{margin:0 0 .75rem;font-size:.85rem}
  </style>
</head>
<body>
  <header>
    <a href="${config.site.baseUrl}/index.html"><strong>${config.site.name}</strong></a>
    <nav>
      <a href="${config.site.baseUrl}/index.html">Home</a>
      <a href="${config.site.baseUrl}/about/index.html">About</a>
      <a href="${config.site.baseUrl}/contact/index.html">Contact</a>
      <a href="${config.site.baseUrl}/disclosure/index.html">Disclosure</a>
      <a href="${config.site.baseUrl}/privacy/index.html">Privacy</a>
    </nav>
  </header>
  ${adSlot}
  <main>
    ${bodyHtml}
  </main>
  ${adSlot}
  <footer>
    ${footerAadsHtml()}
    ${footerBraveHtml()}
    <p>&copy; ${new Date().getFullYear()} ${config.site.name}. Affiliate links may be present — see our <a href="${config.site.baseUrl}/disclosure/index.html">disclosure</a>.</p>
  </footer>
</body>
</html>
`;
}

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, "articles"), { recursive: true });

  const articleFiles = fs.readdirSync(path.join(SRC, "articles")).filter((f) => f.endsWith(".md"));
  const articles = [];
  // Cadence gate: skip articles whose front-matter date is in the future so a full
  // src/articles/ backlog can be committed at once and published on schedule by date
  // (2/week per the TEM-20 cadence doc) instead of all appearing the moment they land.
  // Override with PUBLISH_FUTURE=1 to build everything regardless of date.
  const today = new Date().toISOString().slice(0, 10);
  const publishFuture = process.env.PUBLISH_FUTURE === "1";
  let skipped = 0;

  for (const file of articleFiles) {
    const raw = fs.readFileSync(path.join(SRC, "articles", file), "utf8");
    const { data, content } = parseFrontMatter(raw);
    if (!publishFuture && data.date && String(data.date) > today) {
      skipped++;
      continue;
    }
    const resolved = resolveAffiliatePlaceholders(content);
    const slug = file.replace(/\.md$/, "");
    const bodyHtml = `<article><h1>${data.title}</h1><p><em>${data.date}</em></p>${mdToHtml(resolved)}</article>`;
    const html = layout({
      title: data.title,
      description: data.description || "",
      bodyHtml,
      canonicalPath: `/articles/${slug}/index.html`,
    });
    fs.mkdirSync(path.join(OUT, "articles", slug), { recursive: true });
    fs.writeFileSync(path.join(OUT, "articles", slug, "index.html"), html);
    articles.push({ ...data, slug });
  }
  articles.sort((a, b) => (a.date < b.date ? 1 : -1));

  // pages
  const pageFiles = fs.readdirSync(path.join(SRC, "pages")).filter((f) => f.endsWith(".md"));
  for (const file of pageFiles) {
    const raw = fs.readFileSync(path.join(SRC, "pages", file), "utf8");
    const { data, content } = parseFrontMatter(raw);
    const slug = file.replace(/\.md$/, "");
    const bodyHtml = `<h1>${data.title}</h1>${mdToHtml(content)}`;
    const html = layout({ title: data.title, description: data.description || "", bodyHtml, canonicalPath: `/${slug}/index.html` });
    fs.mkdirSync(path.join(OUT, slug), { recursive: true });
    fs.writeFileSync(path.join(OUT, slug, "index.html"), html);
  }

  // index
  const listHtml = articles
    .map(
      (a) =>
        `<li><a href="${config.site.baseUrl}/articles/${a.slug}/index.html">${a.title}</a><br><small>${a.description || ""}</small></li>`
    )
    .join("\n");
  const indexHtml = layout({
    title: "Home",
    description: config.site.description,
    bodyHtml: `<h1>${config.site.name}</h1><p>${config.site.tagline}</p><ul>${listHtml}</ul>`,
    canonicalPath: "/index.html",
  });
  fs.writeFileSync(path.join(OUT, "index.html"), indexHtml);

  // sitemap.xml
  const urls = [
    "/index.html",
    "/about/index.html",
    "/contact/index.html",
    "/privacy/index.html",
    "/disclosure/index.html",
    ...articles.map((a) => `/articles/${a.slug}/index.html`),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${config.site.baseUrl}${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  fs.writeFileSync(path.join(OUT, "sitemap.xml"), sitemap);

  // rss.xml
  const rssItems = articles
    .map(
      (a) => `  <item>
    <title>${a.title}</title>
    <link>${config.site.baseUrl}/articles/${a.slug}/index.html</link>
    <guid>${config.site.baseUrl}/articles/${a.slug}/index.html</guid>
    <description>${a.description || ""}</description>
    <pubDate>${new Date(a.date).toUTCString()}</pubDate>
  </item>`
    )
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n  <title>${config.site.name}</title>\n  <link>${config.site.baseUrl}</link>\n  <description>${config.site.description}</description>\n${rssItems}\n</channel></rss>\n`;
  fs.writeFileSync(path.join(OUT, "rss.xml"), rss);

  // robots.txt
  fs.writeFileSync(
    path.join(OUT, "robots.txt"),
    `User-agent: *\nAllow: /\nSitemap: ${config.site.baseUrl}/sitemap.xml\n`
  );

  // ads.txt (empty/placeholder until a real publisher ID exists)
  fs.writeFileSync(
    path.join(OUT, "ads.txt"),
    config.ads.enabled
      ? `google.com, ${config.ads.publisherId}, DIRECT, f08c47fec0942fa0\n`
      : `# ads.txt intentionally empty: no ad network approved yet (config.ads.enabled=false)\n`
  );

  // IndexNow key file: proves domain ownership for Bing/Yandex IndexNow pings.
  // Key is a fixed value in config.json so the same file stays valid across rebuilds.
  const indexNowKey = config.indexNow?.key;
  if (indexNowKey) {
    fs.writeFileSync(path.join(OUT, `${indexNowKey}.txt`), `${indexNowKey}\n`);
  }

  // sanity check: no unresolved affiliate placeholders leaked into output
  const allHtml = fs.readdirSync(OUT, { recursive: true }).filter((f) => f.toString().endsWith(".html"));
  let leaked = 0;
  for (const f of allHtml) {
    const content = fs.readFileSync(path.join(OUT, f.toString()), "utf8");
    if (content.includes("{{AFF:")) {
      leaked++;
      console.error(`UNRESOLVED PLACEHOLDER in ${f}`);
    }
  }
  console.log(
    `Built ${articles.length} articles, ${pageFiles.length} pages. Unresolved placeholders: ${leaked}.` +
      (skipped ? ` Skipped ${skipped} future-dated article(s) (PUBLISH_FUTURE=1 to include).` : "")
  );
}

build();
