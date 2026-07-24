'use client';

import { useMemo, useRef, useState } from 'react';

import { configLabel, formatRelativeTime } from '@/lib/format';
import type { MeGame } from '@/lib/me';

/**
 * Adaptive score-over-time chart: a recent-scores list under 5
 * games on a config, a sparkline for 5–19, and a full line chart with a range
 * selector at 20+. Single steel-blue series — stroke only, Azeret Mono axes, PB point in maroon, crosshair + tooltip on hover.
 */

interface Point {
  readonly score: number;
  readonly playedAt: string;
}

const RANGE_OPTIONS = [20, 50, Infinity] as const;

export function ProgressChart({ games }: { games: readonly MeGame[] }): React.JSX.Element {
  const accepted = useMemo(
    () =>
      games
        .filter((game) => game.status === 'accepted')
        .slice()
        .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt)),
    [games],
  );

  const configs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const game of accepted)
      counts.set(game.fingerprint, (counts.get(game.fingerprint) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([fingerprint]) => fingerprint);
  }, [accepted]);

  const [selected, setSelected] = useState<string | null>(configs[0] ?? null);
  const [range, setRange] = useState<number>(Infinity);
  const activeConfig = selected ?? configs[0] ?? null;

  const series: Point[] = useMemo(() => {
    if (activeConfig === null) return [];
    const all = accepted
      .filter((game) => game.fingerprint === activeConfig)
      .map((game) => ({ score: game.score, playedAt: game.playedAt }));
    return Number.isFinite(range) ? all.slice(-range) : all;
  }, [accepted, activeConfig, range]);

  if (activeConfig === null) {
    return (
      <p className="meta" style={{ marginTop: '0.75rem' }}>
        No accepted games yet — play a ranked game to start your trend.
      </p>
    );
  }

  const fullCount = accepted.filter((game) => game.fingerprint === activeConfig).length;

  return (
    <div>
      <div className="chart-toolbar">
        {configs.length > 1 ? (
          <label className="uni-filter">
            <span className="uni-filter__label">Config</span>
            <select
              className="field field--select"
              value={activeConfig}
              onChange={(event) => {
                setSelected(event.target.value);
              }}
            >
              {configs.map((fingerprint) => (
                <option key={fingerprint} value={fingerprint}>
                  {configLabel(fingerprint)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="chip chip--badge">{configLabel(activeConfig)}</span>
        )}

        {fullCount >= 20 ? (
          <div className="tabs" role="group" aria-label="Range">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={String(option)}
                type="button"
                className="tab"
                aria-selected={range === option}
                onClick={() => {
                  setRange(option);
                }}
              >
                {Number.isFinite(option) ? `Last ${String(option)}` : 'All'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {fullCount < 5 ? (
        <RecentList series={series} />
      ) : fullCount < 20 ? (
        <Sparkline series={series} />
      ) : (
        <LineChart series={series} />
      )}
    </div>
  );
}

function RecentList({ series }: { series: readonly Point[] }): React.JSX.Element {
  const now = Date.now();
  return (
    <ul className="recent-list">
      {[...series].reverse().map((point, index) => (
        <li key={`${point.playedAt}-${String(index)}`} className="recent-list__row">
          <span className="num recent-list__score">{point.score}</span>
          <span className="meta">{formatRelativeTime(point.playedAt, now)}</span>
        </li>
      ))}
    </ul>
  );
}

function niceMax(values: readonly number[]): number {
  const max = values.reduce((acc, value) => Math.max(acc, value), 0);
  return Math.max(10, Math.ceil(max / 10) * 10);
}

function Sparkline({ series }: { series: readonly Point[] }): React.JSX.Element {
  const width = 260;
  const height = 44;
  const max = niceMax(series.map((point) => point.score));
  const step = series.length > 1 ? width / (series.length - 1) : 0;
  const path = series
    .map((point, index) => {
      const x = series.length > 1 ? index * step : width / 2;
      const y = height - 4 - (point.score / max) * (height - 8);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const last = series.at(-1);
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      role="img"
      aria-label="Recent score trend"
      preserveAspectRatio="none"
    >
      <path d={path} className="chart-line" fill="none" />
      {last !== undefined ? (
        <circle
          cx={width}
          cy={height - 4 - (last.score / max) * (height - 8)}
          r={3}
          className="chart-dot-pb"
        />
      ) : null}
    </svg>
  );
}

function LineChart({ series }: { series: readonly Point[] }): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const width = 640;
  const height = 260;
  const pad = { top: 16, right: 16, bottom: 28, left: 34 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = niceMax(series.map((point) => point.score));
  const n = series.length;
  const xFor = (index: number): number =>
    n > 1 ? pad.left + (index / (n - 1)) * plotW : pad.left + plotW / 2;
  const yFor = (score: number): number => pad.top + plotH * (1 - score / max);

  const linePath = series
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${xFor(index).toFixed(1)},${yFor(point.score).toFixed(1)}`,
    )
    .join(' ');
  const ticks = [0, max / 2, max];
  const pbIndex = series.reduce(
    (best, point, index) => (point.score > (series[best]?.score ?? 0) ? index : best),
    0,
  );

  const now = Date.now();
  const hovered = hover !== null ? series[hover] : undefined;

  function onMove(event: React.PointerEvent<SVGSVGElement>): void {
    const svg = svgRef.current;
    if (svg === null || n === 0) return;
    const rect = svg.getBoundingClientRect();
    const ratio = width / rect.width;
    const svgX = (event.clientX - rect.left) * ratio;
    const index = Math.round(((svgX - pad.left) / plotW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, index)));
  }

  return (
    <figure className="chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        className="chart-svg"
        role="img"
        aria-label="Score over time"
        onPointerMove={onMove}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              className="chart-grid"
            />
            <text x={pad.left - 8} y={yFor(tick) + 3} className="chart-axis num" textAnchor="end">
              {tick}
            </text>
          </g>
        ))}

        <path d={linePath} className="chart-line" fill="none" />

        {series.map((point, index) => (
          <circle
            key={`${point.playedAt}-${String(index)}`}
            cx={xFor(index)}
            cy={yFor(point.score)}
            r={index === pbIndex ? 3.5 : 2.5}
            className={index === pbIndex ? 'chart-dot-pb' : 'chart-dot'}
          />
        ))}

        {hovered !== undefined && hover !== null ? (
          <line
            x1={xFor(hover)}
            x2={xFor(hover)}
            y1={pad.top}
            y2={height - pad.bottom}
            className="chart-crosshair"
          />
        ) : null}

        <text x={pad.left} y={height - 8} className="chart-axis num" textAnchor="start">
          {series[0] !== undefined ? formatRelativeTime(series[0].playedAt, now) : ''}
        </text>
        <text x={width - pad.right} y={height - 8} className="chart-axis num" textAnchor="end">
          now
        </text>
      </svg>

      {hovered !== undefined ? (
        <figcaption className="chart-tip">
          <span className="num chart-tip__score">{hovered.score}</span>
          <span className="meta">{formatRelativeTime(hovered.playedAt, now)}</span>
        </figcaption>
      ) : (
        <figcaption className="meta chart-tip chart-tip--idle">
          Hover the line for a game&apos;s score and date.
        </figcaption>
      )}
    </figure>
  );
}
