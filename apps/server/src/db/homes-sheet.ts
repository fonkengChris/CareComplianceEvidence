/**
 * Reads the homes export (`homes.csv`: Name, Address, City, Postcode, …, Active) for
 * `seed-homes.ts`. Only the columns the `homes` table stores are used — name, a single
 * address line (Address + City + Postcode) and active; phone, email, capacity and opening
 * hours have no column yet and are ignored.
 */

export interface HomeRow {
  name: string;
  address: string | null;
  active: boolean;
}

/** Splits CSV text into rows of cells (RFC 4180: quoted fields, "" escapes, CRLF/LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

const ACTIVE_VALUES: Record<string, boolean> = {
  '': true,
  yes: true,
  y: true,
  true: true,
  no: false,
  n: false,
  false: false,
};

/**
 * Turns CSV rows (header first) into validated homes. Throws one error listing every bad
 * row, so the sheet is fixed in one pass rather than seed-by-seed.
 */
export function toHomeRows(rows: string[][]): HomeRow[] {
  const [header = [], ...body] = rows;
  const col = (label: string, required = true) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === label);
    if (i < 0 && required) throw new Error(`Missing "${label}" column in the sheet header`);
    return i;
  };
  const nameCol = col('name');
  const addressCols = [col('address'), col('city', false), col('postcode', false)];
  const activeCol = col('active', false);

  const errors: string[] = [];
  const seen = new Set<string>();
  const homes: HomeRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number (1-based, after the header)
    if (cells.every((c) => !c.trim())) return; // blank row
    const get = (c: number) => (c >= 0 ? (cells[c] ?? '').trim() : '');

    const name = get(nameCol);
    const address = addressCols.map(get).filter(Boolean).join(', ') || null;
    const active = ACTIVE_VALUES[get(activeCol).toLowerCase()];
    if (!name) errors.push(`row ${line}: missing name`);
    if (active === undefined) errors.push(`row ${line}: unknown Active value "${get(activeCol)}"`);
    const key = name.toLowerCase();
    if (name && seen.has(key)) errors.push(`row ${line}: duplicate home ${name}`);
    seen.add(key);
    if (name && active !== undefined) homes.push({ name, address, active });
  });

  if (errors.length) throw new Error(`Homes sheet has problems:\n  ${errors.join('\n  ')}`);
  return homes;
}

/** Reads and validates the homes list from CSV text. */
export function readHomesSheet(csv: string): HomeRow[] {
  return toHomeRows(parseCsv(csv.replace(/^﻿/, '')));
}
