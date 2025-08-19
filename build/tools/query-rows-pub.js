import { z } from "zod";
import { recordsFromCsv } from "../lib/csv-utils.js";
import { applyPipeline } from "../lib/data-processing.js";
import { fetchPublishedCsv } from "../lib/http-utils.js";
const jsonOut = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const textOut = (text) => ({ content: [{ type: "text", text }] });
export function registerQueryRowsPub(server) {
    server.tool("query_rows_pub", "Query rows (filters/select/sort/paging) from a *published* sheet tab (no auth).", {
        pub_id: z.string(),
        gid: z.string(),
        filters: z.array(z.object({ column: z.string(), op: z.string().optional(), value: z.any().optional() })).optional(),
        select: z.array(z.string()).optional(),
        sort: z.array(z.object({ column: z.string(), direction: z.string().optional() })).optional(),
        header_row: z.number().int().default(1),
        limit: z.number().int().default(100),
        offset: z.number().int().default(0),
        case_insensitive: z.boolean().default(true)
    }, async ({ pub_id, gid, filters, select, sort, header_row = 1, limit = 100, offset = 0, case_insensitive = true }, extra) => {
        try {
            const csvText = await fetchPublishedCsv(pub_id, gid);
            const base = recordsFromCsv(csvText, header_row);
            const out = applyPipeline(base, filters, select, sort, limit, offset, case_insensitive);
            return jsonOut(out);
        }
        catch (e) {
            return textOut(`Error querying published CSV: ${e?.message ?? String(e)}`);
        }
    });
}
