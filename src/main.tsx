// src/main.tsx
// ─── Application bootstrap ────────────────────────────────────────────────────
//
// Entry point for the React application. Responsibilities:
//   1. Import i18n FIRST — establishes translations before any component renders
//   2. Import the design system — establishes CSS custom props
//   3. Mount the router-aware React tree into the DOM
//   4. Guard against a missing #root element with a clear error
//
// React.StrictMode is intentionally kept in production-equivalent builds.
// It surfaces double-invoke bugs and deprecated API usage at zero runtime cost
// in the compiled bundle (StrictMode effects are dev-only).

import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { MotionConfig } from 'motion/react';

// ── i18n — MUST be imported before any component that calls useTranslation() ──
// This initializes i18next with translations and the browser language detector.
import './i18n';

// Design system — must load before any component styles
import '@/styles/app.css';
import './lib/modelViewer';

// Application router (defines all routes + lazy loading)
import { router } from '@/app/router';

// ── Root element guard ────────────────────────────────────────────────────────

const container = document.getElementById('root');

if (!container) {
  // Throw synchronously so the browser shows a clear error in the console
  // rather than a cryptic "Cannot read properties of null" downstream.
  throw new Error(
    '[main.tsx] Failed to find #root element. ' +
    'Ensure index.html contains <div id="root"></div>.',
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