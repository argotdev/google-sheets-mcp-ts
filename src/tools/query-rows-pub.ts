import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Filter, SortKey } from "../lib/types.js";
import { recordsFromCsv } from "../lib/csv-utils.js";
import { applyPipeline } from "../lib/data-processing.js";
import { fetchPublishedCsv, parseSpreadsheetUrl } from "../lib/http-utils.js";

const jsonOut = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const textOut = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerQueryRowsPub(server: McpServer): void {
  server.tool(
    "query_rows_pub",
    "Query rows (filters/select/sort/paging) from a *published* sheet tab (no auth). Args: spreadsheet_url (published URL like https://docs.google.com/.../d/e/2PACX-.../pub?...).",
    {
      spreadsheet_url: z.string(),
      filters: z.array(z.object({ column: z.string(), op: z.string().optional(), value: z.any().optional() })).optional(),
      select: z.array(z.string()).optional(),
      sort: z.array(z.object({ column: z.string(), direction: z.string().optional() })).optional(),
      header_row: z.number().int().default(1),
      limit: z.number().int().default(100),
      offset: z.number().int().default(0),
      case_insensitive: z.boolean().default(true)
    },
    async ({
      spreadsheet_url,
      filters,
      select,
      sort,
      header_row = 1,
      limit = 100,
      offset = 0,
      case_insensitive = true
    }, extra) => {
      try {
        const { pubId, gid } = parseSpreadsheetUrl(spreadsheet_url);
        const csvText = await fetchPublishedCsv(pubId, gid);
        const base = recordsFromCsv(csvText, header_row);
        const out = applyPipeline(base, filters as Filter[] | undefined, select, sort as SortKey[] | undefined, limit, offset, case_insensitive);
        return jsonOut(out);
      } catch (e: unknown) {
        return textOut(`Error querying published CSV: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  );
}