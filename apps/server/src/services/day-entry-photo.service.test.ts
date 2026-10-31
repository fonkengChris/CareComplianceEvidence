import { describe, expect, it } from 'bun:test';
import { detectImageType, toPublicPhoto } from './day-entry-photo.service';

/**
 * Pure tests — no DB. The stored (and later served) Content-Type comes from the bytes, never
 * the client header, so the sniffing is pinned here.
 */

describe('detectImageType', () => {
  it('recognises JPEG, PNG and WebP from their signatures', () => {
    expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
    expect(
      detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
    ).toBe('image/png');
    expect(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'))).toBe(
      'image/webp',
    );
  });

  it('rejects anything else, including HTML/SVG dressed up as an image', () => {
    expect(detectImageType(Buffer.from('<svg onload="alert(1)"></svg>'))).toBeNull();
    expect(detectImageType(Buffer.from('<html></html>'))).toBeNull();
    expect(detectImageType(Buffer.from('GIF89a'))).toBeNull();
    expect(detectImageType(Buffer.alloc(0))).toBeNull();
  });
});

describe('toPublicPhoto', () => {
  it('maps a metadata row to the shared shape with an ISO timestamp', () => {
    const photo = toPublicPhoto({
      id: '55555555-5555-4555-8555-555555555555',
      dayEntryId: '33333333-3333-4333-8333-333333333333',
      uploadedById: null,
      contentType: 'image/jpeg',
      sizeBytes: 1234,
      createdAt: new Date('2026-10-31T09:00:00.000Z'),
    });
    expect(photo.createdAt).toBe('2026-10-31T09:00:00.000Z');
    expect(photo.uploadedById).toBeNull();
  });
});
