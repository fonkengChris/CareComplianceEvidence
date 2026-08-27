import type { WeekPlanTemplateWithEntries, WeekPlanWithEntries } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import type { ConflictResult } from '../services/week-plan.service';
import type { SaveAsTemplateResult } from '../services/week-plan-template.service';

/**
 * Controller tests stub the service via mock.module — no DB or bound port. They assert
 * status-code mapping: a `conflict` on generate → 409 (one plan per week), validation
 * 400s before the service runs, and `not_found` on save-from-week → 404. Role
 * enforcement lives in middleware, not here.
 */

const templateWithEntries: WeekPlanTemplateWithEntries = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  notes: null,
  dayEntries: [],
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const planWithEntries: WeekPlanWithEntries = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceUserId: templateWithEntries.serviceUserId,
  weekCommencing: '2026-08-17',
  notes: null,
  dayEntries: [],
  compliance: {
    deliveredMinutes: 0,
    contractedMinutes: 0,
    remainingMinutes: 0,
    deliveryPct: 0,
    status: 'ATTENTION',
  },
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};

const serviceMock = {
  getOrCreateTemplate: mock((): Promise<WeekPlanTemplateWithEntries> =>
    Promise.resolve(templateWithEntries),
  ),
  replaceTemplateEntries: mock((): Promise<WeekPlanTemplateWithEntries> =>
    Promise.resolve(templateWithEntries),
  ),
  generateWeekFromTemplate: mock((): Promise<ConflictResult<WeekPlanWithEntries>> =>
    Promise.resolve({ ok: true, value: planWithEntries }),
  ),
  saveWeekAsTemplate: mock((): Promise<SaveAsTemplateResult> =>
    Promise.resolve({ ok: true, value: templateWithEntries }),
  ),
};

mock.module('../services/week-plan-template.service', () => serviceMock);

const controller = await import('./week-plan-template.controller');

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
  serviceMock.getOrCreateTemplate.mockReset();
  serviceMock.replaceTemplateEntries.mockReset();
  serviceMock.generateWeekFromTemplate.mockReset();
  serviceMock.saveWeekAsTemplate.mockReset();
});

describe('getForServiceUser', () => {
  it('returns the template for the service user', async () => {
    serviceMock.getOrCreateTemplate.mockResolvedValueOnce(templateWithEntries);
    const res = mockRes();
    await controller.getForServiceUser(
      { params: { serviceUserId: templateWithEntries.serviceUserId } } as unknown as Request,
      res,
    );
    expect(serviceMock.getOrCreateTemplate).toHaveBeenCalledWith(templateWithEntries.serviceUserId);
    expect(res.body).toEqual(templateWithEntries);
  });
});

describe('replaceEntries', () => {
  it('400s on an invalid body before touching the service', async () => {
    const res = mockRes();
    await controller.replaceEntries(
      {
        params: { serviceUserId: templateWithEntries.serviceUserId },
        body: {},
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.replaceTemplateEntries).not.toHaveBeenCalled();
  });

  it('replaces and returns the template on a valid body', async () => {
    serviceMock.replaceTemplateEntries.mockResolvedValueOnce(templateWithEntries);
    const res = mockRes();
    await controller.replaceEntries(
      {
        params: { serviceUserId: templateWithEntries.serviceUserId },
        body: { entries: [] },
      } as unknown as Request,
      res,
    );
    expect(res.body).toEqual(templateWithEntries);
  });
});

describe('generate', () => {
  it('201s with the new plan on success', async () => {
    serviceMock.generateWeekFromTemplate.mockResolvedValueOnce({
      ok: true,
      value: planWithEntries,
    });
    const res = mockRes();
    await controller.generate(
      {
        params: { serviceUserId: templateWithEntries.serviceUserId },
        body: { weekCommencing: '2026-08-17' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(planWithEntries);
  });

  it('409s when a plan for that week already exists', async () => {
    serviceMock.generateWeekFromTemplate.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.generate(
      {
        params: { serviceUserId: templateWithEntries.serviceUserId },
        body: { weekCommencing: '2026-08-17' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('400s on a malformed target week', async () => {
    const res = mockRes();
    await controller.generate(
      {
        params: { serviceUserId: templateWithEntries.serviceUserId },
        body: { weekCommencing: 'not-a-date' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.generateWeekFromTemplate).not.toHaveBeenCalled();
  });
});

describe('saveFromWeek', () => {
  it('404s when the week plan is unknown', async () => {
    serviceMock.saveWeekAsTemplate.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const res = mockRes();
    await controller.saveFromWeek(
      { params: { weekPlanId: planWithEntries.id } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns the updated template on success', async () => {
    serviceMock.saveWeekAsTemplate.mockResolvedValueOnce({ ok: true, value: templateWithEntries });
    const res = mockRes();
    await controller.saveFromWeek(
      { params: { weekPlanId: planWithEntries.id } } as unknown as Request,
      res,
    );
    expect(res.body).toEqual(templateWithEntries);
  });
});
