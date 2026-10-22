import { inflateRawSync } from 'node:zlib';
import type { Role } from '@care/shared';

/**
 * Reads the staff roster spreadsheet (`staff-credentials.ods`: columns name, email, role)
 * for `seed-staff.ts`. Kept dependency-free: an .ods is a zip holding `content.xml`, so we
 * pull that one entry out with node:zlib and read its table rows directly.
 */

export interface StaffRow {
  name: string;
  email: string;
  role: Role;
}

// Sheet role labels → app roles. A blank role (most rows) means STAFF; "key_worker" maps to
// the KEY_WORKER role (records like staff, plus reports for their own service users).
const ROLE_ALIASES: Record<string, Role> = {
  '': 'STAFF',
  staff: 'STAFF',
  key_worker: 'KEY_WORKER',
  keyworker: 'KEY_WORKER',
  support_worker: 'STAFF',
  manager: 'MANAGER',
  auditor: 'AUDITOR',
};

/** Extracts one file from a zip archive by name, using the central directory for sizes. */
export function readZipEntry(zip: Buffer, entryName: string): Buffer {
  // End-of-central-directory record: scan back from the end (it may trail a comment).
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Not a zip/ods file (no end-of-central-directory record)');

  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const compressedSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localHeader = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (name === entryName) {
      const dataStart =
        localHeader + 30 + zip.readUInt16LE(localHeader + 26) + zip.readUInt16LE(localHeader + 28);
      const data = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      throw new Error(`Unsupported zip compression method ${method} for ${entryName}`);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${entryName} not found in archive`);
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Cell text for every row of the first sheet in an ODS `content.xml`. */
export function parseOdsRows(contentXml: string): string[][] {
  const table = contentXml.match(/<table:table\b[\s\S]*?<\/table:table>/)?.[0] ?? '';
  const rows: string[][] = [];
  for (const [row] of table.matchAll(/<table:table-row\b[\s\S]*?<\/table:table-row>/g)) {
    const cells: string[] = [];
    for (const m of row.matchAll(
      /<table:(?:covered-)?table-cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g,
    )) {
      const repeat = Number(m[1].match(/number-columns-repeated="(\d+)"/)?.[1] ?? 1);
      const text = (m[2] ?? '')
        .replace(/<text:s(?:\s+text:c="(\d+)")?\s*\/>/g, (_, c) => ' '.repeat(Number(c ?? 1)))
        .replace(/<\/text:p>\s*<text:p\b[^>]*>/g, '\n')
        .replace(/<[^>]+>/g, '');
      // Trailing blank cells are often repeated ~1000 times; cap so we don't bloat rows.
      for (let i = 0; i < Math.min(repeat, 16); i++) cells.push(decodeXml(text).trim());
    }
    rows.push(cells);
  }
  return rows;
}

/**
 * Turns sheet rows (header first) into validated staff rows. Throws one error listing
 * every bad row, so a typo in the sheet is fixed in one pass rather than seed-by-seed.
 */
export function toStaffRows(rows: string[][]): StaffRow[] {
  const [header = [], ...body] = rows;
  const col = (label: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase() === label);
    if (i < 0) throw new Error(`Missing "${label}" column in the sheet header`);
    return i;
  };
  const nameCol = col('name');
  const emailCol = col('email');
  const roleCol = col('role');

  const errors: string[] = [];
  const seen = new Set<string>();
  const staff: StaffRow[] = [];
  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number (1-based, after the header)
    const name = (cells[nameCol] ?? '').trim();
    const email = (cells[emailCol] ?? '').trim().toLowerCase();
    const roleLabel = (cells[roleCol] ?? '')
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    if (!name && !email) return; // blank row

    const role = ROLE_ALIASES[roleLabel];
    if (!name) errors.push(`row ${line}: missing name`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push(`row ${line}: invalid email "${email}"`);
    if (!role) errors.push(`row ${line}: unknown role "${cells[roleCol]}"`);
    if (seen.has(email)) errors.push(`row ${line}: duplicate email ${email}`);
    seen.add(email);
    if (name && role) staff.push({ name, email, role });
  });

  if (errors.length) throw new Error(`Staff sheet has problems:\n  ${errors.join('\n  ')}`);
  return staff;
}

/** Reads and validates the staff roster from raw .ods bytes. */
export function readStaffSheet(ods: Buffer): StaffRow[] {
  return toStaffRows(parseOdsRows(readZipEntry(ods, 'content.xml').toString('utf8')));
}
