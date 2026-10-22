import { ACTIVE_VALUES, parseCsv } from './homes-sheet';

/**
 * Reads the service-users export (`service_users.csv`: Name, Home, Active, and optionally
 * Contracted Hours) for `seed-service-users.ts`. Home is matched by name against the homes
 * already in the database (seed those first with `db:seed-homes`).
 *
 * The export carries no contracted hours, so a missing/blank value seeds as 0 — managers set
 * the real contract in the app (compliance treats 0 as 0%, never divides by it).
 */

export interface ServiceUserRow {
  name: string;
  homeName: string | null;
  contractedHours: number;
  active: boolean;
}

/**
 * Turns CSV rows (header first) into validated service users. Throws one error listing every
 * bad row, so the sheet is fixed in one pass rather than seed-by-seed.
 */
export function toServiceUserRows(rows: string[][]): ServiceUserRow[] {
  const [header = [], ...body] = rows;
  const col = (labels: string[], required = true) => {
    const i = header.findIndex((h) => labels.includes(h.trim().toLowerCase()));
    if (i < 0 && required) throw new Error(`Missing "${labels[0]}" column in the sheet header`);
    return i;
  };
  const nameCol = col(['name']);
  const homeCol = col(['home'], false);
  const hoursCol = col(['contracted hours', 'contractedhours', 'contracted_hours'], false);
  const activeCol = col(['active'], false);

  const errors: string[] = [];
  const seen = new Set<string>();
  const serviceUsers: ServiceUserRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number (1-based, after the header)
    if (cells.every((c) => !c.trim())) return; // blank row
    const get = (c: number) => (c >= 0 ? (cells[c] ?? '').trim() : '');

    const name = get(nameCol);
    const homeName = get(homeCol) || null;
    const hoursText = get(hoursCol);
    const contractedHours = hoursText ? Number(hoursText) : 0;
    const active = ACTIVE_VALUES[get(activeCol).toLowerCase()];
    if (!name) errors.push(`row ${line}: missing name`);
    if (!Number.isFinite(contractedHours) || contractedHours < 0)
      errors.push(`row ${line}: invalid contracted hours "${hoursText}"`);
    if (active === undefined) errors.push(`row ${line}: unknown Active value "${get(activeCol)}"`);
    const key = name.toLowerCase();
    if (name && seen.has(key)) errors.push(`row ${line}: duplicate service user ${name}`);
    seen.add(key);
    if (name && active !== undefined && Number.isFinite(contractedHours))
      serviceUsers.push({ name, homeName, contractedHours, active });
  });

  if (errors.length) throw new Error(`Service users sheet has problems:\n  ${errors.join('\n  ')}`);
  return serviceUsers;
}

/** Reads and validates the service-users list from CSV text. */
export function readServiceUsersSheet(csv: string): ServiceUserRow[] {
  return toServiceUserRows(parseCsv(csv.replace(/^\uFEFF/, '')));
}
