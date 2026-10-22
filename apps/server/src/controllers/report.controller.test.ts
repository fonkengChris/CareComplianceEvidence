import type { PeriodSummary } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realAccess from '../services/auditor-access.service';
import * as realReport from '../services/report.service';
import * as realAssignment from '../services/staff-assignment.service';
import * as realWeekPlan from '../services/week-plan.service';

/**
 * Report controller tests: an AUDITOR only sees reports for service users a manager approved
 * them to audit (others read as 404, and the period overview is scoped to the approved ids);
 * a KEY_WORKER only sees their own caseload (same 404/scoping); a MANAGER is never scoped. DB-touching service functions are stubbed via mock.module, keeping
 * the real pure helpers (mondayOf, weekCountBetween, …) so other test files are unaffected.
 */

const accessMock = {
  ...realAccess,
  approvedServiceUserIds: mock<typeof realAccess.approvedServiceUserIds>(() => Promise.resolve([])),
  isAuditorApproved: mock<typeof realAccess.isAuditorApproved>(() => Promise.resolve(false)),
};
const reportMock = {
  ...realReport,
  getPeriodSummary: mock<typeof realReport.getPeriodSummary>((from, to): Promise<PeriodSummary> =>
    Promise.resolve({ from, to, weekCount: 1, settings: SETTINGS, rows: [] }),
  ),
  getServiceUserPeriodReport: mock<typeof realReport.getServiceUserPeriodReport>(() =>
    Promise.resolve(null),
  ),
  getWeekPlanReport: mock<typeof realReport.getWeekPlanReport>(() => Promise.resolve(null)),
};
const assignmentMock = {
  ...realAssignment,
  isStaffAssigned: mock<typeof realAssignment.isStaffAssigned>(() => Promise.resolve(false)),
  listAssignmentsForStaff: mock<typeof realAssignment.listAssignmentsForStaff>(() =>
    Promise.resolve([]),
  ),
};
const weekPlanMock = {
  ...realWeekPlan,
  serviceUserIdForPlan: mock<typeof realWeekPlan.serviceUserIdForPlan>(() => Promise.resolve(SU)),
};

mock.module('../services/auditor-access.service', () => accessMock);
mock.module('../services/report.service', () => reportMock);
mock.module('../services/week-plan.service', () => weekPlanMock);
mock.module('../services/staff-assignment.service', () => assignmentMock);

const controller = await import('./report.controller');

const SETTINGS = { greenMin: 90, amberMin: 75, redOverPct: 110 } as PeriodSummary['settings'];
const AUDITOR = '11111111-1111-4111-8111-111111111111';
const SU = '22222222-2222-4222-8222-222222222222';
const PLAN = '44444444-4444-4444-8444-444444444444';

function mockReq(
  role: 'AUDITOR' | 'KEY_WORKER' | 'MANAGER',
  params: Record<string, string> = {},
): Request {
  return {
    user: { sub: AUDITOR, role, email: 'x@example.com' },
    params,
    query: { from: '2026-10-12', to: '2026-10-12' },
  } as unknown as Request;
}

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
  accessMock.approvedServiceUserIds.mockReset();
  accessMock.isAuditorApproved.mockReset();
  assignmentMock.isStaffAssigned.mockReset();
  assignmentMock.listAssignmentsForStaff.mockReset();
  reportMock.getPeriodSummary.mockClear();
  reportMock.getServiceUserPeriodReport.mockClear();
  reportMock.getWeekPlanReport.mockClear();
});

