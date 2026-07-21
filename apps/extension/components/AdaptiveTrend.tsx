import type { JSX } from 'react';

import { relativeTime } from '../lib/format.js';
import type { GraphMode, TrendPoint } from '../lib/stats.js';

interface AdaptiveTrendProps {
  /** Rendering mode from `graphMode(count)` (spec §3.3). */
  readonly mode: GraphMode;
  /** Kept scores for the selected config, ascending in time. */
  readonly series: readonly TrendPoint[];
  /** Wall-clock reference for relative times in list mode. */
  readonly nowMs: number;
}

const SPARK_WIDTH = 324;
const SPARK_HEIGHT = 44;
const CHART_WIDTH = 324;
const CHART_HEIGHT = 120;

interface Plot {
  readonly line: string;
  readonly area: string;
  readonly dots: readonly { readonly x: number; readonly y: number }[];
  readonly min: number;
  readonly max: number;
}

/** Map a score series into SVG geometry within a padded box (steel-blue line + area). */
function plot(series: readonly TrendPoint[], width: number, height: number, pad: number): Plot {
  const scores = series.map((point) => point.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min || 1;
  const count = series.length;
  const xAt = (i: number): number =>
    count === 1 ? width / 2 : (i / (count - 1)) * (width - pad * 2) + pad;
  const yAt = (score: number): number => height - pad - ((score - min) / span) * (height - pad * 2);

  const dots = series.map((point, i) => ({ x: xAt(i), y: yAt(point.score) }));
  const line = dots
    .map((dot, i) => `${i === 0 ? 'M' : 'L'}${dot.x.toFixed(1)} ${dot.y.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${xAt(count - 1).toFixed(1)} ${String(height)} L${xAt(0).toFixed(1)} ${String(height)} Z`;
  return { line, area, dots, min, max };
}

/**
 * The adaptive trend graph (spec §3.3): a recent-scores list under 5 games, a
 * sparkline at 5–19, and a full line chart at 20+. Steel-blue strokes, mono
 * axis numerals, no gridline clutter.
 */
export function AdaptiveTrend(props: AdaptiveTrendProps): JSX.Element {
  const { mode, series, nowMs } = props;

  if (mode === 'list') {
    if (series.length === 0) {
      return <p className="zl-trend__empty">No games on this configuration yet.</p>;
    }
    const recentFirst = [...series].reverse();
    return (
      <div className="zl-trend__list" data-testid="trend-list">
        {recentFirst.map((point, i) => (
          <div className="zl-trend__row" key={`${String(point.at)}-${String(i)}`}>
            <span className="zl-num zl-trend__row-score">{point.score}</span>
            <span className="zl-num zl-trend__row-time">{relativeTime(point.at, nowMs)}</span>
          </div>
        ))}
      </div>
    );
  }

  if (mode === 'sparkline') {
    const geo = plot(series, SPARK_WIDTH, SPARK_HEIGHT, 4);
    return (
      <div data-testid="trend-sparkline">
        <svg
          className="zl-spark"
          viewBox={`0 0 ${String(SPARK_WIDTH)} ${String(SPARK_HEIGHT)}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Score sparkline"
        >
          <path className="zl-spark__line" d={geo.line} />
        </svg>
        <div className="zl-spark__caps">
          <span className="zl-num">min {geo.min}</span>
          <span className="zl-num">max {geo.max}</span>
        </div>
      </div>
    );
  }

  const geo = plot(series, CHART_WIDTH, CHART_HEIGHT, 10);
  const last = geo.dots.at(-1);
  return (
    <svg
      className="zl-chart"
      viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`}
      role="img"
      aria-label="Score chart"
      data-testid="trend-chart"
    >
      <path className="zl-chart__area" d={geo.area} />
      <path className="zl-chart__line" d={geo.line} />
      {last === undefined ? null : (
        <circle className="zl-chart__dot" cx={last.x} cy={last.y} r={2.5} />
      )}
      <text className="zl-chart__axis" x={2} y={12}>
        {geo.max}
      </text>
      <text className="zl-chart__axis" x={2} y={CHART_HEIGHT - 4}>
        {geo.min}
      </text>
    </svg>
  );
}
