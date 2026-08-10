import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';
import ComplianceRing from './ComplianceRing';

/**
 * Ring rendering is a pure display of the backend-provided delivery percentage/status.
 * These tests pin the accessible label, the centre value, and that the arc's `data-tone`
 * follows the status (green/amber/red stay reserved for compliance; overview rings are
 * neutral). We assert on data-tone rather than the conic-gradient, which happy-dom drops.
 */

afterEach(() => cleanup());

function tone(container: HTMLElement): string | null {
  return container.querySelector('[aria-hidden]')?.getAttribute('data-tone') ?? null;
}

describe('ComplianceRing', () => {
  it('exposes the delivery percentage as an accessible label and centre value', () => {
    render(<ComplianceRing status="ON_TRACK" deliveryPct={83} />);
    expect(screen.getByRole('img', { name: 'Delivery 83%' })).toBeDefined();
    expect(screen.getByText('83')).toBeDefined();
  });

  it('tags the arc tone with the backend status', () => {
    const onTrack = render(<ComplianceRing status="ON_TRACK" deliveryPct={50} />);
    expect(tone(onTrack.container)).toBe('ON_TRACK');
    cleanup();
    const over = render(<ComplianceRing status="OVER_HOURS" deliveryPct={130} />);
    expect(tone(over.container)).toBe('OVER_HOURS');
  });

  it('falls back to a neutral tone when no status is given (overview ring)', () => {
    const { container } = render(<ComplianceRing deliveryPct={90} />);
    expect(tone(container)).toBe('neutral');
  });
});
