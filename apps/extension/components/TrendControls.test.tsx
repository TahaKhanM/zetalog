import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TrendControls } from './TrendControls.js';

afterEach(cleanup);

const configs = [
  { fingerprint: 'fp-a', label: 'Default · 120s' },
  { fingerprint: 'fp-b', label: 'Custom · 60s' },
];

describe('TrendControls', () => {
  it('reports the chosen configuration', () => {
    const onSelectFingerprint = vi.fn();
    render(
      <TrendControls
        configs={configs}
        selectedFingerprint="fp-a"
        onSelectFingerprint={onSelectFingerprint}
        range="all"
        onSelectRange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Configuration'), { target: { value: 'fp-b' } });
    expect(onSelectFingerprint).toHaveBeenCalledWith('fp-b');
  });

  it('reports a numeric range as a number and "all" as the string', () => {
    const onSelectRange = vi.fn();
    render(
      <TrendControls
        configs={configs}
        selectedFingerprint="fp-a"
        onSelectFingerprint={vi.fn()}
        range="all"
        onSelectRange={onSelectRange}
      />,
    );
    const rangeSelect = screen.getByLabelText('Range');
    fireEvent.change(rangeSelect, { target: { value: '25' } });
    expect(onSelectRange).toHaveBeenCalledWith(25);
    fireEvent.change(rangeSelect, { target: { value: 'all' } });
    expect(onSelectRange).toHaveBeenCalledWith('all');
  });
});
