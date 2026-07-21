import type { Analysis } from '@/lib/analysis';
import { formatSolveMs } from '@/lib/format';

/**
 * The in-depth analysis sections of `/me`: where solve time goes by operation,
 * the times-table ledger, named weak spots, and the toughest individual
 * problems. Server-rendered, zero client JS — every figure is set in Azeret
 * numerals on ruled paper; steel carries the data, maroon marks the weakest
 * (CO-2/CO-3 colour roles).
 */

const OP_NAMES: Record<Analysis['ops'][number]['op'], string> = {
  '+': 'Addition',
  '-': 'Subtraction',
  '*': 'Multiplication',
  '/': 'Division',
};

/** Times-table columns (Zetamac's default small-factor range). */
const FACTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export function AnalysisSections({ analysis }: { analysis: Analysis }): React.JSX.Element {
  return (
    <>
      <section className="me__section" aria-label="Where your time goes">
        <h2 className="me__h2">Where your time goes</h2>
        <div className="card card--pad">
          <OpBreakdown analysis={analysis} />
          <p className="meta analysis-note">
            Median seconds per solved problem, across {analysis.gamesAnalysed} accepted games (
            <span className="num">{analysis.problemsAnalysed}</span> problems).
          </p>
        </div>
      </section>

      {analysis.weakSpots.length > 0 ? (
        <section className="me__section" aria-label="Weak spots">
          <h2 className="me__h2">Weak spots</h2>
          <div className="weakspot-grid">
            {analysis.weakSpots.map((spot) => (
              <div key={spot.key} className="card card--pad weakspot">
                <span className="weakspot__label">{spot.label}</span>
                <span className="weakspot__figures">
                  <span className="num weakspot__median">{formatSolveMs(spot.medianMs)}</span>
                  <span className="meta">
                    median · <span className="num">{spot.ratio.toFixed(1)}×</span> your fastest area
                    · <span className="num">{spot.solved}</span> solves
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="me__section" aria-label="Times tables">
        <h2 className="me__h2">Times tables</h2>
        <div className="card table-wrap">
          <TimesTableGrid analysis={analysis} />
        </div>
        <p className="meta analysis-note">
          Median solve time by table: × grouped by the small factor, ÷ by the divisor. Darker means
          slower.
        </p>
      </section>

      {analysis.toughest.length > 0 ? (
        <section className="me__section" aria-label="Toughest problems">
          <h2 className="me__h2">Toughest problems</h2>
          <div className="card table-wrap">
            <table className="ltable">
              <thead>
                <tr>
                  <th scope="col">Problem</th>
                  <th className="ltable__score-h" scope="col">
                    Time
                  </th>
                  <th scope="col">Corrections</th>
                </tr>
              </thead>
              <tbody>
                {analysis.toughest.map((tough, index) => (
                  <tr key={`${tough.text}-${String(index)}`}>
                    <td className="num tough__text">{tough.text}</td>
                    <td className="ltable__num tough__time">{formatSolveMs(tough.solveMs)}</td>
                    <td className="meta">
                      {tough.corrections > 0 ? (
                        <>
                          <span className="num">{tough.corrections}</span> backspace
                          {tough.corrections === 1 ? '' : 's'}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function OpBreakdown({ analysis }: { analysis: Analysis }): React.JSX.Element {
  const maxMedian = analysis.ops.reduce((max, op) => Math.max(max, op.medianMs), 0);
  const slowest = analysis.ops.reduce(
    (worst, op) => (op.medianMs > worst ? op.medianMs : worst),
    0,
  );
  return (
    <ul className="opbars">
      {analysis.ops.map((op) => {
        const width = maxMedian > 0 ? Math.max(4, (op.medianMs / maxMedian) * 100) : 0;
        const isSlowest = op.medianMs === slowest && analysis.ops.length > 1;
        return (
          <li key={op.op} className="opbars__row">
            <span className="num opbars__symbol" aria-hidden="true">
              {op.symbol}
            </span>
            <span className="opbars__name">
              {OP_NAMES[op.op]}
              <span className="meta opbars__count">
                <span className="num">{op.solved}</span> solved
              </span>
            </span>
            <span className="opbars__track">
              <span
                className={`opbars__fill${isSlowest ? ' opbars__fill--slowest' : ''}`}
                style={{ width: `${String(width)}%` }}
              />
            </span>
            <span className={`num opbars__median${isSlowest ? ' text-maroon' : ''}`}>
              {formatSolveMs(op.medianMs)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function TimesTableGrid({ analysis }: { analysis: Analysis }): React.JSX.Element {
  const byKey = new Map(
    analysis.facts.map((fact) => [`${fact.op}:${String(fact.factor)}`, fact] as const),
  );
  const maxMedian = analysis.facts.reduce((max, fact) => Math.max(max, fact.medianMs), 0);
  return (
    <table className="ltable facts">
      <thead>
        <tr>
          <th scope="col" aria-label="Operation" />
          {FACTORS.map((factor) => (
            <th key={factor} className="num facts__head" scope="col">
              {factor}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(['*', '/'] as const).map((op) => (
          <tr key={op}>
            <th scope="row" className="num facts__op">
              {op === '*' ? '×' : '÷'}
            </th>
            {FACTORS.map((factor) => {
              const fact = byKey.get(`${op}:${String(factor)}`);
              if (fact === undefined) {
                return (
                  <td key={factor} className="num facts__cell facts__cell--empty">
                    –
                  </td>
                );
              }
              const heat = maxMedian > 0 ? fact.medianMs / maxMedian : 0;
              const isSlowest = fact.medianMs === maxMedian && analysis.facts.length > 1;
              return (
                <td
                  key={factor}
                  className={`num facts__cell${isSlowest ? ' facts__cell--slowest' : ''}`}
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--color-zl-steel) ${String(
                      Math.round(4 + heat * 20),
                    )}%, transparent)`,
                  }}
                  title={`${op === '*' ? '×' : '÷'}${String(factor)}: ${formatSolveMs(fact.medianMs)} median over ${String(fact.solved)} solves`}
                >
                  {(fact.medianMs / 1000).toFixed(1)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
