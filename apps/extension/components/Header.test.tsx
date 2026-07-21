import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CaptureFailedBanner } from './CaptureFailedBanner.js';
import { Header } from './Header.js';

afterEach(cleanup);

describe('Header', () => {
  it('renders the wordmark', () => {
    render(<Header />);
    expect(screen.getByText('ZetaLog')).toBeTruthy();
  });
});

describe('CaptureFailedBanner', () => {
  it('renders the recorder-update message', () => {
    render(<CaptureFailedBanner />);
    expect(screen.getByText(/Recorder needs an update/i)).toBeTruthy();
  });
});
