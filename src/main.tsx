// src/main.tsx
// ─── Application bootstrap ────────────────────────────────────────────────────

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'motion/react';

// ── i18n — MUST be imported before any component that calls useTranslation() ──
import './i18n';

// Design system — must load before any component styles
import '@/styles/app.css';

// Application router (defines all routes + lazy loading)
import { router } from '@/app/router';

// ── Root element guard ────────────────────────────────────────────────────────
const container = document.getElementById('root');

if (!container) {
  throw new Error(
    '[main.tsx] Failed to find #root element. Ensure index.html contains <div id="root"></div>.',
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────────
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
    </MotionConfig>
  </React.StrictMode>,
);