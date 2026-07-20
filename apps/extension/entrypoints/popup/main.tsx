import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

const container = document.getElementById('root');
if (container === null) throw new Error('popup root element missing');
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
