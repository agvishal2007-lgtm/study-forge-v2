import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/zilla-slab/500.css';
import '@fontsource/zilla-slab/700.css';
import './styles.css';
import { App } from './App';
import { getActiveAccount } from './data/account';
import { startOffline } from './data/offline';
import { cleanUpInterruptedSaves } from './data/store';

startOffline();
void cleanUpInterruptedSaves().catch(() => undefined);

// Syncing only starts for a student who has signed in.
if (getActiveAccount()) void import('./data/sync').then(({ startSync }) => startSync()).catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
