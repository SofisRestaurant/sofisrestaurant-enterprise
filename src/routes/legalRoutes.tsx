// src/routes/legalRoutes.tsx
// =============================================================================
// LEGAL ROUTES — Route definitions for all legal/policy pages.
// =============================================================================
//
// These routes are already registered inline in src/app/router.tsx.
// This file exists as a standalone reference and can be spread into
// any createBrowserRouter configuration that doesn't use router.tsx:
//
//   import { legalRoutes } from '@/routes/legalRoutes';
//
//   const router = createBrowserRouter([
//     { path: '/', children: [...otherRoutes, ...legalRoutes] }
//   ]);
//
// IMPORTANT: These use the `lazy` property (async () => { Component })
// which is the correct pattern for createBrowserRouter. Do NOT use
// React.lazy() + element — that pattern is incompatible.
// =============================================================================

import type { RouteObject } from 'react-router-dom';

export const legalRoutes: RouteObject[] = [
  {
    path: 'privacy-policy',
    lazy: async () => {
      const mod = await import('@/pages/legal/PrivacyPolicyPage');
      return { Component: mod.default };
    },
  },
  {
    path: 'terms-of-service',
    lazy: async () => {
      const mod = await import('@/pages/legal/TermsOfServicePage');
      return { Component: mod.default };
    },
  },
  {
    path: 'mobile-order-payment-terms',
    lazy: async () => {
      const mod = await import('@/pages/legal/MobileOrderPaymentTermsPage');
      return { Component: mod.default };
    },
  },
  {
    path: 'rewards-terms',
    lazy: async () => {
      const mod = await import('@/pages/legal/RewardsTermsPage');
      return { Component: mod.default };
    },
  },
  {
    path: 'refund-policy',
    lazy: async () => {
      const mod = await import('@/pages/legal/RefundPolicyPage');
      return { Component: mod.default };
    },
  },
];