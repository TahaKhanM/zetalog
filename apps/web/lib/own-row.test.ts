// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { applyOwnRowHighlight } from './own-row';

/**
 * The public boards are cached HTML with no viewer identity baked in. This pure
 * DOM helper is what the client `ViewerRowHighlight` runs after hydration to
 * personalise the cached table for the signed-in viewer — highlight their row
 * and (on the global board) offer the "add badge" affordance.
 */

function board(rows: { uid: string; badge?: boolean }[]): HTMLElement {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const { uid, badge } of rows) {
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
    applyOwnRowHighlight(root, null, true);
    expect(root.querySelector('.row-self')).toBeNull();
    expect(root.querySelector('.chip--add')).toBeNull();
  });

  it('does nothing when the viewer is not on the board', () => {
    const root = board([{ uid: 'a' }]);
    applyOwnRowHighlight(root, 'zzz', true);
    expect(root.querySelector('.row-self')).toBeNull();
  });

  it('offers the add-badge affordance on the viewer’s own unbadged row', () => {
    const root = board([{ uid: 'a', badge: false }]);
    applyOwnRowHighlight(root, 'a', true);
    const chip = root.querySelector('[data-uid="a"] .chip--add');
    expect(chip).not.toBeNull();
    expect(chip?.getAttribute('href')).toBe('/verify');
  });

  it('does not offer the affordance when the viewer already has a badge', () => {
    const root = board([{ uid: 'a', badge: true }]);
    applyOwnRowHighlight(root, 'a', true);
    expect(root.querySelector('.chip--add')).toBeNull();
  });

  it('does not offer the affordance when badges are hidden (university board)', () => {
    const root = board([{ uid: 'a', badge: false }]);
    applyOwnRowHighlight(root, 'a', false);
    expect(root.querySelector('.chip--add')).toBeNull();
    // The row is still highlighted, though.
    expect(root.querySelector('[data-uid="a"]')?.className).toContain('row-self');
  });

  it('is idempotent — a second run does not duplicate the affordance', () => {
    const root = board([{ uid: 'a', badge: false }]);
    applyOwnRowHighlight(root, 'a', true);
    applyOwnRowHighlight(root, 'a', true);
    expect(root.querySelectorAll('.chip--add')).toHaveLength(1);
  });
});
