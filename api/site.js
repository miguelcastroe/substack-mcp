const BRAND = "Substack Intelligence";
const BASE = "https://substack-intelligence.vercel.app";
const GITHUB_ISSUES = "https://github.com/miguelcastroe/substack-mcp/issues";

const css = `
  :root { color-scheme: light; --ink:#171717; --muted:#656565; --line:#e7e7e7; --paper:#faf9f6; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--paper); color:var(--ink); }
  main { width:min(760px,calc(100% - 40px)); margin:0 auto; padding:72px 0 88px; }
  nav { display:flex; gap:18px; flex-wrap:wrap; padding-bottom:52px; font-size:14px; }
  nav a, a { color:inherit; text-underline-offset:3px; }
  nav a { text-decoration:none; color:var(--muted); }
  nav a:hover { color:var(--ink); }
  .eyebrow { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); margin:0 0 18px; }
  h1 { font-size:clamp(40px,7vw,68px); line-height:.98; letter-spacing:-.045em; margin:0 0 28px; font-weight:650; }
  h2 { font-size:24px; letter-spacing:-.02em; margin:44px 0 12px; }
  p, li { font-size:17px; line-height:1.62; }
  p { margin:0 0 18px; }
  ul { padding-left:22px; }
  .lede { font-size:22px; line-height:1.48; max-width:680px; color:#303030; }
  .card { margin-top:42px; padding:26px; border:1px solid var(--line); border-radius:18px; background:#fff; }
  .meta { color:var(--muted); font-size:14px; margin-top:52px; padding-top:20px; border-top:1px solid var(--line); }
  code { font-size:.92em; background:#efeee9; padding:.12em .35em; border-radius:5px; }
`;

function layout({title, description, body}) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title} — ${BRAND}</title>
  <meta name="description" content="${description}" />
  <style>${css}</style>
</head>
<body>
  <main>
    <nav aria-label="Primary">
      <a href="/">Substack Intelligence</a>
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
      <a href="/support">Support</a>
    </nav>
    ${body}
  </main>
