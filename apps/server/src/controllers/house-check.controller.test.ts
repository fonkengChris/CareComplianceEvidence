import type { CheckSubmission, CheckTemplate } from '@care/shared';
import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { Request, Response } from 'express';
import * as realAssignment from '../services/staff-assignment.service';
import type * as SubmissionService from '../services/check-submission.service';
import type * as TemplateService from '../services/check-template.service';

/**
 * Controller tests stub the services via mock.module — no DB or bound port. They assert the
 * shift gate, input validation and result → status mapping; roles live in route middleware.
 */

const HOME = '33333333-3333-4333-8333-333333333333';
const OTHER_HOME = '44444444-4444-4444-8444-444444444444';
const TEMPLATE = '55555555-5555-4555-8555-555555555555';
const SUBMISSION = '66666666-6666-4666-8666-666666666666';

const template: CheckTemplate = {
  id: TEMPLATE,
  name: 'Sharps Box Check',
  scheduleKind: 'DAILY',
  scheduleDays: [],
  dueByTime: null,
  definition: { sections: [{ id: 's', questions: [{ id: 'k', text: 'Knives', type: 'COUNT' }] }] },
  version: 1,
  active: true,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
};

const managerUser = {
  sub: '99999999-9999-4999-8999-999999999999',
  role: 'MANAGER' as const,
  email: 'manager@example.com',
};
const staffUser = {
  sub: '88888888-8888-4888-8888-888888888888',
  role: 'STAFF' as const,
  email: 'staff@example.com',
};

const submission: CheckSubmission = {
  id: SUBMISSION,
  templateId: TEMPLATE,
  templateName: template.name,
  templateVersion: 1,
  homeId: HOME,
  homeName: 'Riverside',
  dueDate: '2026-11-24',
  definition: template.definition,
  answers: { s: [{ k: { number: 3 } }] },
  issueCount: 0,
  late: false,
  submittedById: staffUser.sub,
  submittedByName: 'Jane',
  submittedAt: '2026-11-24T09:00:00.000Z',
};

const templateMock = {
  toPublicTemplate: mock(() => template),
  listTemplates: mock<typeof TemplateService.listTemplates>(() => Promise.resolve([template])),
  getTemplate: mock<typeof TemplateService.getTemplate>(() => Promise.resolve(template)),
  createTemplate: mock<typeof TemplateService.createTemplate>(() =>
    Promise.resolve({ ok: true, value: template }),
  ),
  updateTemplate: mock<typeof TemplateService.updateTemplate>(() =>
    Promise.resolve({ ok: true, value: template }),
  ),
  setTemplateActive: mock<typeof TemplateService.setTemplateActive>(() =>
    Promise.resolve(template),
  ),
};

const submissionMock = {
  checkPdfStorageKey: mock(() => ''),
  checkPdfFileName: mock(() => 'x.pdf'),
  listDueForHome: mock<typeof SubmissionService.listDueForHome>(() => Promise.resolve([])),
  weekGrid: mock<typeof SubmissionService.weekGrid>(() =>
    Promise.resolve({ homeId: HOME, weekCommencing: '2026-11-23', rows: [] }),
  ),
  overview: mock<typeof SubmissionService.overview>(() =>
    Promise.resolve({ since: '2026-11-17', homes: [] }),
  ),
  submitCheck: mock<typeof SubmissionService.submitCheck>(() =>
    Promise.resolve({ ok: true, value: submission }),
  ),
  getSubmission: mock<typeof SubmissionService.getSubmission>(() => Promise.resolve(submission)),
  getSubmissionPdf: mock<typeof SubmissionService.getSubmissionPdf>(() =>
    Promise.resolve({ data: Buffer.from('%PDF-'), fileName: 'x.pdf' }),
  ),
};

const assignmentMock = {
  ...realAssignment,
  activeShiftHomeIdsForStaff: mock<typeof realAssignment.activeShiftHomeIdsForStaff>(() =>
    Promise.resolve([HOME]),
  ),
};

mock.module('../services/check-template.service', () => templateMock);
mock.module('../services/check-submission.service', () => submissionMock);
mock.module('../services/staff-assignment.service', () => assignmentMock);

