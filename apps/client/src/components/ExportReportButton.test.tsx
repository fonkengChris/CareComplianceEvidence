import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { setAccessToken } from '../lib/api';
import { mockApi } from '../lib/test-utils';
import ExportReportButton from './ExportReportButton';

/**
 * Tests the button's wiring via the FETCH-FAILURE path only: on a failed report fetch the error
 * surfaces and the PDF renderer is never reached. We deliberately do not exercise the success
 * path here — it would dynamically import @react-pdf/renderer, whose primitives don't run in
 * happy-dom and would poison the suite. The fetch helper's success path is covered in reports.test.
 */

afterEach(() => cleanup());
beforeEach(() => setAccessToken('access'));

describe('ExportReportButton', () => {
  it('renders the default export label', () => {
    render(<ExportReportButton weekPlanId="plan-1" />);
    expect(screen.getByRole('button', { name: 'Export PDF' })).toBeDefined();
  });

  it('shows the server error when the report fetch fails', async () => {
    mockApi(
      async () =>
        new Response(JSON.stringify({ error: 'Week plan not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }),
    );

    render(<ExportReportButton weekPlanId="missing" />);
    fireEvent.click(screen.getByRole('button', { name: 'Export PDF' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Week plan not found');
  });
});
