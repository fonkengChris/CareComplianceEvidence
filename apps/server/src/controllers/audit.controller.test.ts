import type { AuditLogView } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';

/**
 * Controller tests stub the service layer via mock.module — no DB or bound port. They assert
 * the read-only branching: the recent feed by default, one entity's history when the query
 * carries a valid entityType+entityId, and a 400 for an invalid/partial filter. Role
 * enforcement (MANAGER/AUDITOR) lives in route middleware, not here.
 */

const serviceMock = {
  listRecentAudit: mock((): Promise<AuditLogView[]> => Promise.resolve([])),
  listAuditForEntity: mock((): Promise<AuditLogView[]> => Promise.resolve([])),
};

mock.module('../services/audit.service', () => serviceMock);

const controller = await import('./audit.controller');

const sample: AuditLogView = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '99999999-9999-4999-8999-999999999999',
  action: 'RECORD',
  entityType: 'DAY_ENTRY',
  entityId: '55555555-5555-4555-8555-555555555555',
  field: 'timeSpent',
  fromValue: '30',
  toValue: '45',
  createdAt: '2026-08-09T00:00:00.000Z',
  actorName: 'Manny Manager',
  entityLabel: 'Ada Lovelace — MON',
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
  serviceMock.listRecentAudit.mockReset();
  serviceMock.listAuditForEntity.mockReset();
});

describe('list', () => {
  it('returns the recent feed when no filter is given', async () => {
    serviceMock.listRecentAudit.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list({ query: {} } as unknown as Request, res);
    expect(serviceMock.listRecentAudit).toHaveBeenCalledTimes(1);
    expect(serviceMock.listAuditForEntity).not.toHaveBeenCalled();
    expect(res.body).toEqual([sample]);
  });

  it('returns one entity history for a valid entityType+entityId filter', async () => {
    serviceMock.listAuditForEntity.mockResolvedValueOnce([sample]);
    const res = mockRes();
    await controller.list(
      { query: { entityType: 'DAY_ENTRY', entityId: sample.entityId } } as unknown as Request,
      res,
    );
    expect(serviceMock.listAuditForEntity).toHaveBeenCalledWith('DAY_ENTRY', sample.entityId);
    expect(serviceMock.listRecentAudit).not.toHaveBeenCalled();
    expect(res.body).toEqual([sample]);
  });

  it('400s on an unknown entityType', async () => {
    const res = mockRes();
    await controller.list(
      { query: { entityType: 'NONSENSE', entityId: sample.entityId } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(serviceMock.listAuditForEntity).not.toHaveBeenCalled();
  });

  it('400s when entityType is given without entityId', async () => {
    const res = mockRes();
    await controller.list({ query: { entityType: 'DAY_ENTRY' } } as unknown as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.listAuditForEntity).not.toHaveBeenCalled();
  });
});
