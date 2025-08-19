import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";
/**
 * Logging (stderr only). Avoid stdout on STDIO MCP servers.
 */
const log = (...args) => console.error("[gsheets-zeroauth]", ...args);
const server = new McpServer({
    name: "gsheets-zeroauth",
    version: "1.0.0",
    capabilities: { tools: {}, resources: {} }
});
registerAllTools(server);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("gsheets-zeroauth MCP Server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error in main():", err);
    process.exit(1);
});
