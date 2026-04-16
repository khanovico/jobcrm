import mcpGuidance from "./files/mcp-guidance.md?raw";
import llmTxt from "./files/llm.txt?raw";

export type AgentInstructionKind = "text" | "markdown";

export type AgentInstructionFile = {
  id: string;
  /** Served at this path on the app origin (Vite dev / static build). */
  publicPath: string;
  kind: AgentInstructionKind;
  title: string;
  body: string;
};

export const AGENT_INSTRUCTION_FILES: readonly AgentInstructionFile[] = [
  {
    id: "llm-overview",
    publicPath: "/llm.txt",
    kind: "text",
    title: "Agent overview (llm.txt)",
    body: llmTxt,
  },
  {
    id: "mcp-guidance",
    publicPath: "/mcp-guidance.md",
    kind: "markdown",
    title: "MCP / agent guidance",
    body: mcpGuidance,
  },
];

export function getAgentInstructionByPath(pathname: string): AgentInstructionFile | undefined {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return AGENT_INSTRUCTION_FILES.find((f) => f.publicPath === normalized);
}
