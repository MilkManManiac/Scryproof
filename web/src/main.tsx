/**
 * Entry point.
 *
 * StrictMode is on deliberately: it double-invokes effects in development,
 * which is exactly the pressure that exposes a gateway client that leaks a
 * socket per mount. Better to find that here than on the box.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
// Sets data-theme on <html> as a side effect, before anything is drawn.
import './lib/theme';
import { Ambient } from './components/Ambient';
import { registerServiceWorker } from './lib/install';
import { noteFirstVisit } from './lib/whats-new';
import './styles.css';

// Makes the site installable on a phone. It caches nothing; see sw.js.
registerServiceWorker();
noteFirstVisit();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root.');

createRoot(root).render(
  <StrictMode>
    {/* The room behind every screen: painted once, fixed, never scrolled,
        and, when the theme asks, moving a little. */}
    <Ambient />
    <App />
  </StrictMode>,
);
