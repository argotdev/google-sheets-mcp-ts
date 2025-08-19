import { tryCast, fold } from "./csv-utils.js";
/** Filter evaluation (including case-insensitive text comparisons) */
export function applyFilters(records, filters, caseInsensitive = true) {
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
                case "=":
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
/** Project a subset of columns, preserving explicit nulls for missing keys */
export function applySelect(records, select) {
    if (!select?.length)
        return records.slice();
    const cols = select.filter(Boolean);
    return records.map((r) => {
        const o = {};
        for (const c of cols)
            o[c] = c in r ? r[c] : null;
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
export function applySort(records, sort) {
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
export function page(records, offset, limit) {
    const off = Math.max(0, offset);
    if (limit <= 0)
        return [];
    return records.slice(off, off + limit);
}
/** End-to-end query pipeline */
export function applyPipeline(base, filters, select, sort, limit = 100, offset = 0, caseInsensitive = true) {
    const filtered = applyFilters(base, filters, caseInsensitive);
    const sorted = applySort(filtered, sort);
    const projected = applySelect(sorted, select);
    return page(projected, offset, limit);
}
