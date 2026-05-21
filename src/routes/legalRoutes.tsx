// src/routes/legalRoutes.tsx
// =============================================================================
// LEGAL ROUTES — Route definitions for all legal/policy pages.
// =============================================================================
//
// Usage: spread these into your existing route array in the app router.
//
//   import { legalRoutes } from '@/routes/legalRoutes';
//
//   const routes = [
//     ...existingRoutes,
//     ...legalRoutes,
//   ];
//
// All pages are lazy-loaded to keep the initial bundle small.
// =============================================================================

import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';

const PrivacyPolicyPage = lazy(() => import('@/pages/legal/PrivacyPolicyPage'));
const TermsOfServicePage = lazy(() => import('@/pages/legal/TermsOfServicePage'));
const MobileOrderPaymentTermsPage = lazy(
  () => import('@/pages/legal/MobileOrderPaymentTermsPage'),
);
const RewardsTermsPage = lazy(() => import('@/pages/legal/RewardsTermsPage'));
const RefundPolicyPage = lazy(() => import('@/pages/legal/RefundPolicyPage'));

export const legalRoutes: RouteObject[] = [
  {
    path: '/privacy-policy',
    element: <PrivacyPolicyPage />,
  },
  {
    path: '/terms-of-service',
    element: <TermsOfServicePage />,
  },
  {
    path: '/mobile-order-payment-terms',
    element: <MobileOrderPaymentTermsPage />,
  },
  {
    path: '/rewards-terms',
    element: <RewardsTermsPage />,
  },
  {
    path: '/refund-policy',
    element: <RefundPolicyPage />,
  },
];