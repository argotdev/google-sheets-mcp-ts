import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
/**
 * Logging (stderr only). Avoid stdout on STDIO MCP servers.
 */
const log = (...args) => console.error("[gsheets-zeroauth]", ...args);
/* -------------------------------------------------------------------------------------------------
 * Utilities
 * -------------------------------------------------------------------------------------------------*/
/** Normalize header cells into non-empty column names (col1, col2, ...) */
function normalizeHeader(headerRow) {
    return headerRow.map((raw, i) => {
        const name = (raw ?? "").trim();
        return name || `col${i + 1}`;
    });
}
/** Python-parity casting: bool strings → boolean, then int, then float, else string */
function tryCast(v) {
    if (v === null || v === undefined)
        return null;
    if (typeof v === "number" || typeof v === "boolean")
        return v;
    const s = String(v).trim();
    const low = s.toLowerCase();
    if (low === "true")
        return true;
    if (low === "false")
        return false;
    // int first (exact), then float
    const asInt = Number.parseInt(s, 10);
    if (!Number.isNaN(asInt) && String(asInt) === s)
        return asInt;
    const asFloat = Number.parseFloat(s);
    if (!Number.isNaN(asFloat) && Number.isFinite(asFloat))
        return asFloat;
    return s;
}
/** Case-fold analogue for JS (closest to Python .casefold() across locales) */
function fold(s) {
    // Using toLocaleLowerCase without explicit locale tends to be safest across environments
    return s.toLocaleLowerCase();
}
/** RFC4180-ish CSV parser supporting quotes, escaped quotes, CR/LF */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                // Escaped quote
                if (text[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else {
                    inQuotes = false;
                }
            }
            else {
                field += c;
            }
        }
        else {
            if (c === '"') {
                inQuotes = true;
            }
            else if (c === ",") {
                row.push(field);
                field = "";
            }
            else if (c === "\n") {
                row.push(field);
                rows.push(row);
                row = [];
                field = "";
            }
            else if (c === "\r") {
                // bare CR row end; ignore in CRLF (handled by \n)
                if (text[i + 1] !== "\n") {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = "";
                }
            }
            else {
                field += c;
            }
        }
    }
    row.push(field);
    rows.push(row);
    return rows;
}
/** Convert CSV text to array of records, honoring a 1-based header row index */
function recordsFromCsv(text, headerRow = 1) {
    const rows = parseCsv(text);
    if (!rows.length)
        return [];
    const idx = Math.max(1, headerRow) - 1;
    if (idx >= rows.length)
        return [];
    const header = normalizeHeader(rows[idx]);
    const dataRows = rows.slice(idx + 1);
    return dataRows.map((r) => {
        const padded = r.length < header.length ? [...r, ...Array(header.length - r.length).fill(null)] : r;
        const obj = {};
        for (let i = 0; i < header.length; i++)
            obj[header[i]] = (padded[i] ?? null);
        return obj;
    });
}
/** Filter evaluation (Python parity, including case-insensitive text comparisons) */
function applyFilters(records, filters, caseInsensitive = true) {
    if (!filters?.length)
        return records.slice();
    const matches = (rec) => {
        for (const f of filters) {
            const op = (f.op ?? "==");
            const L = rec[f.column];
            const R = f.value;
            let Lc = tryCast(L);
            let Rc = tryCast(R);
            const bothStr = typeof Lc === "string" && typeof Rc === "string";
            if (bothStr && caseInsensitive) {
                Lc = fold(Lc);
                Rc = fold(Rc);
            }
            let ok = false;
            switch (op) {
                case "==":
                case "eq":
                    ok = Lc === Rc;
                    break;
                case "!=":
                case "ne":
                    ok = Lc !== Rc;
                    break;
                case ">":
                case "gt":
                    ok = Lc !== null && Rc !== null && Lc > Rc;
                    break;
                case ">=":
                case "ge":
                    ok = Lc !== null && Rc !== null && Lc >= Rc;
                    break;
                case "<":
                case "lt":
                    ok = Lc !== null && Rc !== null && Lc < Rc;
                    break;
                case "<=":
                case "le":
                    ok = Lc !== null && Rc !== null && Lc <= Rc;
                    break;
                case "contains": {
                    if (typeof L !== "string" || typeof R !== "string")
                        return false;
                    const a = caseInsensitive ? fold(L) : L;
                    const b = caseInsensitive ? fold(R) : R;
                    ok = a.includes(b);
                    break;
                }
                case "in": {
                    const arr = Array.isArray(f.value) ? f.value : [];
                    let hay = arr.map(tryCast);
                    if (typeof Lc === "string" && caseInsensitive) {
                        hay = hay.map((x) => (typeof x === "string" ? fold(x) : x));
                        ok = hay.includes(fold(String(Lc)));
                    }
                    else {
                        ok = hay.includes(Lc);
                    }
                    break;
                }
                default:
                    return false; // unknown op -> fail
            }
            if (!ok)
                return false;
        }
        return true;
    };
    return records.filter(matches);
}
/** Project a subset of columns, preserving explicit nulls for missing keys (Python dict.get parity) */
function applySelect(records, select) {
    if (!select?.length)
        return records.slice();
    const cols = select.filter(Boolean);
    return records.map((r) => {
        const o = {};
        for (const c of cols)
            o[c] = Object.prototype.hasOwnProperty.call(r, c) ? r[c] : null;
        return o;
    });
}
/** Compare values with nulls last, numeric if both numbers else lexicographic on stringified values */
function compareValues(a, b) {
    const an = a === null || a === undefined;
    const bn = b === null || b === undefined;
    if (an !== bn)
        return an ? 1 : -1;
    const A = tryCast(a);
    const B = tryCast(b);
    if (typeof A === "number" && typeof B === "number")
        return A < B ? -1 : A > B ? 1 : 0;
    const As = String(A);
    const Bs = String(B);
    return As < Bs ? -1 : As > Bs ? 1 : 0;
}
/** Stable multi-key sort: apply keys in reverse order */
function applySort(records, sort) {
    if (!sort?.length)
        return records.slice();
    const out = records.slice();
    for (let i = sort.length - 1; i >= 0; i--) {
        const { column, direction = "asc" } = sort[i];
        const reverse = direction.toLowerCase() === "desc";
        out.sort((a, b) => {
            const cmp = compareValues(a[column], b[column]);
            return reverse ? (cmp * -1) : cmp;
        });
    }
    return out;
}
/** Limit/offset paging */
function page(records, offset, limit) {
    const off = Math.max(0, offset);
    if (limit <= 0)
        return [];
    return records.slice(off, off + limit);
}
/** End-to-end query pipeline */
function applyPipeline(base, filters, select, sort, limit = 100, offset = 0, caseInsensitive = true) {
    const filtered = applyFilters(base, filters, caseInsensitive);
    const sorted = applySort(filtered, sort);
    const projected = applySelect(sorted, select);
    return page(projected, offset, limit);
}
/** CSV writer (header optional), quotes fields with commas/quotes/CR/LF */
function needsQuoting(s) {
    return s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r");
}
function csvEscape(s) {
    return `"${s.replace(/"/g, '""')}"`;
}
function valueToString(v) {
    if (v === null || v === undefined)
        return "";
    if (typeof v === "string")
        return v;
    if (typeof v === "number" || typeof v === "boolean")
        return String(v);
    return String(v);
}
function toCsv(records, includeHeader = true) {
    if (!records.length)
        return "";
    const fieldnames = Object.keys(records[0]);
    const out = [];
    if (includeHeader) {
        out.push(fieldnames.map((h) => (needsQuoting(h) ? csvEscape(h) : h)).join(","));
    }
    for (const r of records) {
        const line = fieldnames
            .map((k) => {
            const s = valueToString(r[k]);
            return needsQuoting(s) ? csvEscape(s) : s;
        })
            .join(",");
        out.push(line);
    }
    return out.join("\n");
}
/** HTTP fetch with timeout + follow redirects */
async function fetchPublishedCsv(pubId, gid = "0") {
    const url = `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?gid=${gid}&single=true&output=csv`;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    try {
        const res = await fetch(url, { redirect: "follow", signal: ac.signal });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        return await res.text();
    }
    finally {
        clearTimeout(timer);
    }
}
/* -------------------------------------------------------------------------------------------------
 * MCP Tools (same names/args/defaults as Python)
 * -------------------------------------------------------------------------------------------------*/
