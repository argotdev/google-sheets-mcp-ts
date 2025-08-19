import { z } from "zod";
import { recordsFromCsv } from "../lib/csv-utils.js";
import { page } from "../lib/data-processing.js";
import { fetchPublishedCsv } from "../lib/http-utils.js";
const jsonOut = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const textOut = (text) => ({ content: [{ type: "text", text }] });
export function registerListRowsPub(server) {
    server.tool("list_rows_pub", "List rows from a *published* Google Sheet tab (no auth). Args: pub_id (2PACX... from 'Publish to web'), gid (sheet tab id).", {
        pub_id: z.string(),
        gid: z.string().default("0"),
        header_row: z.number().int().default(1),
        limit: z.number().int().default(100),
        offset: z.number().int().default(0)
    }, async ({ pub_id, gid = "0", header_row = 1, limit = 100, offset = 0 }, extra) => {
        try {
            const csvText = await fetchPublishedCsv(pub_id, gid);
            const records = recordsFromCsv(csvText, header_row);
            return jsonOut(page(records, offset, limit));
        }
        catch (e) {
            return textOut(`Error fetching published CSV: ${e?.message ?? String(e)}`);
        }
    });
}
