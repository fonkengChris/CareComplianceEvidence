import { mock } from 'bun:test';
import { AxiosError, type AxiosResponse } from 'axios';
import { api } from './api';

/**
 * Install a mock adapter on the shared axios instance for tests. The handler keeps the
 * same shape the suite used when it mocked `globalThis.fetch`: it receives the request
 * URL + a fetch-style init ({ method, body }) and returns a `Response`. This lets the
 * real interceptors (bearer token, single-flight 401 refresh/retry, error normalisation)
 * run against controlled responses without touching the network.
 */

type FetchInit = { method: string; body?: string };
type Handler = (url: string, init: FetchInit) => Response | Promise<Response>;

export function mockApi(handler: Handler): void {
  api.defaults.adapter = mock(async (config) => {
    const url = String(config.url ?? '');
    const method = String(config.method ?? 'get').toUpperCase();
    // transformRequest has already serialised object bodies to a JSON string by now.
    const body =
      config.data == null
        ? undefined
        : typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data);

    const res = await handler(url, { method, body });
    const data =
      res.status === 204 || res.body === null ? null : await res.clone().json().catch(() => null);

    const response: AxiosResponse = {
      data,
      status: res.status,
      statusText: res.statusText,
      headers: {},
      config,
      request: {},
    };

    // Replicate axios's `settle`: a custom adapter must honour validateStatus itself,
    // otherwise non-2xx responses would resolve instead of rejecting.
    const validateStatus = config.validateStatus;
    if (!validateStatus || validateStatus(res.status)) return response;
    throw new AxiosError(
      `Request failed with status code ${res.status}`,
      [AxiosError.ERR_BAD_REQUEST, AxiosError.ERR_BAD_RESPONSE][Math.floor(res.status / 100) - 4],
      config,
      response.request,
      response,
    );
  });
}
