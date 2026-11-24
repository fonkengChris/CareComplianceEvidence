import { describe, expect, it } from 'bun:test';
import { DEFAULT_CHECK_TEMPLATES } from '../db/house-check-defaults';
import { renderCheckPdf } from './check-submission-document';

describe('renderCheckPdf', () => {
  it('renders a multi-section submission with repeated blocks to a PDF', async () => {
    const rooms = DEFAULT_CHECK_TEMPLATES.find((t) => t.name === 'Room Checks')!;
    const pdf = await renderCheckPdf({
      templateName: rooms.name,
      templateVersion: 2,
      homeName: 'Riverside House',
      dueDate: '2026-11-23',
      dueByTime: null,
      definition: rooms.definition,
      answers: {
        rooms: [
          { roomNumber: { text: '1' }, occupied: { choice: 'NO' } },
          { roomNumber: { text: '2' }, damage: { choice: 'YES', note: 'Wardrobe door off' } },
        ],
      },
      issueCount: 1,
      late: true,
      submittedByName: 'Jane Smith',
      submittedAt: new Date('2026-11-24T09:15:00Z'),
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
