import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { Request, Response } from 'express';
import { AiNotConfiguredError } from '../services/ai.service';

/**
 * Controller tests stub the AI service via mock.module — no model call. They assert
 * validation 400s (empty comment), status mapping (503 unconfigured, 502 upstream failure)
 * and the success shape. Role enforcement lives in route middleware, not here.
 */

const serviceMock = {
  AiNotConfiguredError,
  isAiConfigured: mock(() => true),
  polishActivityComment: mock((): Promise<string> => Promise.resolve('Polished note.')),
  transcribeActivityAudio: mock((): Promise<string> => Promise.resolve('Transcribed note.')),
};

mock.module('../services/ai.service', () => serviceMock);

const controller = await import('./ai.controller');

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
  serviceMock.polishActivityComment.mockReset();
  serviceMock.transcribeActivityAudio.mockReset();
});

describe('polish', () => {
  it('400s on an empty comment before calling the service', async () => {
    const res = mockRes();
    await controller.polish({ body: { comment: '   ' } } as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.polishActivityComment).not.toHaveBeenCalled();
  });

  it('returns the polished comment on success', async () => {
    serviceMock.polishActivityComment.mockResolvedValueOnce('Polished note.');
    const res = mockRes();
    await controller.polish({ body: { comment: 'clnt declnd' } } as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ comment: 'Polished note.' });
  });

  it('503s when the feature is not configured', async () => {
    serviceMock.polishActivityComment.mockRejectedValueOnce(new AiNotConfiguredError());
    const res = mockRes();
    await controller.polish({ body: { comment: 'clnt declnd' } } as Request, res);
    expect(res.statusCode).toBe(503);
  });

  it('502s when the model call fails', async () => {
    serviceMock.polishActivityComment.mockRejectedValueOnce(new Error('network'));
    // The controller logs upstream failures; silence that expected noise for a clean run.
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await controller.polish({ body: { comment: 'clnt declnd' } } as Request, res);
    expect(res.statusCode).toBe(502);
    errorSpy.mockRestore();
  });
});

describe('transcribe', () => {
  it('400s when no audio is supplied before calling the service', async () => {
    const res = mockRes();
    await controller.transcribe({ body: undefined } as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.transcribeActivityAudio).not.toHaveBeenCalled();
  });

  it('400s on an empty audio buffer', async () => {
    const res = mockRes();
    await controller.transcribe({ body: Buffer.alloc(0) } as Request, res);
    expect(res.statusCode).toBe(400);
    expect(serviceMock.transcribeActivityAudio).not.toHaveBeenCalled();
  });

  it('returns the transcribed text on success', async () => {
    serviceMock.transcribeActivityAudio.mockResolvedValueOnce('Transcribed note.');
    const res = mockRes();
    await controller.transcribe({ body: Buffer.from([1, 2, 3]) } as Request, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: 'Transcribed note.' });
  });

  it('503s when the feature is not configured', async () => {
    serviceMock.transcribeActivityAudio.mockRejectedValueOnce(new AiNotConfiguredError());
    const res = mockRes();
    await controller.transcribe({ body: Buffer.from([1, 2, 3]) } as Request, res);
    expect(res.statusCode).toBe(503);
  });

  it('502s when the model call fails', async () => {
    serviceMock.transcribeActivityAudio.mockRejectedValueOnce(new Error('network'));
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await controller.transcribe({ body: Buffer.from([1, 2, 3]) } as Request, res);
    expect(res.statusCode).toBe(502);
    errorSpy.mockRestore();
  });
});
