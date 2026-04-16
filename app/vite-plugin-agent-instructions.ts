import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

import { buildSitemapXml } from "./src/agent-instructions/sitemap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filesDir = path.resolve(__dirname, "src/agent-instructions/files");

export type AgentInstructionPluginOptions = {
  appOrigin: string;
  apiOrigin: string;
};

function readInstructionFile(name: string): string {
  return fs.readFileSync(path.join(filesDir, name), "utf8");
}

export function agentInstructionAssetsPlugin(options: AgentInstructionPluginOptions): Plugin {
  return {
    name: "agent-instruction-assets",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (url === "/llm.txt") {
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(readInstructionFile("llm.txt"));
          return;
        }
        if (url === "/mcp-guidance.md") {
          res.setHeader("Content-Type", "text/markdown; charset=utf-8");
          res.end(readInstructionFile("mcp-guidance.md"));
          return;
        }
        if (url === "/sitemap.xml") {
          res.setHeader("Content-Type", "application/xml; charset=utf-8");
          res.end(buildSitemapXml(options.appOrigin, options.apiOrigin));
          return;
        }
        next();
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "llm.txt",
        source: readInstructionFile("llm.txt"),
      });
      this.emitFile({
        type: "asset",
        fileName: "mcp-guidance.md",
        source: readInstructionFile("mcp-guidance.md"),
      });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: buildSitemapXml(options.appOrigin, options.apiOrigin),
      });
    },
  };
}
