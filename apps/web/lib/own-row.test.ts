// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { applyOwnRowHighlight } from './own-row';

/**
 * The public boards are cached HTML with no viewer identity baked in. This pure
 * DOM helper is what the client `ViewerRowHighlight` runs after hydration to
 * personalise the cached table for the signed-in viewer: it highlights their
 * row and reports where the "add badge" affordance should mount (the component
 * portals a next/link `Link` there, so navigation stays client-side).
 */

function board(rows: { uid: string; badge?: boolean; monogram?: boolean }[]): HTMLElement {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const { uid, badge, monogram } of rows) {
    const tr = document.createElement('tr');
    tr.dataset.uid = uid;
    const nameCell = document.createElement('td');
    const player = document.createElement('span');
    player.className = 'player';
    const name = document.createElement('span');
    name.className = 'player__name';
    name.textContent = uid;
    player.append(name);
    if (badge === true) {
      const chip = document.createElement('a');
      chip.className = 'chip chip--badge';
      chip.textContent = 'Some Uni';
      player.append(chip);
    }
    if (monogram === true) {
      const uniBadge = document.createElement('span');
      uniBadge.className = 'uni-badge';
      uniBadge.textContent = 'W';
      player.append(uniBadge);
    }
    nameCell.append(player);
    tr.append(nameCell);
    tbody.append(tr);
  }
  table.append(tbody);
  document.body.replaceChildren(table);
  return table;
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe('applyOwnRowHighlight', () => {
  it('adds the row-self class to the viewer’s row only', () => {
    const root = board([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]);
    applyOwnRowHighlight(root, 'b', true);
    expect(root.querySelector('[data-uid="b"]')?.className).toContain('row-self');
    expect(root.querySelector('[data-uid="a"]')?.className).not.toContain('row-self');
  });

  it('does nothing when the viewer id is null (signed out)', () => {
    const root = board([{ uid: 'a' }]);
    const { badgeMount } = applyOwnRowHighlight(root, null, true);
    expect(root.querySelector('.row-self')).toBeNull();
    expect(badgeMount).toBeNull();
  });

  it('does nothing when the viewer is not on the board', () => {
    const root = board([{ uid: 'a' }]);
    const { badgeMount } = applyOwnRowHighlight(root, 'zzz', true);
    expect(root.querySelector('.row-self')).toBeNull();
    expect(badgeMount).toBeNull();
  });

  it('reports the viewer’s own unbadged .player as the affordance mount', () => {
    const root = board([{ uid: 'a', badge: false }]);
    const { badgeMount } = applyOwnRowHighlight(root, 'a', true);
    expect(badgeMount).not.toBeNull();
    expect(badgeMount).toBe(root.querySelector('[data-uid="a"] .player'));
  });

  it('reports no mount when the viewer already has a badge', () => {
    const root = board([{ uid: 'a', badge: true }]);
    const { badgeMount } = applyOwnRowHighlight(root, 'a', true);
    expect(badgeMount).toBeNull();
  });

  it('reports no mount when the viewer already has a CO-3 monogram/logo badge', () => {
    const root = board([{ uid: 'a', monogram: true }]);
    const { badgeMount } = applyOwnRowHighlight(root, 'a', true);
    expect(badgeMount).toBeNull();
  });

  it('reports no mount when badges are hidden (university board)', () => {
    const root = board([{ uid: 'a', badge: false }]);
    const { badgeMount } = applyOwnRowHighlight(root, 'a', false);
    expect(badgeMount).toBeNull();
    // The row is still highlighted, though.
    expect(root.querySelector('[data-uid="a"]')?.className).toContain('row-self');
  });

  it('reports no mount when an affordance is already present (idempotent)', () => {
    const root = board([{ uid: 'a', badge: false }]);
    const existing = document.createElement('a');
    existing.className = 'chip chip--add';
    root.querySelector('[data-uid="a"] .player')?.append(existing);
    const { badgeMount } = applyOwnRowHighlight(root, 'a', true);
    expect(badgeMount).toBeNull();
  });
});
