import type { ComplianceSettings } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import type { UpdateSettingsResult } from '../services/compliance.service';

/**
 * Controller tests stub the service via mock.module — no DB. They assert validation 400s
 * (bad body, and the merged `invalid` result) and status mapping. Role enforcement lives in
 * route middleware, not here (see compliance.routes.ts).
 */

const settings: ComplianceSettings = {
  id: '11111111-1111-4111-8111-111111111111',
  greenMin: 90,
  amberMin: 75,
  redOverPct: 110,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const serviceMock = {
  getComplianceSettings: mock((): Promise<ComplianceSettings> => Promise.resolve(settings)),
  updateComplianceSettings: mock(
    (): Promise<UpdateSettingsResult> => Promise.resolve({ ok: true, value: settings }),
  ),
};

mock.module('../services/compliance.service', () => serviceMock);

const controller = await import('./compliance.controller');

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

afterEach(() => {
  serviceMock.getComplianceSettings.mockReset();
  serviceMock.updateComplianceSettings.mockReset();
});

describe('get', () => {
  it('returns the settings row', async () => {
    serviceMock.getComplianceSettings.mockResolvedValueOnce(settings);
    const res = mockRes();
    await controller.get({} as Request, res);
    expect(res.body).toEqual(settings);
  });
});

describe('update', () => {
  it('400s on an invalid body before calling the service', async () => {
    const res = mockRes();
    await controller.update({ body: { greenMin: -5 } } as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.updateComplianceSettings).not.toHaveBeenCalled();
  });

  it('400s when the merged thresholds are out of order', async () => {
    serviceMock.updateComplianceSettings.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    const res = mockRes();
    await controller.update({ body: { greenMin: 120 } } as Request, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns the saved settings on success', async () => {
    const saved = { ...settings, greenMin: 85 };
    serviceMock.updateComplianceSettings.mockResolvedValueOnce({ ok: true, value: saved });
    const res = mockRes();
    await controller.update({ body: { greenMin: 85 } } as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(saved);
  });
});
