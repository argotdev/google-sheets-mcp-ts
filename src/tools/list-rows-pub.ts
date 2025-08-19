import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { recordsFromCsv } from "../lib/csv-utils.js";
import { page } from "../lib/data-processing.js";
import { fetchPublishedCsv } from "../lib/http-utils.js";
import { parseSpreadsheetUrl } from "../lib/url-utils.js";

const jsonOut = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const textOut = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerListRowsPub(server: McpServer): void {
  server.tool(
    "list_rows_pub",
    "List rows from a *published* Google Sheet tab (no auth). Args: spreadsheet_url (published URL like https://docs.google.com/.../d/e/2PACX-.../pub?...).",
    {
      spreadsheet_url: z.string(),
      header_row: z.number().int().default(1),
      limit: z.number().int().default(100),
      offset: z.number().int().default(0)
    },
    async ({ spreadsheet_url, header_row = 1, limit = 100, offset = 0 }, extra) => {
      try {
        const { pubId, gid } = parseSpreadsheetUrl(spreadsheet_url);
        const csvText = await fetchPublishedCsv(pubId, gid);
        const records = recordsFromCsv(csvText, header_row);
        return jsonOut(page(records, offset, limit));
      } catch (e: unknown) {
        return textOut(`Error fetching published CSV: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  );
}