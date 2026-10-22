import { describe, expect, it } from 'bun:test';
import { parseCsv, readHomesSheet, toHomeRows } from './homes-sheet';

const HEADER =
  'Name,Address,City,Postcode,Phone,Email,Capacity,Opens,Closes,Active Service Users,Active';

describe('parseCsv', () => {
  it('handles quoted commas, escaped quotes and CRLF', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\nd,e,f\r\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['d', 'e', 'f'],
    ]);
  });

  it('keeps empty cells and a final line without a newline', () => {
    expect(parseCsv('a,,c\nd,e,')).toEqual([
      ['a', '', 'c'],
      ['d', 'e', ''],
    ]);
  });
});

describe('readHomesSheet', () => {
  it('joins address, city and postcode and maps Active', () => {
    const csv = `${HEADER}
Cotton Lane Home,19 Cotton Lane,Derby,DE24 8GG,0775,x@y.com,3,08:00,08:00,3,Yes
Outreach Derby PB,"30 Appleby Court, Boyer Street",Derby,DE24 0TJ,,,1,08:00,18:00,1,No
`;
    expect(readHomesSheet(csv)).toEqual([
      { name: 'Cotton Lane Home', address: '19 Cotton Lane, Derby, DE24 8GG', active: true },
      {
        name: 'Outreach Derby PB',
        address: '30 Appleby Court, Boyer Street, Derby, DE24 0TJ',
        active: false,
      },
    ]);
  });

  it('stores a null address when every address part is blank', () => {
    expect(readHomesSheet(`${HEADER}\nX Home,,,,,,1,,,0,Yes`)[0].address).toBeNull();
  });
});

describe('toHomeRows', () => {
  it('skips blank rows', () => {
    expect(
      toHomeRows([
        ['Name', 'Address'],
        ['', ''],
        ['A', '1 St'],
      ]),
    ).toEqual([{ name: 'A', address: '1 St', active: true }]);
  });

  it('reports every bad row at once', () => {
    const rows = [
      ['Name', 'Address', 'Active'],
      ['', '1 St', 'Yes'],
      ['A', '', 'maybe'],
      ['B', '', 'Yes'],
      ['b', '', 'Yes'],
    ];
    expect(() => toHomeRows(rows)).toThrow(
      /row 2: missing name[\s\S]*row 3: unknown Active value "maybe"[\s\S]*row 5: duplicate home b/,
    );
  });

  it('requires a Name and Address column', () => {
    expect(() => toHomeRows([['Address']])).toThrow('Missing "name" column');
    expect(() => toHomeRows([['Name']])).toThrow('Missing "address" column');
  });
});
