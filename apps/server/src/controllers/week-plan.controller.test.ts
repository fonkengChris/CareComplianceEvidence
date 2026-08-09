import type { WeekPlan, WeekPlanWithEntries } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import type {
  ConflictResult,
  DuplicateResult,
  RecordResult,
  ReplaceEntriesResult,
} from '../services/week-plan.service';

/**
 * Controller tests stub the service layer via mock.module — no DB or bound port. They
 * assert status-code mapping, including the `conflict` result → 409 (one plan per week;
 * unique day/line slots) and validation 400s before the service is ever called. Role
 * enforcement lives in middleware, not here.
 */

const serviceMock = {
  listWeekPlans: mock((): Promise<WeekPlan[]> => Promise.resolve([])),
  listWeekPlansForStaff: mock((): Promise<WeekPlan[]> => Promise.resolve([])),
  getWeekPlan: mock((): Promise<WeekPlanWithEntries | null> => Promise.resolve(null)),
  createWeekPlan: mock(
    (): Promise<ConflictResult<WeekPlan>> => Promise.resolve({ ok: true, value: plan }),
  ),
  updateWeekPlan: mock(
    (): Promise<ConflictResult<WeekPlan> | null> => Promise.resolve({ ok: true, value: plan }),
  ),
  replaceDayEntries: mock(
    (): Promise<ReplaceEntriesResult> => Promise.resolve({ ok: true, value: planWithEntries }),
  ),
  duplicateWeekPlan: mock(
    (): Promise<DuplicateResult> => Promise.resolve({ ok: true, value: planWithEntries }),
  ),
  recordDayEntry: mock(
    (): Promise<RecordResult> => Promise.resolve({ ok: true, value: planWithEntries }),
  ),
  addStaffDayEntry: mock(
    (): Promise<RecordResult> => Promise.resolve({ ok: true, value: planWithEntries }),
  ),
};

// getById scopes STAFF via the assignment guard; the manager path never calls it, but
// stub it so importing the controller resolves.
const assignmentMock = { isStaffAssigned: mock((): Promise<boolean> => Promise.resolve(true)) };

mock.module('../services/week-plan.service', () => serviceMock);
mock.module('../services/staff-assignment.service', () => assignmentMock);

const controller = await import('./week-plan.controller');

// Every read/record request carries an authenticated user; role drives STAFF scoping.
const managerUser = {
  sub: '99999999-9999-4999-8999-999999999999',
  role: 'MANAGER' as const,
  email: 'manager@example.com',
};

const plan: WeekPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  serviceUserId: '22222222-2222-4222-8222-222222222222',
  weekCommencing: '2026-08-10',
  notes: null,
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
};
const planWithEntries: WeekPlanWithEntries = {
  ...plan,
  dayEntries: [],
  compliance: {
    deliveredMinutes: 0,
    contractedMinutes: 0,
    remainingMinutes: 0,
    deliveryPct: 0,
    status: 'ATTENTION',
  },
};

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
  serviceMock.listWeekPlans.mockReset();
  serviceMock.listWeekPlansForStaff.mockReset();
  serviceMock.getWeekPlan.mockReset();
  serviceMock.createWeekPlan.mockReset();
  serviceMock.updateWeekPlan.mockReset();
  serviceMock.replaceDayEntries.mockReset();
  serviceMock.duplicateWeekPlan.mockReset();
  serviceMock.recordDayEntry.mockReset();
  serviceMock.addStaffDayEntry.mockReset();
  assignmentMock.isStaffAssigned.mockReset();
});

describe('list', () => {
  it('passes ?serviceUserId through to the service', async () => {
    serviceMock.listWeekPlans.mockResolvedValueOnce([plan]);
    const res = mockRes();
    await controller.list(
      { query: { serviceUserId: plan.serviceUserId }, user: managerUser } as unknown as Request,
      res,
    );
    expect(serviceMock.listWeekPlans).toHaveBeenCalledWith({ serviceUserId: plan.serviceUserId });
    expect(res.body).toEqual([plan]);
  });

  it('omits the filter when no serviceUserId is given', async () => {
    serviceMock.listWeekPlans.mockResolvedValueOnce([]);
    const res = mockRes();
    await controller.list({ query: {}, user: managerUser } as unknown as Request, res);
    expect(serviceMock.listWeekPlans).toHaveBeenCalledWith({ serviceUserId: undefined });
  });

  it('scopes a STAFF caller to their supervision group', async () => {
    serviceMock.listWeekPlansForStaff.mockResolvedValueOnce([plan]);
    const staffUser = { ...managerUser, role: 'STAFF' as const };
    const res = mockRes();
    await controller.list({ query: {}, user: staffUser } as unknown as Request, res);
    expect(serviceMock.listWeekPlansForStaff).toHaveBeenCalledWith(staffUser.sub, undefined);
    expect(serviceMock.listWeekPlans).not.toHaveBeenCalled();
    expect(res.body).toEqual([plan]);
  });
});

