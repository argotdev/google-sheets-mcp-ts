type Scalar = string | number | boolean | null;
export type Row = Record<string, Scalar>;

type Cmp = -1 | 0 | 1;

type EqOp = "=" | "==" | "eq";
type NeOp = "!=" | "ne";
type GtOp = ">" | "gt";
type GeOp = ">=" | "ge";
type LtOp = "<" | "lt";
type LeOp = "<=" | "le";
type TextOp = "contains";
type SetOp = "in";

type FilterOp = EqOp | NeOp | GtOp | GeOp | LtOp | LeOp | TextOp | SetOp;

export interface Filter {
  readonly column: string;
  readonly op?: FilterOp;        // default "=="
  readonly value?: unknown;
}

export interface SortKey {
  readonly column: string;
  readonly direction?: "asc" | "desc" | string; // default "asc"
}

export type { Scalar, Cmp, FilterOp };