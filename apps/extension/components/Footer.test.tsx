import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Footer } from './Footer.js';

afterEach(cleanup);

describe('Footer', () => {
  it('invokes onSync when the sync button is pressed', () => {
    const onSync = vi.fn();
    render(<Footer onSync={onSync} />);
    fireEvent.click(screen.getByText('Sync to leaderboard'));
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
