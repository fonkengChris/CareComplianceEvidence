import { describe, expect, it } from 'bun:test';
import { deflateRawSync } from 'node:zlib';
import { parseOdsRows, readZipEntry, toStaffRows } from './staff-sheet';

const xml = (rows: string) =>
  `<office:document-content><office:body><office:spreadsheet><table:table table:name="Sheet1">${rows}</table:table></office:spreadsheet></office:body></office:document-content>`;
const cell = (text: string) =>
  `<table:table-cell office:value-type="string"><text:p>${text}</text:p></table:table-cell>`;
const row = (...cells: string[]) => `<table:table-row>${cells.join('')}</table:table-row>`;

/** Minimal single-entry deflated zip, enough to exercise readZipEntry. */
function zipOf(name: string, content: string): Buffer {
  const data = deflateRawSync(Buffer.from(content));
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]);
}

describe('readZipEntry', () => {
  it('inflates the named entry', () => {
    expect(readZipEntry(zipOf('content.xml', '<x/>'), 'content.xml').toString()).toBe('<x/>');
  });

  it('throws for a missing entry', () => {
    expect(() => readZipEntry(zipOf('a.xml', ''), 'content.xml')).toThrow('not found');
  });
});

describe('parseOdsRows', () => {
  it('reads cell text, decoding entities, spaces and repeated cells', () => {
    const rows = parseOdsRows(
      xml(
        row(cell('name'), cell('email'), cell('role')) +
          row(
            cell('Ann&amp;<text:s/>Bo'),
            cell('ann@x.com'),
            '<table:table-cell table:number-columns-repeated="1020"/>',
          ),
      ),
    );
    expect(rows[0]).toEqual(['name', 'email', 'role']);
    expect(rows[1].slice(0, 3)).toEqual(['Ann& Bo', 'ann@x.com', '']);
  });
});

describe('toStaffRows', () => {
  const header = ['name', 'email', 'role'];

  it('maps blank to STAFF, key_worker to KEY_WORKER and normalises email', () => {
    expect(
      toStaffRows([
        header,
        ['Alice Hayday', ' Alice@Outlook.com ', 'key_worker'],
        ['Gemma Clarke', 'gemma@x.com', ''],
        ['Boss', 'boss@x.com', 'Manager'],
        ['', '', ''],
      ]),
    ).toEqual([
      { name: 'Alice Hayday', email: 'alice@outlook.com', role: 'KEY_WORKER' },
      { name: 'Gemma Clarke', email: 'gemma@x.com', role: 'STAFF' },
      { name: 'Boss', email: 'boss@x.com', role: 'MANAGER' },
    ]);
  });

  it('reports every bad row at once', () => {
    expect(() =>
      toStaffRows([
        header,
        ['A', 'not-an-email', ''],
        ['B', 'b@x.com', 'chef'],
        ['C', 'b@x.com', ''],
      ]),
    ).toThrow(/row 2: invalid email[\s\S]*row 3: unknown role "chef"[\s\S]*row 4: duplicate email/);
  });

  it('requires the header columns', () => {
    expect(() => toStaffRows([['name', 'email']])).toThrow('Missing "role" column');
  });
});
