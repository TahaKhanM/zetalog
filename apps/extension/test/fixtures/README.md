# Zetamac recon notes (2026-07-20)

Fixtures captured live. Key findings for the recorder:

- Settings page `/` form POSTs to `/game`, which 302s to `/game?key=<8 hex>`.
- **The game page embeds full settings** in an inline module script: `init({"add":true,...,"mul_right_max":100})`. `duration` is OMITTED when 120 (the JS does `options.duration || 120`). Sub/div have no ranges (reverses of add/mul). The canonical default key is `a7220a92`.
- Problem text lives in `span.problem` (e.g. `34 + 66`, `91 \u2013 4` en dash, `7 \u00d7 12`, `96 \u00f7 12`). The trailing `=` is a separate DOM text node, NOT part of the problem text.
- Answer input is `input.answer`; on every `input` event Zetamac compares `value.trim() === String(answer)` and on match: advances problem, clears input, increments `Score: N` in `span.correct`. There is no submit key.
- Game start: problems begin immediately on page load (`problemGeng()` at init).
- Game end: timer text `span.left` reaches `Seconds left: 0`; input gets `disabled`; `.banner .start` hidden, `.banner .end` shown (contains final `p.correct` "Score: N").
- Zetamac itself POSTs `{key, problemLog}` to `/log` at game end; `problemLog` entries are `{problem, answer, entry: string[] progressive input values, timeMs}` and entry is nulled on paste (length jump > 1), non-numeric chars, or over-long input.
- Recorder consequence: record input-VALUE SNAPSHOTS (`input` events with full value), not derived keys \u2014 it is exactly what the DOM provides and mirrors Zetamac's own log.
