import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Row, Filter } from "../lib/types.js";
import { recordsFromCsv, toCsv } from "../lib/csv-utils.js";
import { applySelect, applyFilters } from "../lib/data-processing.js";
import { fetchPublishedCsv } from "../lib/http-utils.js";
import { parseSpreadsheetUrl } from "../lib/url-utils.js";

const jsonOut = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const textOut = (text: string) => ({ content: [{ type: "text" as const, text }] });

export function registerExportSubsetPub(server: McpServer): void {
  server.tool(
    "export_subset_pub",
    "Export a filtered/select subset from a *published* sheet tab as CSV or JSON (returned inline). Args: spreadsheet_url (published URL like https://docs.google.com/.../d/e/2PACX-.../pub?...).",
    {
      spreadsheet_url: z.string(),
      filters: z.array(z.object({ column: z.string(), op: z.string().optional(), value: z.any().optional() })).optional(),
      select: z.array(z.string()).optional(),
      header_row: z.number().int().default(1),
      format: z.enum(["csv", "json"]).default("csv"),
      include_header: z.boolean().default(true)
    },
    async ({ spreadsheet_url, filters, select, header_row = 1, format = "csv", include_header = true }, extra) => {
      try {
        const { pubId, gid } = parseSpreadsheetUrl(spreadsheet_url);
        const csvText = await fetchPublishedCsv(pubId, gid);
        const base = recordsFromCsv(csvText, header_row);
        const subset = applySelect(applyFilters(base, filters as Filter[] | undefined, true), select);
        if ((format || "csv").toLowerCase() === "json") {
          return jsonOut(subset);
        }
        // CSV; if select provided, ensure requested column order
        const ordered = select?.length
          ? subset.map((r) => {
              const o: Row = {};
              for (const c of select) o[c] = c in r ? r[c] : null;
              return o;
            })
          : subset;
        return textOut(toCsv(ordered, include_header));
      } catch (e: unknown) {
        return textOut(`Error exporting published subset: ${(e as Error)?.message ?? String(e)}`);
      }
    }
  );
}