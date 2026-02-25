// src/router.tsx
import { createBrowserRouter } from 'react-router-dom'
import RootLayout from '@/app/RootLayout'
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard'
import UpdatePassword from '@/pages/UpdatePassword'
import OrderStatusPage from '@/pages/OrderStatus'

// Account
import AccountLayout from '@/pages/Account/AccountLayout'
import AccountHome from '@/pages/Account/AccountHome'
import EditProfile from '@/pages/Account/EditProfile'
import OrderHistory from '@/pages/Account/OrderHistory'

// Public pages
import Home from '@/pages/Home'
import Menu from '@/pages/Menu'
import About from '@/pages/About/About'
import Contact from '@/pages/Contact/Contact'
import Gallery from '@/pages/Gallery/Gallery'
import Catering from '@/pages/Catering/Catering'
import Reservations from '@/pages/Reservations/Reservations'
import Reviews from '@/pages/Reviews/Reviews'
import Checkout from '@/pages/Checkout'
import OrderSuccess from '@/pages/OrderSuccess'
import OrderCanceled from '@/pages/OrderCanceled'
import PrivacyPolicy from '@/pages/Legal/PrivacyPolicy'
import TermsOfService from '@/pages/Legal/TermsOfService'
import RefundPolicy from '@/pages/Legal/RefundPolicy'

// Admin
import AdminDashboard from '@/pages/Admin/Dashboard'
import AdminOrders from '@/pages/Admin/Orders'
import AdminMenuEditor from '@/pages/Admin/MenuEditor'
import AdminLayout from '@/pages/Admin/AdminLayout'
// Kitchen (NEW)
import KitchenScreen from '@/features/orders/KitchenScreen'

import NotFound from '@/pages/NotFound'

import ExpoCommandCenter from "@/features/orders/ExpoCommandCenter";

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <NotFound />,
    children: [
      // ==================================================
      // PUBLIC
      // ==================================================
      { index: true, element: <Home /> },
      { path: 'menu', element: <Menu /> },
      { path: 'about', element: <About /> },
      { path: 'contact', element: <Contact /> },
      { path: 'gallery', element: <Gallery /> },
      { path: 'catering', element: <Catering /> },
      { path: 'reservations', element: <Reservations /> },
      { path: 'reviews', element: <Reviews /> },

      // ==================================================
      // ACCOUNT (AUTH REQUIRED)
      // ==================================================
      {
        path: 'account',
        element: (
          <AuthGuard requireAuth>
            <AccountLayout />
          </AuthGuard>
        ),
        children: [
          { index: true, element: <AccountHome /> },
          { path: 'edit', element: <EditProfile /> },
          { path: 'orders', element: <OrderHistory /> },
        ],
      },
       
      // ==================================================
      // CHECKOUT (AUTH REQUIRED)
      // ==================================================
      {
        path: 'checkout',
        element: (
          <AuthGuard requireAuth>
            <Checkout />
          </AuthGuard>
        ),
      },

      // ==================================================
      // STRIPE RESULTS
      // ==================================================
      { path: 'order-success', element: <OrderSuccess /> },
      { path: 'order-canceled', element: <OrderCanceled /> },
      // ==================================================
// ORDER TRACKING (PUBLIC)
// ==================================================
{ path: 'order-status/:orderId', element: <OrderStatusPage /> },
      // ==================================================
      // PASSWORD
      // ==================================================
      { path: 'update-password', element: <UpdatePassword /> },

      // ==================================================
      // LEGAL
      // ==================================================
      { path: 'privacy-policy', element: <PrivacyPolicy /> },
      { path: 'terms-of-service', element: <TermsOfService /> },
      { path: 'refund-policy', element: <RefundPolicy /> },

      // ==================================================
      // KITCHEN (ADMIN ONLY) - NEW
      // ==================================================
      {
        path: 'kitchen',
        element: (
          <RoleGuard allowedRoles={['admin','staff']}>
            <KitchenScreen />
          </RoleGuard>
        ),
      },
          // ==================================================
// ADMIN (ADMIN ONLY)
// ==================================================
{
  path: 'admin',
  element: (
    <AuthGuard requireAdmin>
      <AdminLayout />
    </AuthGuard>
  ),
  children: [
    { index: true, element: <AdminDashboard /> },
    { path: 'orders', element: <AdminOrders /> },
    { path: 'menu', element: <AdminMenuEditor /> },
  ],
},
         // ==================================================
// EXPO (ADMIN + STAFF)
// ==================================================
{
  path: 'expo',
  element: (
    <RoleGuard allowedRoles={['admin', 'staff']}>
      <ExpoCommandCenter />
    </RoleGuard>
  ),
},
 
      // ==================================================
      // ADMIN (ADMIN ONLY)
      // ==================================================
      {
        path: 'admin',
        element: (
          <AuthGuard requireAdmin>
            <AdminDashboard />
          </AuthGuard>
        ),
        children: [
          { path: 'orders', element: <AdminOrders /> },
          { path: 'menu', element: <AdminMenuEditor /> },
        ],
      },

      // ==================================================
      // FALLBACK
      // ==================================================
      { path: '*', element: <NotFound /> },
    ],
  },
])