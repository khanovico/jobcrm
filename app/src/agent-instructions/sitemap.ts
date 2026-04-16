/** Normalize origin without trailing slash */
function originOnly(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * Sitemap for humans and agents: SPA routes on the app origin plus API docs on the API origin.
 */
export function buildSitemapXml(appOrigin: string, apiOrigin: string): string {
  const app = originOnly(appOrigin);
  const api = originOnly(apiOrigin);

  const urls: string[] = [
    `${app}/`,
    `${app}/applications`,
    `${app}/companies`,
    `${app}/profiles`,
    `${app}/industries`,
    `${app}/audit`,
    `${app}/notifications`,
    `${app}/llm.txt`,
    `${app}/mcp-guidance.md`,
    `${app}/model-architecture.md`,
    `${app}/api-contracts.md`,
    `${api}/docs`,
  ];

  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`),
    "</urlset>",
  ];
  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