const controller = await import('./house-check.controller');

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
    set(headers: Record<string, string>) {
      Object.assign(this.headers, headers);
      return this;
    },
    send(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

const req = (
  user: { sub: string; role: 'MANAGER' | 'STAFF'; email: string },
  extra: Partial<Request> = {},
) => ({ user, params: {}, query: {}, body: {}, ...extra }) as unknown as Request;

const validSubmission = {
  templateId: TEMPLATE,
  homeId: HOME,
  dueDate: '2026-11-24',
  answers: { s: [{ k: { number: 3 } }] },
};

afterEach(() => {
  for (const m of [...Object.values(templateMock), ...Object.values(submissionMock)]) {
    m.mockClear();
  }
  assignmentMock.activeShiftHomeIdsForStaff.mockClear();
});

describe('templates', () => {
  it('lists only active templates for staff, all for managers', async () => {
    await controller.listTemplates(req(staffUser), mockRes());
    expect(templateMock.listTemplates).toHaveBeenLastCalledWith({ activeOnly: true });
    await controller.listTemplates(req(managerUser), mockRes());
    expect(templateMock.listTemplates).toHaveBeenLastCalledWith({ activeOnly: false });
  });

  it('hides a retired template from staff', async () => {
    templateMock.getTemplate.mockImplementationOnce(() =>
      Promise.resolve({ ...template, active: false }),
    );
    const res = mockRes();
    await controller.getTemplate(req(staffUser, { params: { id: TEMPLATE } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('rejects an invalid template with 400 and maps a duplicate name to 409', async () => {
    const bad = mockRes();
    await controller.createTemplate(req(managerUser, { body: { name: '' } }), bad);
    expect(bad.statusCode).toBe(400);

    templateMock.createTemplate.mockImplementationOnce(() =>
      Promise.resolve({ ok: false, reason: 'duplicate_name' }),
    );
    const dup = mockRes();
    const { id: _id, version: _v, active: _a, createdAt: _c, updatedAt: _u, ...input } = template;
    await controller.createTemplate(req(managerUser, { body: input }), dup);
    expect(dup.statusCode).toBe(409);
  });
});

describe('due list', () => {
  it('requires staff to be on shift at the home', async () => {
    const res = mockRes();
    await controller.listDue(req(staffUser, { params: { homeId: OTHER_HOME } }), res);
    expect(res.statusCode).toBe(403);
    expect(submissionMock.listDueForHome).not.toHaveBeenCalled();
  });

  it('serves staff on shift and managers anywhere', async () => {
    const staffRes = mockRes();
    await controller.listDue(req(staffUser, { params: { homeId: HOME } }), staffRes);
    expect(staffRes.statusCode).toBe(200);
    const mgrRes = mockRes();
    await controller.listDue(req(managerUser, { params: { homeId: OTHER_HOME } }), mgrRes);
    expect(mgrRes.statusCode).toBe(200);
    expect(assignmentMock.activeShiftHomeIdsForStaff).toHaveBeenCalledTimes(1);
  });
});

describe('week grid', () => {
  it('validates the week', async () => {
    const res = mockRes();
    await controller.weekGrid(req(managerUser, { params: { homeId: HOME }, query: {} }), res);
    expect(res.statusCode).toBe(400);
  });
});

describe('submit', () => {
  it('blocks staff who are not on shift at the home', async () => {
    const res = mockRes();
    await controller.submit(
      req(staffUser, { body: { ...validSubmission, homeId: OTHER_HOME } }),
      res,
    );
    expect(res.statusCode).toBe(403);
    expect(submissionMock.submitCheck).not.toHaveBeenCalled();
  });

  it('creates a submission signed by the caller', async () => {
    const res = mockRes();
    await controller.submit(req(staffUser, { body: validSubmission }), res);
    expect(res.statusCode).toBe(201);
    expect(submissionMock.submitCheck).toHaveBeenCalledWith(validSubmission, staffUser.sub);
  });

  it('maps service refusals to status codes', async () => {
    const cases = [
      [{ ok: false, reason: 'not_open' }, 400],
      [{ ok: false, reason: 'already_submitted' }, 409],
      [{ ok: false, reason: 'template_not_found' }, 404],
      [{ ok: false, reason: 'invalid', problems: ['"Knives" is required'] }, 400],
    ] as [SubmissionService.SubmitResult, number][];
    for (const [result, status] of cases) {
      submissionMock.submitCheck.mockImplementationOnce(() => Promise.resolve(result));
      const res = mockRes();
      await controller.submit(req(managerUser, { body: validSubmission }), res);
      expect(res.statusCode).toBe(status);
    }
  });
});

describe('submission reads', () => {
  it("hides another staff member's submission", async () => {
    submissionMock.getSubmission.mockImplementationOnce(() =>
      Promise.resolve({ ...submission, submittedById: managerUser.sub }),
    );
    const res = mockRes();
    await controller.getSubmissionPdf(req(staffUser, { params: { id: SUBMISSION } }), res);
    expect(res.statusCode).toBe(404);
  });

  it('serves the PDF as a no-store attachment', async () => {
    const res = mockRes();
    await controller.getSubmissionPdf(req(managerUser, { params: { id: SUBMISSION } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(res.headers['Content-Disposition']).toContain('x.pdf');
  });
});
