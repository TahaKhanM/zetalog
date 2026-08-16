import type { JSX } from 'react';

import type { TrendRange } from '../lib/store.js';

/** One selectable configuration for the graph. */
export interface ConfigOption {
  readonly fingerprint: string;
  readonly label: string;
}

interface TrendControlsProps {
  readonly configs: readonly ConfigOption[];
  readonly selectedFingerprint: string;
  readonly onSelectFingerprint: (fingerprint: string) => void;
  readonly range: TrendRange;
  readonly onSelectRange: (range: TrendRange) => void;
}

const RANGES: readonly TrendRange[] = [10, 25, 50, 'all'];

function rangeLabel(range: TrendRange): string {
  return range === 'all' ? 'All' : `Last ${String(range)}`;
}

/** Config + range selectors, shown in chart mode; choices persist via prefs. */
export function TrendControls(props: TrendControlsProps): JSX.Element {
  const { configs, selectedFingerprint, onSelectFingerprint, range, onSelectRange } = props;
  return (
    <div className="zl-controls">
      <select
        className="zl-select"
        aria-label="Configuration"
        value={selectedFingerprint}
        onChange={(event) => {
          onSelectFingerprint(event.target.value);
        }}
      >
        {configs.map((config) => (
          <option value={config.fingerprint} key={config.fingerprint}>
            {config.label}
          </option>
        ))}
      </select>
      <select
        className="zl-select"
        aria-label="Range"
        value={String(range)}
        onChange={(event) => {
          onSelectRange(
            event.target.value === 'all' ? 'all' : (Number(event.target.value) as TrendRange),
          );
        }}
      >
        {RANGES.map((option) => (
          <option value={String(option)} key={String(option)}>
            {rangeLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}
