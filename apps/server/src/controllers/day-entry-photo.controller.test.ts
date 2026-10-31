import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the photo service via mock.module — no DB. They pin the status
 * mapping (400 empty body, 404 out-of-plan, 415 non-image, 409 cap, 403 not-yours) and that
 * images are served with no-store + nosniff. Role/assignment enforcement is route middleware.
 */

const PHOTO = {
  id: '55555555-5555-4555-8555-555555555555',
  dayEntryId: '33333333-3333-4333-8333-333333333333',
  uploadedById: '99999999-9999-4999-8999-999999999999',
  contentType: 'image/jpeg',
  sizeBytes: 3,
  createdAt: '2026-10-31T09:00:00.000Z',
};

const serviceMock = {
  listPhotosForPlan: mock(() => Promise.resolve([PHOTO])),
  addPhoto: mock((): Promise<unknown> => Promise.resolve({ ok: true, value: PHOTO })),
  getPhotoData: mock((): Promise<unknown> => Promise.resolve(null)),
  deletePhoto: mock((): Promise<unknown> => Promise.resolve({ ok: true })),
};

mock.module('../services/day-entry-photo.service', () => serviceMock);

const controller = await import('./day-entry-photo.controller');

const user = { sub: PHOTO.uploadedById, role: 'STAFF' };

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
    set(h: Record<string, string>) {
      Object.assign(this.headers, h);
      return this;
    },
    end() {
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

function req(extra: Partial<Request>): Request {
  return { params: { id: 'plan', entryId: 'entry', photoId: PHOTO.id }, user, ...extra } as Request;
}

afterEach(() => {
  serviceMock.addPhoto.mockReset();
  serviceMock.getPhotoData.mockReset();
  serviceMock.deletePhoto.mockReset();
});

describe('upload', () => {
  it('400s on an empty body before calling the service', async () => {
    const res = mockRes();
    await controller.upload(req({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.addPhoto).not.toHaveBeenCalled();
  });

  it('201s with the photo metadata, passing the actor through', async () => {
    serviceMock.addPhoto.mockResolvedValueOnce({ ok: true, value: PHOTO });
    const res = mockRes();
    const bytes = Buffer.from([0xff, 0xd8, 0xff]);
    await controller.upload(req({ body: bytes }), res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(PHOTO);
    expect(serviceMock.addPhoto).toHaveBeenCalledWith('plan', 'entry', bytes, user.sub);
  });

  it.each([
    ['not_found', 404],
    ['unsupported_type', 415],
    ['too_many', 409],
  ])('maps %s to %d', async (reason, status) => {
    serviceMock.addPhoto.mockResolvedValueOnce({ ok: false, reason });
    const res = mockRes();
    await controller.upload(req({ body: Buffer.from([1]) }), res);
    expect(res.statusCode).toBe(status);
  });
});

describe('getImage', () => {
  it('404s for a photo that is not on this plan', async () => {
    serviceMock.getPhotoData.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getImage(req({}), res);
    expect(res.statusCode).toBe(404);
  });

  it('serves the bytes with the stored type, no-store and nosniff', async () => {
    const data = Buffer.from([0xff, 0xd8, 0xff]);
    serviceMock.getPhotoData.mockResolvedValueOnce({ contentType: 'image/jpeg', data });
    const res = mockRes();
    await controller.getImage(req({}), res);
    expect(res.body).toBe(data);
    expect(res.headers['Content-Type']).toBe('image/jpeg');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
  });
});

describe('remove', () => {
  it('204s on success', async () => {
    serviceMock.deletePhoto.mockResolvedValueOnce({ ok: true });
    const res = mockRes();
    await controller.remove(req({}), res);
    expect(res.statusCode).toBe(204);
  });

  it('403s when staff try to remove someone else’s photo', async () => {
    serviceMock.deletePhoto.mockResolvedValueOnce({ ok: false, reason: 'forbidden' });
    const res = mockRes();
    await controller.remove(req({}), res);
    expect(res.statusCode).toBe(403);
  });
});