describe('getById', () => {
  it('404s when the plan does not exist', async () => {
    serviceMock.getWeekPlan.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.getById(
      { params: { id: plan.id }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns the plan with entries when found', async () => {
    serviceMock.getWeekPlan.mockResolvedValueOnce(planWithEntries);
    const res = mockRes();
    await controller.getById(
      { params: { id: plan.id }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(planWithEntries);
  });

  it('404s for a STAFF caller when the plan is outside their group', async () => {
    serviceMock.getWeekPlan.mockResolvedValueOnce(planWithEntries);
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.getById(
      { params: { id: plan.id }, user: { ...managerUser, role: 'STAFF' as const } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });
});

describe('recordDayEntry', () => {
  const entryId = '55555555-5555-4555-8555-555555555555';
  const recordReq = {
    params: { id: plan.id, entryId },
    body: { timeSpent: 45, outcome: 'COMPLETED', comment: 'All good' },
    user: managerUser,
  };

  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.recordDayEntry(
      { ...recordReq, body: { timeSpent: -1, outcome: 'NOPE' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.recordDayEntry).not.toHaveBeenCalled();
  });

  it('404s when the entry is unknown', async () => {
    serviceMock.recordDayEntry.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const res = mockRes();
    await controller.recordDayEntry(recordReq as unknown as Request, res);
    expect(res.statusCode).toBe(404);
  });

  it('200s with the refreshed plan and passes the actor to the service', async () => {
    serviceMock.recordDayEntry.mockResolvedValueOnce({ ok: true, value: planWithEntries });
    const res = mockRes();
    await controller.recordDayEntry(recordReq as unknown as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(planWithEntries);
    expect(serviceMock.recordDayEntry).toHaveBeenCalledWith(
      entryId,
      recordReq.body,
      managerUser.sub,
    );
  });
});

describe('addDayEntry', () => {
  const addReq = {
    params: { id: plan.id },
    body: {
      day: 'MON',
      activityTypeId: '44444444-4444-4444-8444-444444444444',
      timeSpent: 30,
      outcome: 'COMPLETED',
      comment: 'Unplanned walk',
    },
    user: managerUser,
  };

  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.addDayEntry(
      { params: { id: plan.id }, body: { day: 'FUNDAY' }, user: managerUser } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.addStaffDayEntry).not.toHaveBeenCalled();
  });

  it('201s with the refreshed plan and passes the actor to the service', async () => {
    serviceMock.addStaffDayEntry.mockResolvedValueOnce({ ok: true, value: planWithEntries });
    const res = mockRes();
    await controller.addDayEntry(addReq as unknown as Request, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(planWithEntries);
    expect(serviceMock.addStaffDayEntry).toHaveBeenCalledWith(
      plan.id,
      addReq.body,
      managerUser.sub,
    );
  });
});

describe('create', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.create({ body: { serviceUserId: 'nope' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.createWeekPlan).not.toHaveBeenCalled();
  });

  it('409s when the week already has a plan', async () => {
    serviceMock.createWeekPlan.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.create(
      {
        body: { serviceUserId: plan.serviceUserId, weekCommencing: '2026-08-10' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('201s with the created plan', async () => {
    serviceMock.createWeekPlan.mockResolvedValueOnce({ ok: true, value: plan });
    const res = mockRes();
    await controller.create(
      {
        body: { serviceUserId: plan.serviceUserId, weekCommencing: '2026-08-10' },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(plan);
  });
});

describe('update', () => {
  it('404s when the id is unknown', async () => {
    serviceMock.updateWeekPlan.mockResolvedValueOnce(null);
    const res = mockRes();
    await controller.update(
      { params: { id: plan.id }, body: { notes: 'hi' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('409s on a week collision', async () => {
    serviceMock.updateWeekPlan.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.update(
      { params: { id: plan.id }, body: { weekCommencing: '2026-08-17' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('200s with the updated plan', async () => {
    serviceMock.updateWeekPlan.mockResolvedValueOnce({ ok: true, value: plan });
    const res = mockRes();
    await controller.update(
      { params: { id: plan.id }, body: { notes: 'updated' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(plan);
  });
});

describe('replaceDayEntries', () => {
  it('400s on an invalid body', async () => {
    const res = mockRes();
    await controller.replaceDayEntries(
      { params: { id: plan.id }, body: { entries: [{ day: 'FUNDAY', lineNumber: 1 }] } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.replaceDayEntries).not.toHaveBeenCalled();
  });

  it('404s when the plan is gone', async () => {
    serviceMock.replaceDayEntries.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const res = mockRes();
    await controller.replaceDayEntries(
      { params: { id: plan.id }, body: { entries: [] } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('409s on a duplicate day/line slot', async () => {
    serviceMock.replaceDayEntries.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.replaceDayEntries(
      { params: { id: plan.id }, body: { entries: [] } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('200s with the refreshed plan', async () => {
    serviceMock.replaceDayEntries.mockResolvedValueOnce({ ok: true, value: planWithEntries });
    const res = mockRes();
    await controller.replaceDayEntries(
      {
        params: { id: plan.id },
        body: { entries: [{ day: 'MON', lineNumber: 1, timeAllocated: 30 }] },
      } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(planWithEntries);
  });
});

describe('duplicate', () => {
  it('400s when the target week is missing/invalid', async () => {
    const res = mockRes();
    await controller.duplicate(
      { params: { id: plan.id }, body: {} } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.duplicateWeekPlan).not.toHaveBeenCalled();
  });

  it('404s when the source plan is unknown', async () => {
    serviceMock.duplicateWeekPlan.mockResolvedValueOnce({ ok: false, reason: 'not_found' });
    const res = mockRes();
    await controller.duplicate(
      { params: { id: plan.id }, body: { weekCommencing: '2026-08-17' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('409s when the target week already has a plan', async () => {
    serviceMock.duplicateWeekPlan.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = mockRes();
    await controller.duplicate(
      { params: { id: plan.id }, body: { weekCommencing: '2026-08-17' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('201s with the duplicated plan', async () => {
    serviceMock.duplicateWeekPlan.mockResolvedValueOnce({ ok: true, value: planWithEntries });
    const res = mockRes();
    await controller.duplicate(
      { params: { id: plan.id }, body: { weekCommencing: '2026-08-17' } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual(planWithEntries);
  });
});