</body>
</html>`;
}

const pages = {
  home: () => layout({
    title: "Editorial intelligence for public Substack archives",
    description: "Read a public Substack archive as a connected body of ideas — themes, repetition, relationships and underexplored territory.",
    body: `
      <p class="eyebrow">Read-only editorial intelligence</p>
      <h1>See the archive as a body of thought.</h1>
      <p class="lede">Substack Intelligence helps ChatGPT read a public Substack publication as an editorial corpus: what keeps returning, which ideas connect, and where there may still be room to explore.</p>
      <div class="card">
        <h2 style="margin-top:0">What it does</h2>
        <p>Give ChatGPT a public Substack publication URL. The plugin can retrieve the publication’s public archive and the public body or preview Substack exposes for each post. ChatGPT then performs the editorial interpretation in the conversation.</p>
        <p>It does not publish, edit posts, export subscribers, or use the publication owner’s private Substack session.</p>
      </div>
      <h2>Designed around the archive</h2>
      <p>The first public version is deliberately narrow. It focuses on long-form published posts so a writer, editor, researcher, or curious reader can compare themes and arguments across an archive without copying articles into ChatGPT one by one.</p>
      <p class="meta">Independent project by Miguel Castro. Not affiliated with Substack or OpenAI.</p>
    `,
  }),

  privacy: () => layout({
    title: "Privacy Policy",
    description: "Privacy policy for the public Substack Intelligence plugin.",
    body: `
      <p class="eyebrow">Privacy</p>
      <h1>Privacy Policy</h1>
      <p class="lede">The public version of Substack Intelligence is designed to read public Substack content without connecting to a user’s private Substack account.</p>

      <h2>Information the server receives</h2>
      <p>When the plugin is used, the server receives the tool arguments needed to perform the request, including the public publication URL and options such as how many posts to retrieve. It may also receive standard network metadata that accompanies an HTTPS request.</p>

      <h2>What the server retrieves</h2>
      <p>The server requests public archive and post data from the publication URL supplied by the user. It does not use a Substack login, session cookie, subscriber export, private reader feed, draft access, or publication analytics in the public plugin.</p>

      <h2>Storage and logs</h2>
      <p>The application code does not intentionally persist retrieved article bodies or tool results. Operational logs record limited technical metadata needed to diagnose service health, such as the requested host, timing, counts, and errors; they are designed not to contain article bodies, authentication secrets, or private Substack account data.</p>
      <p>The hosting provider may process standard request and infrastructure metadata as part of operating the service.</p>

      <h2>Third-party services</h2>
      <p>To fulfill a request, the service communicates with the public Substack publication selected by the user. The plugin is hosted on Vercel and is used through OpenAI products when connected there. Those services process data under their own policies and terms.</p>

      <h2>Scope</h2>
      <p>This policy covers the public Substack Intelligence plugin at <code>${BASE}/api/public-mcp</code>. The separate private development endpoint is not part of the public plugin listing.</p>

      <h2>Changes</h2>
      <p>This policy may be updated as the plugin changes. Material changes to the data the public plugin can access should be reflected here before the corresponding capability is released.</p>

      <p class="meta">Effective August 16, 2026.</p>
    `,
  }),

  terms: () => layout({
    title: "Terms of Use",
    description: "Terms of use for Substack Intelligence.",
    body: `
      <p class="eyebrow">Terms</p>
      <h1>Terms of Use</h1>
      <p class="lede">Substack Intelligence is a read-only tool for retrieving and analyzing content that a Substack publication makes publicly available.</p>

      <h2>Permitted use</h2>
      <p>You may use the service to inspect public Substack archives and ask ChatGPT to analyze the retrieved material. You are responsible for the publication URLs you provide and for using the resulting analysis in a lawful way that respects applicable rights and platform terms.</p>

      <h2>Read-only boundary</h2>
      <p>The public plugin does not publish, modify, delete, comment on, or otherwise change Substack content. It does not provide subscriber exports or private publication analytics.</p>

      <h2>Availability and accuracy</h2>
      <p>The service depends on public interfaces and content controlled by third parties. Availability, completeness, and response formats can change. The service is provided without a guarantee that every post, field, preview, or archive will always be retrievable.</p>

      <h2>Content and analysis</h2>
      <p>Substack Intelligence retrieves source material; ChatGPT performs the interpretation. Editorial conclusions, summaries, classifications, and recommendations should be treated as analysis rather than statements made by the publication or its authors.</p>

      <h2>Independence</h2>
      <p>Substack Intelligence is an independent project. It is not affiliated with, endorsed by, or sponsored by Substack or OpenAI.</p>

      <h2>Changes</h2>
      <p>These terms may be updated when the service changes. Continued use after an update is subject to the current terms published here.</p>

      <p class="meta">Effective August 16, 2026.</p>
    `,
  }),

  support: () => layout({
    title: "Support",
    description: "Support information for Substack Intelligence.",
    body: `
      <p class="eyebrow">Support</p>
      <h1>Support</h1>
      <p class="lede">If Substack Intelligence cannot read a public archive, returns incomplete material, or behaves differently from its read-only description, please report it.</p>

      <div class="card">
        <h2 style="margin-top:0">Report a problem</h2>
        <p>Open an issue in the project repository and include the public Substack URL, what you asked the plugin to do, and the error message if one appeared. Do not include Substack session cookies, authentication tokens, subscriber data, or other secrets.</p>
        <p><a href="${GITHUB_ISSUES}">Open a GitHub issue</a></p>
      </div>

      <h2>Useful details</h2>
      <ul>
        <li>The public plugin reads public posts; paywalled posts may expose only a public preview.</li>
        <li>It does not connect to private Substack accounts or publication analytics.</li>
        <li>Public Notes are not part of the first release.</li>
      </ul>

      <p class="meta">Substack Intelligence · ${BASE}</p>
    `,
  }),
};

export default async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405);
    response.setHeader("Allow", "GET");
    response.end("Method Not Allowed");
    return;
  }

  const url = new URL(request.url ?? "/api/site", "https://example.invalid");
  const page = url.searchParams.get("page") ?? "home";
  const render = pages[page];
  if (!render) {
    response.status(404);
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    response.end("Not Found");
    return;
  }

  response.status(200);
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "public, max-age=300");
  response.end(render());
}
