import { describe, expect, it } from "vitest";

import { buildSitemapXml } from "./sitemap";

describe("buildSitemapXml", () => {
  it("includes app routes, agent docs, and API docs", () => {
    const xml = buildSitemapXml("http://localhost:5173", "http://localhost:8000");
    expect(xml).toContain("<loc>http://localhost:5173/</loc>");
    expect(xml).toContain("<loc>http://localhost:5173/llm.txt</loc>");
    expect(xml).toContain("<loc>http://localhost:5173/mcp-guidance.md</loc>");
    expect(xml).toContain("<loc>http://localhost:5173/model-architecture.md</loc>");
    expect(xml).toContain("<loc>http://localhost:5173/api-contracts.md</loc>");
    expect(xml).toContain("<loc>http://localhost:8000/docs</loc>");
    expect(xml).not.toContain("&amp;amp;");
  });

  it("strips trailing slashes from origins", () => {
    const xml = buildSitemapXml("http://app.example.com/", "http://api.example.com/");
    expect(xml).toContain("<loc>http://app.example.com/llm.txt</loc>");
    expect(xml).toContain("<loc>http://api.example.com/docs</loc>");
  });
});