const jsonOut = (data) => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
const textOut = (text) => ({ content: [{ type: "text", text }] });
const server = new McpServer({
    name: "gsheets-zeroauth",
    version: "1.0.0",
    capabilities: { tools: {}, resources: {} }
});
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
server.tool("export_subset_pub", "Export a filtered/select subset from a *published* sheet tab as CSV or JSON (returned inline).", {
    pub_id: z.string(),
    gid: z.string(),
    filters: z.array(z.object({ column: z.string(), op: z.string().optional(), value: z.any().optional() })).optional(),
    select: z.array(z.string()).optional(),
    header_row: z.number().int().default(1),
    format: z.enum(["csv", "json"]).default("csv"),
    include_header: z.boolean().default(true)
}, async ({ pub_id, gid, filters, select, header_row = 1, format = "csv", include_header = true }, extra) => {
    try {
        const csvText = await fetchPublishedCsv(pub_id, gid);
        const base = recordsFromCsv(csvText, header_row);
        const subset = applySelect(applyFilters(base, filters, true), select);
        if ((format || "csv").toLowerCase() === "json") {
            return jsonOut(subset);
        }
        // CSV; if select provided, ensure requested column order
        const ordered = select?.length
            ? subset.map((r) => {
                const o = {};
                for (const c of select)
                    o[c] = Object.prototype.hasOwnProperty.call(r, c) ? r[c] : null;
                return o;
            })
            : subset;
        return textOut(toCsv(ordered, include_header));
    }
    catch (e) {
        return textOut(`Error exporting published subset: ${e?.message ?? String(e)}`);
    }
});
/* -------------------------------------------------------------------------------------------------
 * Run (STDIO)
 * -------------------------------------------------------------------------------------------------*/
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    log("gsheets-zeroauth MCP Server running on stdio");
}
main().catch((err) => {
    console.error("Fatal error in main():", err);
    process.exit(1);
});
