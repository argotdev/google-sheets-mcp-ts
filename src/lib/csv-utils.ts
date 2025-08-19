import { Row, Scalar, Filter, SortKey, FilterOp, Cmp } from "./types.js";

/** Normalize header cells into non-empty column names (col1, col2, ...) */
export function normalizeHeader(headerRow: readonly string[]): string[] {
  return headerRow.map((raw, i) => {
    const name = (raw ?? "").trim();
    return name || `col${i + 1}`;
  });
}

/** Simple type casting for JavaScript */
export function tryCast(v: unknown): Scalar {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = String(v).trim();

  // Try to parse as number
  const asNumber = Number(s);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) return asNumber;

  return s;
}

/** Simple case folding for JavaScript */
export function fold(s: string): string {
  return s.toLowerCase();
}

/** RFC4180-ish CSV parser supporting quotes, escaped quotes, CR/LF */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (c === "\r") {
        // bare CR row end; ignore in CRLF (handled by \n)
        if (text[i + 1] !== "\n") {
          row.push(field);
          rows.push(row);
          row = [];
          field = "";
        }
      } else {
        field += c;
      }
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** Convert CSV text to array of records, honoring a 1-based header row index */
export function recordsFromCsv(text: string, headerRow = 1): Row[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const idx = Math.max(1, headerRow) - 1;
  if (idx >= rows.length) return [];

  const header = normalizeHeader(rows[idx]);
  const dataRows = rows.slice(idx + 1);

  return dataRows.map((r): Row => {
    const padded = r.length < header.length ? [...r, ...Array(header.length - r.length).fill(null)] : r;
    const obj: Row = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = (padded[i] ?? null) as Scalar;
    return obj;
  });
}

/** CSV writer (header optional), quotes fields with commas/quotes/CR/LF */
function needsQuoting(s: string): boolean {
  return s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r");
}
function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}
function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return String(v);
}
export function toCsv(records: readonly Row[], includeHeader = true): string {
  if (!records.length) return "";
  const fieldnames = Object.keys(records[0] as Row);
  const out: string[] = [];

  if (includeHeader) {
    out.push(fieldnames.map((h) => (needsQuoting(h) ? csvEscape(h) : h)).join(","));
  }
  for (const r of records) {
    const line = fieldnames
      .map((k) => {
        const s = valueToString((r as Row)[k]);
        return needsQuoting(s) ? csvEscape(s) : s;
      })
      .join(",");
    out.push(line);
  }
  return out.join("\n");
}