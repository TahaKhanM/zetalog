import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { TrendPoint } from '../lib/stats.js';
import { AdaptiveTrend } from './AdaptiveTrend.js';

afterEach(cleanup);

const NOW = 1_700_000_000_000;

function series(count: number): TrendPoint[] {
  return Array.from({ length: count }, (_unused, i) => ({
    score: 20 + i,
    at: NOW - (count - i) * 60_000,
  }));
}

describe('AdaptiveTrend', () => {
  it('renders a recent-scores list in list mode', () => {
    render(<AdaptiveTrend mode="list" series={series(3)} nowMs={NOW} />);
    const rows = screen.getByTestId('trend-list').querySelectorAll('.zl-trend__row');
    expect(rows).toHaveLength(3);
    // Most recent (highest score) first.
    expect(rows[0]?.querySelector('.zl-trend__row-score')?.textContent).toBe('22');
  });

  it('shows an empty message when there is nothing to plot', () => {
    render(<AdaptiveTrend mode="list" series={[]} nowMs={NOW} />);
    expect(screen.getByText(/No games on this configuration/i)).toBeTruthy();
  });

  it('renders a sparkline SVG in sparkline mode', () => {
    render(<AdaptiveTrend mode="sparkline" series={series(8)} nowMs={NOW} />);
    const spark = screen.getByTestId('trend-sparkline');
    const line = spark.querySelector('.zl-spark__line');
    expect(line).not.toBeNull();
    expect(line?.getAttribute('d')?.startsWith('M')).toBe(true);
  });

  it('renders a full chart SVG with a plotted line and axis extremes in chart mode', () => {
    render(<AdaptiveTrend mode="chart" series={series(24)} nowMs={NOW} />);
    const chart = screen.getByTestId('trend-chart');
    expect(chart.querySelector('.zl-chart__line')).not.toBeNull();
    expect(chart.querySelector('.zl-chart__area')).not.toBeNull();
    // Axis extremes: min 20, max 43 for a 24-point series starting at 20.
    expect(chart.textContent).toContain('43');
    expect(chart.textContent).toContain('20');
  });
});