describe('getPeriodSummary', () => {
  it("scopes an auditor's overview to their approved service users", async () => {
    accessMock.approvedServiceUserIds.mockResolvedValueOnce([SU]);
    await controller.getPeriodSummary(mockReq('AUDITOR'), mockRes());
    expect(accessMock.approvedServiceUserIds).toHaveBeenCalledWith(AUDITOR);
    expect(reportMock.getPeriodSummary).toHaveBeenCalledWith('2026-10-12', '2026-10-12', [SU]);
  });

  it("scopes a key worker's overview to their assigned service users", async () => {
    assignmentMock.listAssignmentsForStaff.mockResolvedValueOnce([
      { id: SU } as Awaited<ReturnType<typeof realAssignment.listAssignmentsForStaff>>[number],
    ]);
    await controller.getPeriodSummary(mockReq('KEY_WORKER'), mockRes());
    expect(assignmentMock.listAssignmentsForStaff).toHaveBeenCalledWith(AUDITOR);
    expect(accessMock.approvedServiceUserIds).not.toHaveBeenCalled();
    expect(reportMock.getPeriodSummary).toHaveBeenCalledWith('2026-10-12', '2026-10-12', [SU]);
  });

  it('does not scope a manager', async () => {
    await controller.getPeriodSummary(mockReq('MANAGER'), mockRes());
    expect(accessMock.approvedServiceUserIds).not.toHaveBeenCalled();
    expect(reportMock.getPeriodSummary).toHaveBeenCalledWith('2026-10-12', '2026-10-12', undefined);
  });
});

describe('getServiceUserPeriodReport', () => {
  it('404s an auditor without an approved grant, before loading the report', async () => {
    accessMock.isAuditorApproved.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.getServiceUserPeriodReport(mockReq('AUDITOR', { id: SU }), res);
    expect(res.statusCode).toBe(404);
    expect(reportMock.getServiceUserPeriodReport).not.toHaveBeenCalled();
  });

  it('loads the report for an approved auditor', async () => {
    accessMock.isAuditorApproved.mockResolvedValueOnce(true);
    await controller.getServiceUserPeriodReport(mockReq('AUDITOR', { id: SU }), mockRes());
    expect(accessMock.isAuditorApproved).toHaveBeenCalledWith(AUDITOR, SU);
    expect(reportMock.getServiceUserPeriodReport).toHaveBeenCalled();
  });
});

describe('getServiceUserPeriodReport (key worker)', () => {
  it('404s a key worker for a service user outside their caseload', async () => {
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.getServiceUserPeriodReport(mockReq('KEY_WORKER', { id: SU }), res);
    expect(res.statusCode).toBe(404);
    expect(reportMock.getServiceUserPeriodReport).not.toHaveBeenCalled();
  });

  it('loads the report for a service user in their caseload', async () => {
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(true);
    await controller.getServiceUserPeriodReport(mockReq('KEY_WORKER', { id: SU }), mockRes());
    expect(assignmentMock.isStaffAssigned).toHaveBeenCalledWith(AUDITOR, SU);
    expect(reportMock.getServiceUserPeriodReport).toHaveBeenCalled();
  });
});

describe('getWeekPlanReport', () => {
  it('404s a key worker for a plan outside their caseload', async () => {
    assignmentMock.isStaffAssigned.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.getWeekPlanReport(mockReq('KEY_WORKER', { id: PLAN }), res);
    expect(res.statusCode).toBe(404);
    expect(reportMock.getWeekPlanReport).not.toHaveBeenCalled();
  });

  it("404s an auditor for a plan of a service user they aren't approved for", async () => {
    accessMock.isAuditorApproved.mockResolvedValueOnce(false);
    const res = mockRes();
    await controller.getWeekPlanReport(mockReq('AUDITOR', { id: PLAN }), res);
    expect(res.statusCode).toBe(404);
    expect(reportMock.getWeekPlanReport).not.toHaveBeenCalled();
  });

  it('skips the grant check for a manager', async () => {
    await controller.getWeekPlanReport(mockReq('MANAGER', { id: PLAN }), mockRes());
    expect(accessMock.isAuditorApproved).not.toHaveBeenCalled();
    expect(reportMock.getWeekPlanReport).toHaveBeenCalledWith(PLAN);
  });
});
