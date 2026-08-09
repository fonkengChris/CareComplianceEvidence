import type { ComplianceStatus } from '@care/shared';
import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import ComplianceBadge from './ComplianceBadge';

/**
 * The badge is pure display: a status code → label + colour map. These pin the label text
 * and that both red states (OVER_HOURS, ATTENTION) share the red styling while staying
 * distinct labels, so a manager can see WHY it's red.
 */

afterEach(() => cleanup());

const cases: [ComplianceStatus, string, string][] = [
  ['ON_TRACK', 'On Track', 'text-green-800'],
  ['UNDER_TARGET', 'Under Target', 'text-amber-800'],
  ['OVER_HOURS', 'Over Hours', 'text-red-800'],
  ['ATTENTION', 'Attention Required', 'text-red-800'],
];

describe('ComplianceBadge', () => {
  for (const [status, label, colour] of cases) {
    it(`renders ${status} as "${label}" with ${colour}`, () => {
      render(<ComplianceBadge status={status} />);
      const badge = screen.getByLabelText(`Compliance status: ${label}`);
      expect(badge.textContent).toContain(label);
      expect(badge.className).toContain(colour);
    });
  }
});
