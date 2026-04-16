import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import { buildSitemapXml } from "./src/agent-instructions/sitemap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filesDir = path.resolve(__dirname, "src/agent-instructions/files");

/** URL path → filename under filesDir */
const STATIC_FILES: Record<string, string> = {
  "/llm.txt": "llm.txt",
  "/mcp-guidance.md": "mcp-guidance.md",
  "/model-architecture.md": "model-architecture.md",
  "/api-contracts.md": "api-contracts.md",
};

export type AgentInstructionPluginOptions = {
  appOrigin: string;
  apiOrigin: string;
};

function readInstructionFile(name: string): string {
  return fs.readFileSync(path.join(filesDir, name), "utf8");
}

function contentTypeForPath(urlPath: string): string {
  if (urlPath.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (urlPath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}

export function agentInstructionAssetsPlugin(options: AgentInstructionPluginOptions): Plugin {
  return {
    name: "agent-instruction-assets",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url === "/sitemap.xml") {
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(buildSitemapXml(options.appOrigin, options.apiOrigin));
          return;
        }
        const fileName = STATIC_FILES[url];
        if (fileName) {
          res.setHeader("Content-Type", contentTypeForPath(url));
          res.end(readInstructionFile(fileName));
          return;
        }
        next();
      });
    },
    generateBundle() {
      for (const [urlPath, fileName] of Object.entries(STATIC_FILES)) {
        this.emitFile({
          type: "asset",
          fileName: urlPath.replace(/^\//, ""),
          source: readInstructionFile(fileName),
        });
      }
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml(options.appOrigin, options.apiOrigin),
      });
    },
  };
}
