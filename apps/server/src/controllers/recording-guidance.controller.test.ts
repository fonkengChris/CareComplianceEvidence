import { describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the compliance service (which owns the settings singleton) via
 * mock.module — no DB. They assert the read shape, the write happy path, and that an invalid
 * body (guidance over the length cap) is rejected 400 before the service is called. Role
 * enforcement lives in route middleware, not here.
 */

const serviceMock = {
  getRecordingGuidance: mock((): Promise<string> => Promise.resolve('Existing guidance.')),
  updateRecordingGuidance: mock((v: string): Promise<string> => Promise.resolve(v)),
};

mock.module('../services/compliance.service', () => serviceMock);

const controller = await import('./recording-guidance.controller');

function mockRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe('recording-guidance controller', () => {
  it('returns the current guidance', async () => {
    const res = mockRes();
    await controller.get({} as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ guidance: 'Existing guidance.' });
  });

  it('saves and echoes back valid guidance', async () => {
    const res = mockRes();
    await controller.update({ body: { guidance: 'Capture the outcome.' } } as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ guidance: 'Capture the outcome.' });
    expect(serviceMock.updateRecordingGuidance).toHaveBeenCalledWith('Capture the outcome.');
  });

  it('400s when the guidance exceeds the length cap, without calling the service', async () => {
    serviceMock.updateRecordingGuidance.mockClear();
    const res = mockRes();
    await controller.update({ body: { guidance: 'x'.repeat(2001) } } as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.updateRecordingGuidance).not.toHaveBeenCalled();
  });
});
