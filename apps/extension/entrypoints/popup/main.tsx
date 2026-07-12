// Self-hosted WOFF2 fonts — zero external font requests (spec §8, invariant 7).
// Archivo's wdth axis file carries both weight (100–900) and width (62–125%),
// which the wordmark's font-stretch: 125% requires. Numerals use Azeret Mono
// (plain zero, tabular by construction) per CO-2, weights 400/500/700.
import '@fontsource-variable/archivo/wdth.css';
import '@fontsource/spline-sans/400.css';
import '@fontsource/spline-sans/500.css';
import '@fontsource/spline-sans/600.css';
import '@fontsource/azeret-mono/400.css';
import '@fontsource/azeret-mono/500.css';
import '@fontsource/azeret-mono/700.css';
import './style.css';

import { palette, typography } from '@zetalog/shared';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

// Palette hexes and font families come from the shared design tokens — the only
// place they are allowed to originate (invariant 7). Everything else references
// the resulting --zl-* custom properties.
const root = document.documentElement.style;
root.setProperty('--zl-maroon', palette.maroon);
root.setProperty('--zl-red', palette.red);
root.setProperty('--zl-cream', palette.cream);
root.setProperty('--zl-navy', palette.navy);
root.setProperty('--zl-steel-blue', palette.steelBlue);
root.setProperty(
  '--zl-font-display',
  `'${typography.display.family} Variable', '${typography.display.family}', sans-serif`,
);
root.setProperty('--zl-font-body', `'${typography.body.family}', sans-serif`);
root.setProperty('--zl-font-mono', `'${typography.numeric.family}', monospace`);

const container = document.getElementById('root');
if (container === null) throw new Error('popup root element missing');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
