import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListRowsPub } from "./list-rows-pub.js";
import { registerQueryRowsPub } from "./query-rows-pub.js";
import { registerExportSubsetPub } from "./export-subset-pub.js";

export function registerAllTools(server: McpServer): void {
  registerListRowsPub(server);
  registerQueryRowsPub(server);
  registerExportSubsetPub(server);
}